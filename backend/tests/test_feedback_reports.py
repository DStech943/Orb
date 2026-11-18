"""Agent issue reports: validation, redaction, Slack formatting, delivery and endpoints."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs
from uuid import uuid4

import httpx
import pytest
import respx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import feedback_reports as fr
from app.auth import User, current_user

BRAND_ID = "00000000-0000-0000-0000-0000000000b1"
USER = User(id=uuid4(), org_id=uuid4())
PERSON_ID = str(uuid4())


def message(idx: int, role: str = "user", text: str = "hello") -> dict:
    return {"id": f"m{idx}", "role": role, "text": text, "created_at": "2026-11-16T10:00:00Z"}


def report_body(**overrides) -> dict:
    body = {
        "session_id": "orb_0123456789abcdef",
        "category": "hallucination",
        "severity": "medium",
        "description": "The agent made up a refund window.",
        "expected_behavior": "It should quote the policy.",
        "transcript": [message(1), message(2, "agent", "30 days, no questions asked")],
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------- request model
def test_valid_report_parses_and_strips() -> None:
    parsed = fr.AgentIssueReport(**report_body(description="   A real description here.  "))
    assert parsed.description == "A real description here."
    assert parsed.severity == "medium"


@pytest.mark.parametrize(
    "overrides",
    [
        {"description": "too short"},
        {"category": "not_a_category"},
        {"transcript": []},
        {"transcript": [message(i) for i in range(fr.MAX_MESSAGES + 1)]},
        {"transcript": [{**message(1), "role": "system"}]},
        {"session_id": "short"},
        {"tagged_people": [str(uuid4()) for _ in range(fr.MAX_TAGGED_PEOPLE + 1)]},
        {"tagged_people": ["not-a-uuid"]},
        {"unexpected": "field"},
    ],
)
def test_invalid_reports_are_rejected(overrides: dict) -> None:
    with pytest.raises(ValidationError):
        fr.AgentIssueReport(**report_body(**overrides))


def test_oversized_conversation_is_rejected() -> None:
    big = "x" * fr.MAX_MESSAGE_CHARS
    transcript = [message(i, text=big) for i in range(60)]  # 1.2 MB in total
    with pytest.raises(ValidationError, match="too large"):
        fr.AgentIssueReport(**report_body(transcript=transcript))


# -------------------------------------------------------------------- redaction
def test_redaction_masks_personal_data_but_keeps_dates_and_short_numbers() -> None:
    text = "Mail a.b+c@example.co.in, card 4111 1111 1111 1111, call +91 98765 43210, on 2026-11-16, order 1234567."
    redacted = fr.redact_pii(text)
    assert "[email]" in redacted and "example.co.in" not in redacted
    assert "[card]" in redacted and "4111" not in redacted
    assert "[phone]" in redacted and "98765" not in redacted
    assert "2026-11-16" in redacted and "1234567" in redacted


def test_non_luhn_long_number_is_not_called_a_card() -> None:
    assert fr.redact_pii("ref 1234567890123456") == "ref 1234567890123456"


# --------------------------------------------------------------------- snapshot
def test_snapshot_hash_is_stable_and_flags_truncation() -> None:
    a = fr.build_snapshot(fr.AgentIssueReport(**report_body()))
    b = fr.build_snapshot(fr.AgentIssueReport(**report_body()))
    assert a["sha256"] == b["sha256"] and len(a["sha256"]) == 64
    assert a["message_count"] == 2 and a["truncated"] is False
    trimmed = fr.build_snapshot(fr.AgentIssueReport(**report_body(total_message_count=350)))
    assert trimmed["truncated"] is True
    changed = fr.build_snapshot(fr.AgentIssueReport(**report_body(transcript=[message(1, text="different")])))
    assert changed["sha256"] != a["sha256"]


# ------------------------------------------------------------ slack formatting
def stored_report(**overrides) -> dict:
    row = {
        "id": str(uuid4()), "brand_id": BRAND_ID, "submitted_by": str(USER.id), "session_id": "orb_0123456789abcdef",
        "scope": "reply", "message_id": "m2", "agent_reply": "30 days, mail me at x@y.com", "note": "Invented a <!channel> window",
        "ideal_reply": "Quote the policy", "category": "hallucination", "severity": "medium", "kind": "issue_report",
        "agent_metadata": {"agent_name": "Tanya"}, "tagged_people": [{"id": PERSON_ID, "name": "Aarav"}],
        "slack_delivery_status": "pending", "slack_attempts": 0, "slack_message_ts": None, "slack_channel_id": None,
        "created_at": "2026-11-16T10:05:00+00:00",
    }
    row.update(overrides)
    return row


def test_message_blocks_are_safe_and_within_slack_limits() -> None:
    report = stored_report(note="A" * 5000, severity="high")
    text, blocks = fr.build_report_message(
        report=report, brand_name="Laani", agent_name="Tanya", tester="Dev", mentions=["<@U0123ABCDEF>"],
        link="https://orb.example.com/app/reports/brand/abc", message_count=2, truncated=True,
    )
    assert blocks[0]["type"] == "header" and len(blocks[0]["text"]["text"]) <= 150
    for block in blocks:
        if block["type"] == "section" and "text" in block:
            assert len(block["text"]["text"]) <= 3000
    flat = json.dumps(blocks) + text
    assert "<!channel> High-severity" in flat           # only our own marker, for high severity
    assert "<@U0123ABCDEF>" in text                      # tagged person notified
    assert "x@y.com" not in flat and "[email]" in flat   # redacted
    assert "Open in Orb" in flat and "latest messages only" in flat


def test_user_text_cannot_inject_channel_mentions() -> None:
    _, blocks = fr.build_report_message(
        report=stored_report(severity="low"), brand_name="Laani", agent_name="", tester="Dev",
        mentions=[], link="", message_count=2, truncated=False,
    )
    flat = json.dumps(blocks)
    assert "<!channel>" not in flat and "&lt;!channel&gt;" in flat


def test_transcript_marks_reported_reply_redacts_and_respects_size() -> None:
    report = stored_report()
    messages = [message(1, text="my number is +91 98765 43210"), message(2, "agent", "reply")]
    content = fr.format_transcript(report=report, messages=messages, brand_name="Laani", agent_name="Tanya", tester="Dev", max_bytes=100_000).decode()
    assert "<<< REPORTED REPLY" in content and "[phone]" in content and "98765" not in content
    many = [message(i, text="y" * 500) for i in range(50)]
    small = fr.format_transcript(report=report, messages=many, brand_name="B", agent_name="", tester="Dev", max_bytes=5_000)
    assert len(small) <= 5_000 and b"omitted" in small


def test_report_link_requires_a_valid_app_url_and_keeps_ids_in_the_path() -> None:
    assert fr.report_link(SimpleNamespace(orb_app_url=None), "brand", "abc") == ""
    assert fr.report_link(SimpleNamespace(orb_app_url="not a url"), "brand", "abc") == ""
    assert fr.report_link(SimpleNamespace(orb_app_url="javascript:alert(1)"), "brand", "abc") == ""
    # Path, not query: the sign-in redirect keeps only the path.
    assert fr.report_link(SimpleNamespace(orb_app_url="https://orb.example.com/"), "brand", "abc") == "https://orb.example.com/app/reports/brand/abc"


# -------------------------------------------------------------------- delivery
class FakeDb:
    """In-memory stand-in for the Supabase REST helpers."""

    def __init__(self) -> None:
        self.feedback: dict[str, dict] = {}
        self.snapshots: dict[str, dict] = {}
        self.fail_snapshot_insert = False
        self.updates: list[dict] = []

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def read(request, table, params):
            if table == "orb_agent_feedback":
                return [self.feedback[params["id"].removeprefix("eq.")]] if params.get("id", "").removeprefix("eq.") in self.feedback else []
            if table == "orb_agent_feedback_snapshots":
                return [self.snapshots[k] for k in self.snapshots if k == params["feedback_id"].removeprefix("eq.")][:1]
            if table == "brands":
                return [{"name": "Laani", "platform_config": {"ai_agent_name": "Tanya", "slack_channel_id": "C0BRAND0001"}}]
            if table == "orb_profiles":
                return [{"full_name": "Dev Singh"}]
            if table == "orb_slack_users":
                return [{"slack_user_id": "U0123ABCDEF"}]
            return []

        async def record(request, feedback_id, values):
            self.updates.append(dict(values))
            self.feedback[feedback_id].update(values)

        monkeypatch.setattr(fr, "_read", read)
        monkeypatch.setattr(fr, "_record", record)


def settings(**overrides):
    base = dict(slack_bot_token="xoxb-test", slack_channel_id="C0DEFAULT01", slack_max_file_bytes=1_000_000, orb_app_url="https://orb.example.com", env="dev")
    base.update(overrides)
    return SimpleNamespace(**base)


def fake_request(cfg):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=cfg)))


def seed(db: FakeDb, **overrides) -> str:
    report = stored_report(**overrides)
    db.feedback[report["id"]] = report
    db.snapshots[report["id"]] = {"messages": [message(1), message(2, "agent", "30 days")], "message_count": 2, "truncated": False}
    return report["id"]


def _form_only(ok_body: dict, error: str = "invalid_arguments"):
    """Behave like Slack's upload methods: a JSON body is rejected, form fields are accepted."""
    def respond(request: httpx.Request) -> httpx.Response:
        if request.headers.get("content-type", "").startswith("application/json"):
            return httpx.Response(200, json={"ok": False, "error": error})
        return httpx.Response(200, json=ok_body)
    return respond


