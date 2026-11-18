-- Splits the client dashboard's reply analytics by WHO sent the reply, and measures first-reply
-- time only for conversations that started in the selected period.
--
-- Replaces cx_copilot.orb_brand_analytics (created by 20261119_brand_analytics.sql). It only
-- READS existing tables and changes no data. Safe to run more than once.
--
-- Every outbound message (chat_messages.role = 'agent') is put in exactly one group, using
-- markers already written onto the message by the sending pipeline:
--   ai         meta_data.ai_confirmed is true (the AI agent confirmed it sent this message)
--   team       a person sent it: provider_source 'dashboard' / 'webhook_linked', or the message
--              carries the sending team member in meta_data.agent
--   automated  a Zoko flow / automation (meta_data.raw.appType = 'flow')
--   other      anything else: sent outside Orb (for example straight from the WhatsApp or
--              Instagram app) or sent by the API without an AI confirmation. Reported openly
--              rather than guessed into one of the groups above.
-- Checked on real data: the ai and team markers never appear on the same message.
--
-- First-reply time used to look at every conversation with a customer message in the window, so
-- a conversation that began earlier was measured from a later message. It now covers only
-- conversations that started in the window, so the customer's first message is really their
-- first. The sender of that first reply is reported too.

CREATE OR REPLACE FUNCTION cx_copilot.orb_brand_analytics(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text DEFAULT 'Asia/Kolkata'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH
-- Messages in the window, customer and reply sides only (system template events are noise).
-- `sender` is only set for replies. meta_data can be large (it holds raw webhook payloads), so
-- only the three small markers are read from it and never copied out.
msg AS MATERIALIZED (
  SELECT m.conversation_id, m.role::text AS role, m.provider_source, m."timestamp" AS ts,
         CASE
           WHEN m.role::text <> 'agent' THEN NULL
           WHEN m.meta_data -> 'ai_confirmed' = 'true'::jsonb THEN 'ai'
           WHEN m.provider_source IN ('dashboard', 'webhook_linked')
                OR nullif(m.meta_data ->> 'agent', '') IS NOT NULL THEN 'team'
           WHEN m.meta_data #>> '{raw,appType}' = 'flow' THEN 'automated'
           ELSE 'other'
         END AS sender
  FROM cx_copilot.chat_messages m
  WHERE m.brand_id = p_brand_id
    AND m."timestamp" >= p_from AND m."timestamp" < p_to
    AND m.role::text IN ('customer', 'agent')
),
-- Conversations (threads) that started in the window.
-- Thread rows carry a large raw payload in meta_data, so only the two small pieces needed
-- (topic tags and product mentions) are copied out, never the whole column.
thr AS MATERIALIZED (
  SELECT t.id, t.conversation_id, t.platform, t.created_at, t.resolved_at,
         CASE WHEN jsonb_typeof(t.meta_data -> 'genie_auto_tags') = 'array' THEN t.meta_data -> 'genie_auto_tags' END AS tags,
         CASE WHEN jsonb_typeof(t.meta_data -> 'genie_product_mentions') = 'array' THEN t.meta_data -> 'genie_product_mentions' END AS mentions
  FROM cx_copilot.chat_threads t
  WHERE t.brand_id = p_brand_id AND t.created_at >= p_from AND t.created_at < p_to
),
active AS (
  SELECT DISTINCT conversation_id FROM msg WHERE role = 'customer' AND conversation_id IS NOT NULL
),
esc_rows AS (
  SELECT e.conversation_id
  FROM cx_copilot.ai_escalations e
  WHERE e.brand_id = p_brand_id::text AND e.created_at >= p_from AND e.created_at < p_to
),
-- For each ACTIVE conversation: did the AI reply, did the team reply, did anything reply at all.
handling AS (
  SELECT a.conversation_id,
         coalesce(bool_or(m.sender = 'ai'), false) AS has_ai,
         coalesce(bool_or(m.sender = 'team'), false) AS has_team,
         coalesce(bool_or(m.role = 'agent'), false) AS has_any
  FROM active a
  LEFT JOIN msg m ON m.conversation_id = a.conversation_id AND m.role = 'agent'
  GROUP BY a.conversation_id
),
-- The first message sent back after the customer's first message, for conversations that started
-- in the window, in ONE pass over the messages (a self-join timed out on large brands).
first_reply AS (
  SELECT DISTINCT ON (w.conversation_id)
         w.conversation_id, w.sender,
         extract(epoch FROM (w.ts - w.first_in)) AS secs
  FROM (
    SELECT conversation_id, role, sender, ts,
           min(ts) FILTER (WHERE role = 'customer') OVER (PARTITION BY conversation_id) AS first_in
    FROM msg WHERE conversation_id IS NOT NULL
  ) w
  JOIN (SELECT DISTINCT conversation_id FROM thr) st ON st.conversation_id = w.conversation_id
  WHERE w.role = 'agent' AND w.first_in IS NOT NULL AND w.ts > w.first_in
  ORDER BY w.conversation_id, w.ts, w.sender
),
first_by_sender AS (
  SELECT sender, count(*) AS n,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY secs))::numeric, 0) AS median_seconds,
         round((percentile_cont(0.9) WITHIN GROUP (ORDER BY secs))::numeric, 0) AS p90_seconds
  FROM first_reply GROUP BY sender
),
days AS (
  SELECT d::date AS day
  FROM generate_series(
    (p_from AT TIME ZONE p_tz)::date,
    ((p_to - interval '1 second') AT TIME ZONE p_tz)::date,
    interval '1 day'
  ) AS d
),
msg_day AS (
  SELECT (ts AT TIME ZONE p_tz)::date AS day,
         count(*) FILTER (WHERE role = 'customer') AS customer,
         count(*) FILTER (WHERE role = 'agent') AS replies,
         count(*) FILTER (WHERE sender = 'ai') AS ai,
         count(*) FILTER (WHERE sender = 'team') AS team,
         count(*) FILTER (WHERE sender = 'automated') AS automated,
         count(*) FILTER (WHERE sender = 'other') AS other
  FROM msg GROUP BY 1
),
thr_day AS (
  SELECT (created_at AT TIME ZONE p_tz)::date AS day, count(*) AS conversations FROM thr GROUP BY 1
),
hours AS (
  SELECT h FROM generate_series(0, 23) AS h
),
msg_hour AS (
  SELECT extract(hour FROM ts AT TIME ZONE p_tz)::int AS h, count(*) AS n
  FROM msg WHERE role = 'customer' GROUP BY 1
),
-- Topic tags are written onto the thread by the AI tagger; not every thread is tagged yet,
-- so the response also reports how many were.
topic_rows AS (
  SELECT tag, count(*) AS n
  FROM thr
  CROSS JOIN LATERAL jsonb_array_elements_text(thr.tags) AS tag
  WHERE thr.tags IS NOT NULL
  GROUP BY tag ORDER BY n DESC, tag LIMIT 10
),
product_rows AS (
  SELECT coalesce(mention ->> 'product_id', mention ->> 'handle', mention ->> 'title') AS product_key,
         max(mention ->> 'title') AS title,
         max(mention ->> 'handle') AS handle,
         max(mention ->> 'image_url') AS image_url,
         max(mention ->> 'product_url') AS product_url,
         count(DISTINCT thr.id) AS conversations
  FROM thr
  CROSS JOIN LATERAL jsonb_array_elements(thr.mentions) AS mention
  WHERE thr.mentions IS NOT NULL
    AND jsonb_typeof(mention) = 'object'
    AND coalesce(mention ->> 'product_id', mention ->> 'handle', mention ->> 'title') IS NOT NULL
  GROUP BY 1 ORDER BY conversations DESC, title LIMIT 10
),
review_rows AS (
  SELECT lower(coalesce(feedback, 'unknown')) AS feedback, count(*) AS n
  FROM cx_copilot.reply_feedback
  WHERE brand_id = p_brand_id::text AND created_at >= p_from AND created_at < p_to
  GROUP BY 1
),
failure_rows AS (
  SELECT coalesce(failure_category, 'unspecified') AS category, count(*) AS n
  FROM cx_copilot.reply_diagnostics
  WHERE brand_id = p_brand_id AND created_at >= p_from AND created_at < p_to
  GROUP BY 1 ORDER BY n DESC, category LIMIT 8
)
SELECT jsonb_build_object(
  'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', p_tz),
  'conversations', jsonb_build_object(
    'started', (SELECT count(*) FROM thr),
    'active', (SELECT count(*) FROM active),
    'resolved', (SELECT count(*) FROM thr WHERE resolved_at IS NOT NULL),
    'median_hours_to_resolve', (
      SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (resolved_at - created_at)) / 3600.0))::numeric, 1)
      FROM thr WHERE resolved_at IS NOT NULL AND resolved_at >= created_at
    ),
    'by_platform', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'conversations', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT coalesce(platform, 'unknown') AS platform, count(*) AS n FROM thr GROUP BY 1) p
    ),
    -- Active conversations by who answered them. The five groups add up to `active`.
    'handling', jsonb_build_object(
      'ai_only', (SELECT count(*) FROM handling WHERE has_ai AND NOT has_team),
      'ai_and_team', (SELECT count(*) FROM handling WHERE has_ai AND has_team),
      'team_only', (SELECT count(*) FROM handling WHERE has_team AND NOT has_ai),
      'other_only', (SELECT count(*) FROM handling WHERE has_any AND NOT has_ai AND NOT has_team),
      'unanswered', (SELECT count(*) FROM handling WHERE NOT has_any)
    )
  ),
  'messages', jsonb_build_object(
    'customer', (SELECT count(*) FROM msg WHERE role = 'customer'),
    'replies', (SELECT count(*) FROM msg WHERE role = 'agent'),
    'sent_from_dashboard', (SELECT count(*) FROM msg WHERE role = 'agent' AND provider_source = 'dashboard'),
    'by_sender', jsonb_build_object(
      'ai', (SELECT count(*) FROM msg WHERE sender = 'ai'),
      'team', (SELECT count(*) FROM msg WHERE sender = 'team'),
      'automated', (SELECT count(*) FROM msg WHERE sender = 'automated'),
      'other', (SELECT count(*) FROM msg WHERE sender = 'other')
    )
  ),
  'escalations', jsonb_build_object(
    'records', (SELECT count(*) FROM esc_rows),
    'conversations', (SELECT count(DISTINCT conversation_id) FROM esc_rows WHERE conversation_id IS NOT NULL),
    -- Only conversations that also had customer messages in the window, so the share can never
    -- exceed 100% of the conversations it is measured against.
    'conversations_in_active', (SELECT count(DISTINCT e.conversation_id) FROM esc_rows e JOIN active a ON a.conversation_id = e.conversation_id)
  ),
  'first_reply', jsonb_build_object(
    -- Conversations that started in the window and had a customer message in it: the ones a
    -- first reply can be measured for.
    'eligible_conversations', (SELECT count(DISTINCT a.conversation_id) FROM active a JOIN thr ON thr.conversation_id = a.conversation_id),
    'answered_conversations', (SELECT count(*) FROM first_reply),
    'median_seconds', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY secs))::numeric, 0) FROM first_reply),
    'p90_seconds', (SELECT round((percentile_cont(0.9) WITHIN GROUP (ORDER BY secs))::numeric, 0) FROM first_reply),
    'by_sender', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'sender', sender, 'conversations', n, 'median_seconds', median_seconds, 'p90_seconds', p90_seconds
      ) ORDER BY n DESC, sender), '[]'::jsonb)
      FROM first_by_sender
    )
  ),
  'daily', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'conversations', coalesce(td.conversations, 0),
      'customer_messages', coalesce(md.customer, 0),
      'replies', coalesce(md.replies, 0),
      'ai_replies', coalesce(md.ai, 0),
      'team_replies', coalesce(md.team, 0),
      'automated_replies', coalesce(md.automated, 0),
      'other_replies', coalesce(md.other, 0)
    ) ORDER BY d.day), '[]'::jsonb)
    FROM days d LEFT JOIN thr_day td ON td.day = d.day LEFT JOIN msg_day md ON md.day = d.day
  ),
  'hourly', (
    SELECT jsonb_agg(jsonb_build_object('hour', h.h, 'customer_messages', coalesce(mh.n, 0)) ORDER BY h.h)
    FROM hours h LEFT JOIN msg_hour mh ON mh.h = h.h
  ),
  'topics', jsonb_build_object(
    'tagged_conversations', (
      SELECT count(*) FROM thr WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
    ),
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('topic', tag, 'conversations', n) ORDER BY n DESC, tag), '[]'::jsonb) FROM topic_rows)
  ),
  'products', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'key', product_key, 'title', title, 'handle', handle, 'image_url', image_url,
      'product_url', product_url, 'conversations', conversations
    ) ORDER BY conversations DESC, title), '[]'::jsonb)
    FROM product_rows
  ),
  'reviews', jsonb_build_object(
    'up', coalesce((SELECT n FROM review_rows WHERE feedback = 'up'), 0),
    'down', coalesce((SELECT n FROM review_rows WHERE feedback = 'down'), 0),
    'other', coalesce((SELECT sum(n) FROM review_rows WHERE feedback NOT IN ('up', 'down')), 0),
    'failure_categories', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', n) ORDER BY n DESC, category), '[]'::jsonb) FROM failure_rows)
  )
);
$$;

-- Backend only. Never callable with a browser (anon / authenticated) token.
REVOKE ALL ON FUNCTION cx_copilot.orb_brand_analytics(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cx_copilot.orb_brand_analytics(uuid, timestamptz, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION cx_copilot.orb_brand_analytics(uuid, timestamptz, timestamptz, text) TO service_role;
