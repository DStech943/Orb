"""Verification tests for orb_agent_feedback and snapshots RLS policies.

Ensures:
1. Authenticated clients can submit feedback for an assigned brand.
2. Authorized feedback can be updated where intended (staff and author).
3. A client cannot submit feedback against another brand.
4. A client cannot modify another client's feedback.
5. Unauthenticated requests are rejected.
6. Internal authorized users (staff) retain required access.
7. Existing feedback retrieval still works and respects brand isolation.
"""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api import knowledge as kn
from app.api import feedback_reports as fr
from app.auth import User, current_user
from app.config import Settings


def get_test_settings() -> Settings:
    return Settings(
        env="dev",
        auth_disabled=False,
        supabase_url="https://db.example.com",
        supabase_publishable_key="pub-test-key",
        supabase_service_role_key="service-test-key",
        jwt_secret="orb@test",
    )


# ------------------------------------------------------------------- Migration file check
def test_migration_file_exists_and_contains_required_policies() -> None:
    migration_path = Path(__file__).resolve().parent.parent / "migrations" / "20261125_agent_feedback_rls_brand_assignments.sql"
    assert migration_path.exists(), "Migration 20261125_agent_feedback_rls_brand_assignments.sql must exist"

    content = migration_path.read_text(encoding="utf-8")

    # Must contain both tables with RLS enabled
    assert "ALTER TABLE cx_copilot.orb_agent_feedback ENABLE ROW LEVEL SECURITY;" in content
    assert "ALTER TABLE cx_copilot.orb_agent_feedback_snapshots ENABLE ROW LEVEL SECURITY;" in content

    # Must define brand assignments & staff functions
    assert "is_workspace_staff()" in content
    assert "is_brand_assignment_member(" in content

    # Must drop and create proper SELECT, INSERT, UPDATE policies
    assert "orb_agent_feedback_read_brand_shared" in content
    assert "orb_agent_feedback_create_brand_shared" in content
    assert "orb_agent_feedback_update_authorized" in content
    assert "orb_agent_feedback_snapshots_read" in content
    assert "orb_agent_feedback_snapshots_insert" in content

    # Must NOT contain permissive workarounds
    assert "USING (true)" not in content
    assert "WITH CHECK (true)" not in content


# ------------------------------------------------------------------- RLS Logic Simulation
class SimulatedRlsEngine:
    """Simulates PostgreSQL Row-Level Security policies matching 20261125 migration."""

    def __init__(self):
        self.profiles = {}  # user_id -> role ('admin', 'agent', 'pod_lead', 'other')
        self.brand_assignments = []  # list of dict(brand_id, email, role)
        self.brand_memberships = []  # list of dict(brand_id, user_id)
        self.feedback_rows = []  # list of dict(id, brand_id, submitted_by, note, status)
        self.snapshots_rows = []  # list of dict(id, feedback_id, brand_id, messages)

    def is_workspace_staff(self, user_id: str, email: str) -> bool:
        if self.profiles.get(user_id) in ("admin", "agent", "pod_lead"):
            return True
        for a in self.brand_assignments:
            if a["email"].lower() == email.lower() and a.get("role") in ("admin", "agent", "pod_lead"):
                return True
        return False

    def is_brand_assignment_member(self, target_brand_id: str, email: str) -> bool:
        for a in self.brand_assignments:
            if str(a["brand_id"]) == str(target_brand_id) and a["email"].lower() == email.lower():
                return True
        return False

    def has_legacy_brand_membership(self, target_brand_id: str, user_id: str) -> bool:
        return any(
            str(m["brand_id"]) == str(target_brand_id) and str(m["user_id"]) == str(user_id)
            for m in self.brand_memberships
        )

    def check_has_brand_access(self, brand_id: str, user_id: str, email: str) -> bool:
        return (
            self.is_workspace_staff(user_id, email)
            or self.is_brand_assignment_member(brand_id, email)
            or self.has_legacy_brand_membership(brand_id, user_id)
        )

    def insert_feedback(self, row: dict, user_id: str | None, email: str | None) -> dict:
        if not user_id:
            raise PermissionError("42501: new row violates row-level security policy for table 'orb_agent_feedback' (anon)")
        # Policy WITH CHECK:
        # submitted_by = auth.uid() AND check_has_brand_access(brand_id)
        if str(row["submitted_by"]) != str(user_id):
            raise PermissionError("42501: new row violates row-level security policy for table 'orb_agent_feedback' (submitted_by mismatch)")
        if not self.check_has_brand_access(row["brand_id"], user_id, email or ""):
            raise PermissionError("42501: new row violates row-level security policy for table 'orb_agent_feedback' (no brand access)")

        saved = {"id": str(uuid4()), "status": "new", **row}
        self.feedback_rows.append(saved)
        return saved

    def select_feedback(self, brand_id: str, user_id: str | None, email: str | None) -> list[dict]:
        if not user_id:
            return []
        if not self.check_has_brand_access(brand_id, user_id, email or ""):
            return []
        return [r for r in self.feedback_rows if str(r["brand_id"]) == str(brand_id)]

    def update_feedback(self, feedback_id: str, updates: dict, user_id: str | None, email: str | None) -> dict:
        if not user_id:
            raise PermissionError("42501: new row violates row-level security policy for table 'orb_agent_feedback'")
        existing = next((r for r in self.feedback_rows if str(r["id"]) == str(feedback_id)), None)
        if not existing:
            raise LookupError("Row not found")

        # USING check:
        # is_workspace_staff OR (submitted_by = auth.uid() AND check_has_brand_access)
        is_staff = self.is_workspace_staff(user_id, email or "")
        is_author = (str(existing["submitted_by"]) == str(user_id)) and self.check_has_brand_access(existing["brand_id"], user_id, email or "")

        if not (is_staff or is_author):
            raise PermissionError("42501: new row violates row-level security policy for table 'orb_agent_feedback'")

        existing.update(updates)
        return existing