def mock_slack(router: respx.MockRouter, *, post_error: str | None = None, upload_ok: bool = True, complete_error: str | None = None):
    post_body = {"ok": False, "error": post_error} if post_error else {"ok": True, "ts": "1700000000.000100"}
    post = router.post("https://slack.com/api/chat.postMessage").mock(return_value=httpx.Response(200, json=post_body))
    router.post("https://slack.com/api/files.getUploadURLExternal").mock(
        side_effect=_form_only({"ok": True, "upload_url": "https://files.slack.com/upload/v1/abc", "file_id": "F0001"})
    )
    router.post("https://files.slack.com/upload/v1/abc").mock(return_value=httpx.Response(200 if upload_ok else 500))
    complete = router.post("https://slack.com/api/files.completeUploadExternal").mock(
        side_effect=_form_only({"ok": False, "error": complete_error} if complete_error else {"ok": True})
    )
    return post, complete


@pytest.mark.asyncio
async def test_delivery_posts_message_then_uploads_transcript_in_thread(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db)
    with respx.mock(assert_all_called=False) as router:
        post, complete = mock_slack(router)
        await fr.deliver_report_to_slack(fake_request(settings()), feedback_id)
    sent = json.loads(post.calls[0].request.content)
    assert sent["channel"] == "C0BRAND0001" and "<@U0123ABCDEF>" in sent["text"]   # brand channel wins
    assert f"https://orb.example.com/app/reports/{BRAND_ID}/{feedback_id}" in json.dumps(sent["blocks"])
    fields = parse_qs(complete.calls[0].request.content.decode())          # form-encoded, as Slack requires
    assert fields["thread_ts"] == ["1700000000.000100"] and fields["channel_id"] == ["C0BRAND0001"]
    assert json.loads(fields["files"][0]) == [{"id": "F0001", "title": f"conversation-{feedback_id[:8]}.txt"}]
    assert db.updates[0]["slack_message_ts"] == "1700000000.000100"                  # progress saved before the upload
    assert db.feedback[feedback_id]["slack_delivery_status"] == "sent" and db.feedback[feedback_id]["slack_last_error"] is None


