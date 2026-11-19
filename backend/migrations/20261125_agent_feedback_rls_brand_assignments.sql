-- Align orb_agent_feedback and snapshots RLS policies with modern brand_assignments and staff roles.
-- Ensures authenticated clients assigned to a brand and workspace staff can submit, read,
-- and triage feedback without violating RLS.

-- Ensure helper functions exist with appropriate security context
CREATE OR REPLACE FUNCTION cx_copilot.is_workspace_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cx_copilot, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cx_copilot.orb_profiles profile
    WHERE profile.id = auth.uid()
      AND profile.role IN ('admin', 'agent', 'pod_lead')
  ) OR EXISTS (
    SELECT 1
    FROM cx_copilot.brand_assignments assignment
    WHERE lower(assignment.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND assignment.role IN ('admin', 'agent', 'pod_lead')
  );
$$;

GRANT EXECUTE ON FUNCTION cx_copilot.is_workspace_staff() TO authenticated;

CREATE OR REPLACE FUNCTION cx_copilot.is_brand_assignment_member(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cx_copilot, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cx_copilot.brand_assignments assignment
    WHERE assignment.brand_id = target_brand_id
      AND lower(assignment.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION cx_copilot.is_brand_assignment_member(uuid) TO authenticated;

-- Ensure table privileges
GRANT USAGE ON SCHEMA cx_copilot TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cx_copilot.orb_agent_feedback TO authenticated;
GRANT SELECT, INSERT ON cx_copilot.orb_agent_feedback_snapshots TO authenticated;

ALTER TABLE cx_copilot.orb_agent_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_copilot.orb_agent_feedback_snapshots ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 1. cx_copilot.orb_agent_feedback Policies
--------------------------------------------------------------------------------

-- SELECT: Staff can view all brands; clients can only view feedback for their assigned brands.
DROP POLICY IF EXISTS "orb_agent_feedback_read_brand_shared" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_read_brand_shared"
  ON cx_copilot.orb_agent_feedback FOR SELECT TO authenticated
  USING (
    cx_copilot.is_workspace_staff()
    OR cx_copilot.is_brand_assignment_member(brand_id)
    OR EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_agent_feedback.brand_id
        AND membership.user_id = auth.uid()
    )
  );

-- INSERT: Caller must be the submitted_by user and have access to the brand.
DROP POLICY IF EXISTS "orb_agent_feedback_create_brand_shared" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_create_brand_shared"
  ON cx_copilot.orb_agent_feedback FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND (
      cx_copilot.is_workspace_staff()
      OR cx_copilot.is_brand_assignment_member(brand_id)
      OR EXISTS (
        SELECT 1 FROM cx_copilot.orb_brand_memberships membership
        WHERE membership.brand_id = orb_agent_feedback.brand_id
          AND membership.user_id = auth.uid()
      )
    )
  );

-- UPDATE: Staff can update any feedback for triage/review/delivery sync.
-- Individual users can only update their own feedback within their assigned brand.
DROP POLICY IF EXISTS "orb_agent_feedback_update_admin" ON cx_copilot.orb_agent_feedback;
DROP POLICY IF EXISTS "orb_agent_feedback_update_authorized" ON cx_copilot.orb_agent_feedback;
CREATE POLICY "orb_agent_feedback_update_authorized"
  ON cx_copilot.orb_agent_feedback FOR UPDATE TO authenticated
  USING (
    cx_copilot.is_workspace_staff()
    OR (
      submitted_by = auth.uid()
      AND (
        cx_copilot.is_brand_assignment_member(brand_id)
        OR EXISTS (
          SELECT 1 FROM cx_copilot.orb_brand_memberships membership
          WHERE membership.brand_id = orb_agent_feedback.brand_id
            AND membership.user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    cx_copilot.is_workspace_staff()
    OR (
      submitted_by = auth.uid()
      AND (
        cx_copilot.is_brand_assignment_member(brand_id)
        OR EXISTS (
          SELECT 1 FROM cx_copilot.orb_brand_memberships membership
          WHERE membership.brand_id = orb_agent_feedback.brand_id
            AND membership.user_id = auth.uid()
        )
      )
    )
  );

--------------------------------------------------------------------------------
-- 2. cx_copilot.orb_agent_feedback_snapshots Policies
--------------------------------------------------------------------------------

-- SELECT: Staff can read snapshots across all brands; clients can read snapshots for their assigned brands.
DROP POLICY IF EXISTS "orb_agent_feedback_snapshots_read" ON cx_copilot.orb_agent_feedback_snapshots;
CREATE POLICY "orb_agent_feedback_snapshots_read"
  ON cx_copilot.orb_agent_feedback_snapshots FOR SELECT TO authenticated
  USING (
    cx_copilot.is_workspace_staff()
    OR cx_copilot.is_brand_assignment_member(brand_id)
    OR EXISTS (
      SELECT 1 FROM cx_copilot.orb_brand_memberships membership
      WHERE membership.brand_id = orb_agent_feedback_snapshots.brand_id
        AND membership.user_id = auth.uid()
    )
  );

-- INSERT: Snapshot must match an existing feedback row that the caller is authorized to access.
DROP POLICY IF EXISTS "orb_agent_feedback_snapshots_insert" ON cx_copilot.orb_agent_feedback_snapshots;
CREATE POLICY "orb_agent_feedback_snapshots_insert"
  ON cx_copilot.orb_agent_feedback_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cx_copilot.orb_agent_feedback feedback
      WHERE feedback.id = orb_agent_feedback_snapshots.feedback_id
        AND feedback.brand_id = orb_agent_feedback_snapshots.brand_id
    )
    AND (
      cx_copilot.is_workspace_staff()
      OR cx_copilot.is_brand_assignment_member(brand_id)
      OR EXISTS (
        SELECT 1 FROM cx_copilot.orb_brand_memberships membership
        WHERE membership.brand_id = orb_agent_feedback_snapshots.brand_id
          AND membership.user_id = auth.uid()
      )
    )
  );