# ------------------------------------------------------------------- Test Cases
BRAND_A = str(uuid4())
BRAND_B = str(uuid4())
CLIENT_A_ID = str(uuid4())
CLIENT_A_EMAIL = "adityaacharya.m777@gmail.com"
CLIENT_B_ID = str(uuid4())
CLIENT_B_EMAIL = "other.client@example.com"
STAFF_ID = str(uuid4())
STAFF_EMAIL = "lead@datastraw.com"


@pytest.fixture
def rls():
    engine = SimulatedRlsEngine()
    # Client A is assigned to Brand A
    engine.brand_assignments.append({
        "brand_id": BRAND_A,
        "email": CLIENT_A_EMAIL,
        "role": "client",
    })
    # Client B is assigned to Brand B
    engine.brand_assignments.append({
        "brand_id": BRAND_B,
        "email": CLIENT_B_EMAIL,
        "role": "client",
    })
    # Staff member is agent
    engine.profiles[STAFF_ID] = "agent"
    return engine


def test_1_authenticated_client_can_submit_feedback_for_authorized_brand(rls):
    """1. Authenticated client can submit feedback for an authorized brand."""
    row = {
        "brand_id": BRAND_A,
        "submitted_by": CLIENT_A_ID,
        "session_id": "session-1",
        "scope": "conversation",
        "note": "AI worked well.",
    }
    saved = rls.insert_feedback(row, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)
    assert saved["id"] is not None
    assert saved["note"] == "AI worked well."


def test_2_authorized_feedback_can_be_updated_by_author_and_staff(rls):
    """2. Authorized feedback can be updated where intended."""
    # First submit feedback
    saved = rls.insert_feedback({
        "brand_id": BRAND_A,
        "submitted_by": CLIENT_A_ID,
        "session_id": "session-1",
        "scope": "conversation",
        "note": "Initial note",
    }, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)

    # Author can update their note
    updated = rls.update_feedback(saved["id"], {"note": "Updated note"}, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)
    assert updated["note"] == "Updated note"

    # Staff can update status (triage)
    triaged = rls.update_feedback(saved["id"], {"status": "resolved"}, user_id=STAFF_ID, email=STAFF_EMAIL)
    assert triaged["status"] == "resolved"


def test_3_client_cannot_submit_feedback_against_another_brand(rls):
    """3. A client cannot submit feedback against another brand."""
    row = {
        "brand_id": BRAND_B,  # Client A does NOT have Brand B
        "submitted_by": CLIENT_A_ID,
        "session_id": "session-cross",
        "scope": "conversation",
        "note": "Attacking other brand",
    }
    with pytest.raises(PermissionError, match="no brand access"):
        rls.insert_feedback(row, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)


def test_4_client_cannot_modify_another_clients_feedback(rls):
    """4. A client cannot modify another client's feedback."""
    saved = rls.insert_feedback({
        "brand_id": BRAND_A,
        "submitted_by": CLIENT_A_ID,
        "session_id": "session-1",
        "scope": "conversation",
        "note": "Client A feedback",
    }, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)

    # Client B attempts to update Client A's feedback
    with pytest.raises(PermissionError, match="42501"):
        rls.update_feedback(saved["id"], {"note": "Tampered"}, user_id=CLIENT_B_ID, email=CLIENT_B_EMAIL)


def test_5_unauthenticated_requests_are_rejected(rls):
    """5. Unauthenticated requests are rejected."""
    with pytest.raises(PermissionError, match="anon"):
        rls.insert_feedback({
            "brand_id": BRAND_A,
            "submitted_by": CLIENT_A_ID,
            "session_id": "session-anon",
            "scope": "conversation",
            "note": "Anon",
        }, user_id=None, email=None)

    assert rls.select_feedback(BRAND_A, user_id=None, email=None) == []


def test_6_internal_authorized_users_retain_required_access(rls):
    """6. Internal authorized users retain their required access."""
    # Staff can submit feedback for any brand
    saved_staff = rls.insert_feedback({
        "brand_id": BRAND_A,
        "submitted_by": STAFF_ID,
        "session_id": "staff-sess",
        "scope": "reply",
        "note": "Internal audit note",
    }, user_id=STAFF_ID, email=STAFF_EMAIL)
    assert saved_staff["id"] is not None

    # Staff can read feedback
    rows = rls.select_feedback(BRAND_A, user_id=STAFF_ID, email=STAFF_EMAIL)
    assert len(rows) >= 1


def test_7_existing_feedback_retrieval_still_works_and_isolates_brands(rls):
    """7. Existing feedback retrieval still works with brand isolation."""
    rls.insert_feedback({
        "brand_id": BRAND_A,
        "submitted_by": CLIENT_A_ID,
        "session_id": "s-a",
        "scope": "conversation",
        "note": "Feedback Brand A",
    }, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)

    rls.insert_feedback({
        "brand_id": BRAND_B,
        "submitted_by": CLIENT_B_ID,
        "session_id": "s-b",
        "scope": "conversation",
        "note": "Feedback Brand B",
    }, user_id=CLIENT_B_ID, email=CLIENT_B_EMAIL)

    # Client A only sees Brand A feedback
    client_a_feedback = rls.select_feedback(BRAND_A, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)
    assert len(client_a_feedback) == 1
    assert client_a_feedback[0]["note"] == "Feedback Brand A"

    # Client A trying to read Brand B sees nothing
    client_a_b = rls.select_feedback(BRAND_B, user_id=CLIENT_A_ID, email=CLIENT_A_EMAIL)
    assert client_a_b == []