@pytest.mark.asyncio
async def test_slack_outage_keeps_the_report_and_marks_it_failed(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db)
    with respx.mock(assert_all_called=False) as router:
        mock_slack(router, post_error="channel_not_found")
        await fr.deliver_report_to_slack(fake_request(settings()), feedback_id)
    row = db.feedback[feedback_id]
    assert row["slack_delivery_status"] == "failed" and row["slack_attempts"] == 1
    assert row["slack_last_error"] == "Slack chat.postMessage failed: channel_not_found"   # Slack's code, so an admin knows what to fix
    assert "xoxb" not in row["slack_last_error"]


@pytest.mark.asyncio
async def test_failed_transcript_upload_keeps_the_posted_message_and_reports_slacks_reason(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db)
    with respx.mock(assert_all_called=False) as router:
        post, _ = mock_slack(router, complete_error="not_in_channel")
        await fr.deliver_report_to_slack(fake_request(settings()), feedback_id)
    row = db.feedback[feedback_id]
    assert row["slack_delivery_status"] == "failed" and row["slack_message_ts"] == "1700000000.000100"
    assert row["slack_last_error"] == "Slack files.completeUploadExternal failed: not_in_channel"
    assert post.call_count == 1


@pytest.mark.asyncio
async def test_upload_helper_sends_form_fields_not_json() -> None:
    """Regression: Slack answers `invalid_arguments` when the upload methods get a JSON body."""
    from app.services import slack as slack_service

    with respx.mock(assert_all_called=False) as router:
        mock_slack(router)
        async with httpx.AsyncClient() as client:
            await slack_service.upload_file(client, "xoxb-test", channel_id="C1", filename="a.txt", content=b"hi", content_type="text/plain", thread_ts="1.2")
        first = router.calls[0].request
        assert first.headers["content-type"].startswith("application/x-www-form-urlencoded")
        assert parse_qs(first.content.decode()) == {"filename": ["a.txt"], "length": ["2"]}


@pytest.mark.asyncio
async def test_retry_after_a_failed_upload_does_not_repost_the_message(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db, slack_message_ts="1700000000.000100", slack_channel_id="C0BRAND0001", slack_delivery_status="failed", slack_attempts=1)
    with respx.mock(assert_all_called=False) as router:
        post, complete = mock_slack(router)
        await fr.deliver_report_to_slack(fake_request(settings()), feedback_id)
    assert post.call_count == 0 and complete.call_count == 1
    assert db.feedback[feedback_id]["slack_delivery_status"] == "sent" and db.feedback[feedback_id]["slack_attempts"] == 2


@pytest.mark.asyncio
async def test_missing_token_is_recorded_not_raised(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db)
    await fr.deliver_report_to_slack(fake_request(settings(slack_bot_token=None)), feedback_id)
    assert db.feedback[feedback_id]["slack_delivery_status"] == "failed"
    assert "SLACK_BOT_TOKEN" in db.feedback[feedback_id]["slack_last_error"]


@pytest.mark.asyncio
async def test_unexpected_error_never_escapes_the_background_task(monkeypatch) -> None:
    db = FakeDb(); db.install(monkeypatch)
    feedback_id = seed(db)

    async def boom(*args, **kwargs):
        raise RuntimeError("database exploded")

    monkeypatch.setattr(fr, "_deliver", boom)
    await fr.deliver_report_to_slack(fake_request(settings()), feedback_id)
    assert db.feedback[feedback_id]["slack_delivery_status"] == "failed"


# ------------------------------------------------------------------- endpoints
@pytest.fixture
def api(monkeypatch):
    db = FakeDb()
    delivered: list[str] = []

    async def remote_brand(request, brand_id):
        return {"id": BRAND_ID, "name": "Laani", "platform_config": {"ai_agent_name": "Tanya", "ai_support_agent_url": "https://agent.example.com"}}

    async def find_by_key(request, user, key):
        return next((r for r in db.feedback.values() if r.get("idempotency_key") == key), None)

    async def snapshot_exists(request, feedback_id):
        return feedback_id in db.snapshots

    async def insert_snapshot(request, feedback_id, brand_id, snapshot):
        if db.fail_snapshot_insert:
            raise HTTPException(status_code=503, detail="boom")
        db.snapshots[feedback_id] = snapshot

    async def write(request, method, table, *, params=None, payload=None, prefer=None):
        assert table == "orb_agent_feedback" and method == "POST"
        row = {"id": str(uuid4()), "created_at": "2026-11-16T10:00:00+00:00", "status": "open", **payload}
        db.feedback[row["id"]] = row
        return [row]

    async def directory(request, brand_id):
        return [{"id": PERSON_ID, "name": "Aarav Mehta", "role": "Admin", "avatar_key": "", "slack_user_id": "U0123ABCDEF"}]

    async def record(request, feedback_id, values):
        db.feedback[feedback_id].update(values)

    async def deliver(request, feedback_id):
        delivered.append(feedback_id)

    for name, fn in {
        "_remote_brand": remote_brand, "_find_by_key": find_by_key, "_snapshot_exists": snapshot_exists,
        "_insert_snapshot": insert_snapshot, "_supabase_write": write, "_directory": directory, "_record": record,
        "deliver_report_to_slack": deliver,
    }.items():
        monkeypatch.setattr(fr, name, fn)

    app = FastAPI()
    app.state.settings = settings()
    app.include_router(fr.router)
    app.dependency_overrides[current_user] = lambda: USER
    client = TestClient(app)
    client.db, client.delivered = db, delivered
    return client


URL = f"/api/brands/{BRAND_ID}/agent-feedback/report"


def test_report_is_saved_with_snapshot_and_delivery_is_queued(api) -> None:
    response = api.post(URL, json=report_body(message_id="m2", tagged_people=[PERSON_ID]), headers={"Idempotency-Key": "key-0001-abcdef"})
    assert response.status_code == 201
    saved = response.json()["feedback"]
    assert saved["kind"] == "issue_report" and saved["category"] == "hallucination" and saved["slack_delivery_status"] == "pending"
    assert saved["tagged_people"] == [{"id": PERSON_ID, "name": "Aarav Mehta"}]
    row = api.db.feedback[saved["id"]]
    assert row["scope"] == "reply" and row["agent_reply"] == "30 days, no questions asked"   # taken from the transcript, not trusted from the client
    assert row["agent_metadata"]["agent_host"] == "agent.example.com"
    assert saved["id"] in api.db.snapshots and len(api.db.snapshots[saved["id"]]["sha256"]) == 64
    assert api.delivered == [saved["id"]]


def test_repeating_the_same_key_returns_the_same_report_without_a_second_delivery(api) -> None:
    headers = {"Idempotency-Key": "key-0002-abcdef"}
    first = api.post(URL, json=report_body(), headers=headers)
    second = api.post(URL, json=report_body(), headers=headers)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["feedback"]["id"] == second.json()["feedback"]["id"]
    assert len(api.db.feedback) == 1 and len(api.delivered) == 1


def test_reported_reply_must_be_an_agent_message_in_the_transcript(api) -> None:
    assert api.post(URL, json=report_body(message_id="m1")).status_code == 422        # a tester message
    assert api.post(URL, json=report_body(message_id="nope")).status_code == 422      # not in the transcript
    assert not api.db.feedback


def test_unknown_tagged_teammate_is_rejected_before_anything_is_saved(api) -> None:
    response = api.post(URL, json=report_body(tagged_people=[str(uuid4())]))
    assert response.status_code == 422 and not api.db.feedback


def test_snapshot_failure_marks_the_report_and_a_retry_completes_it(api) -> None:
    headers = {"Idempotency-Key": "key-0003-abcdef"}
    api.db.fail_snapshot_insert = True
    failed = api.post(URL, json=report_body(), headers=headers)
    assert failed.status_code == 503
    (row,) = api.db.feedback.values()
    assert row["slack_delivery_status"] == "failed" and not api.delivered
    api.db.fail_snapshot_insert = False
    retry = api.post(URL, json=report_body(), headers=headers)
    assert retry.status_code == 200 and row["id"] in api.db.snapshots and api.delivered == [row["id"]]


def test_bad_idempotency_key_is_rejected(api) -> None:
    assert api.post(URL, json=report_body(), headers={"Idempotency-Key": "short"}).status_code == 422
    assert api.post(URL, json=report_body(), headers={"Idempotency-Key": "has spaces in it!"}).status_code == 422


def test_people_endpoint_never_exposes_slack_ids(api) -> None:
    response = api.get(f"/api/brands/{BRAND_ID}/slack-people")
    assert response.status_code == 200
    (person,) = response.json()["people"]
    assert person == {"id": PERSON_ID, "name": "Aarav Mehta", "role": "Admin", "avatar_key": ""}
    assert "U0123ABCDEF" not in response.text


def test_output_says_whether_the_slack_message_itself_was_posted() -> None:
    from app.api.knowledge import _agent_feedback_out

    partial = _agent_feedback_out({"id": "x", "slack_delivery_status": "failed", "slack_message_ts": "1700000000.000100"})
    assert partial["slack_delivery_status"] == "failed" and partial["slack_message_posted"] is True
    assert _agent_feedback_out({"id": "x", "slack_delivery_status": "failed", "slack_message_ts": None})["slack_message_posted"] is False
    assert "slack_message_ts" not in partial                     # the raw Slack timestamp is not exposed


# ------------------------------------------------- notes sent to the team (no category)
def test_note_may_be_short_but_a_report_may_not() -> None:
    note = fr.AgentIssueReport(**report_body(category=None, description="Great chat"))
    assert note.category is None
    with pytest.raises(ValidationError, match="at least 10"):
        fr.AgentIssueReport(**report_body(description="too short"))
    with pytest.raises(ValidationError):
        fr.AgentIssueReport(**report_body(category=None, description=""))


def test_note_message_has_no_severity_and_never_pings_the_channel() -> None:
    text, blocks = fr.build_report_message(
        report=stored_report(category=None, severity="high", kind="feedback", note="Nice answer", ideal_reply="", agent_reply="", message_id=None),
        brand_name="Laani", agent_name="Tanya", tester="Dev", mentions=["<@U0123ABCDEF>"], link="", message_count=2, truncated=False,
    )
    flat = json.dumps(blocks)
    assert blocks[0]["text"]["text"] == "Agent feedback note"
    assert "<!channel>" not in flat and "Severity" not in flat and "*Note*" in flat
    assert text.startswith("Agent feedback note on Laani") and "<@U0123ABCDEF>" in text


def test_note_transcript_header_has_no_category_or_severity() -> None:
    content = fr.format_transcript(
        report=stored_report(category=None, severity=None, kind="feedback"), messages=[message(1)],
        brand_name="Laani", agent_name="Tanya", tester="Dev", max_bytes=100_000,
    ).decode()
    assert "FEEDBACK NOTE" in content and "Category:" not in content and "Severity:" not in content


def test_note_is_saved_as_plain_feedback_and_still_sent_to_slack(api) -> None:
    response = api.post(URL, json=report_body(category=None, severity="high", description="Great chat", tagged_people=[PERSON_ID]))
    assert response.status_code == 201
    saved = response.json()["feedback"]
    row = api.db.feedback[saved["id"]]
    assert row["kind"] == "feedback" and row["category"] is None and row["severity"] is None
    assert row["note"] == "Great chat" and row["scope"] == "conversation"
    assert row["slack_delivery_status"] == "pending" and saved["id"] in api.db.snapshots
    assert row["tagged_people"] == [{"id": PERSON_ID, "name": "Aarav Mehta"}]
    assert api.delivered == [saved["id"]]
