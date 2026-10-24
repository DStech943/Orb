from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import crawls
from app.api.crawls import router
from app.auth import User, current_user
from app.db import decode_jsonb

JOB_ID = UUID("00000000-0000-0000-0000-000000000010")
ORG_ID = UUID("00000000-0000-0000-0000-000000000020")
DISCOVERY = {"sitemaps_read": 4, "sitemaps_failed": 0, "total_urls": 12}


def job_record(options: object) -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "id": JOB_ID,
        "org_id": ORG_ID,
        "start_url": "https://example.com/",
        "status": "discovering",
        "error": None,
        "crawl_delay": None,
        "options": options,
        "created_at": now,
        "updated_at": now,
    }


class FakeAcquire:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection

    async def __aenter__(self) -> "FakeConnection":
        return self.connection

    async def __aexit__(self, *_: object) -> None:
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.insert_value: object | None = None
        self.record = job_record('{"max_pages": 200, "catalog_source": "crawl", "discovery": {"sitemaps_read": 4, "sitemaps_failed": 0, "total_urls": 12}}')

    async def fetchrow(self, query: str, *args: object) -> dict[str, object]:
        if "INSERT INTO crawl_jobs" in query:
            self.insert_value = args[2]
        return self.record

    async def fetch(self, query: str, *_args: object) -> list[dict[str, object]]:
        if "GROUP BY" in query:
            return []
        return [self.record]

    async def fetchval(self, _query: str, *_args: object) -> int:
        return 0


class FakePool:
    def __init__(self) -> None:
        self.connection = FakeConnection()

    def acquire(self) -> FakeAcquire:
        return FakeAcquire(self.connection)


def test_decode_jsonb_handles_legacy_double_encoded_payloads() -> None:
    assert decode_jsonb('{"json_ld": []}') == {"json_ld": []}
    # A pool codec decodes the outer JSON string first; this helper handles the
    # remaining legacy string consistently for options and future page reads.
    assert decode_jsonb('{"page_type": "product"}') == {"page_type": "product"}


def test_create_and_list_crawls_return_options_as_objects(monkeypatch) -> None:
    app = FastAPI()
    pool = FakePool()
    app.state.db = pool
    app.state.settings = SimpleNamespace(max_pages_hard_limit=2000)
    app.include_router(router)

    async def fake_user() -> User:
        return User(id=UUID("00000000-0000-0000-0000-000000000030"), org_id=ORG_ID)

    async def no_discovery(*_args: object, **_kwargs: object) -> None:
        return None

    app.dependency_overrides[current_user] = fake_user
    monkeypatch.setattr(crawls, "discover_job", no_discovery)

    with TestClient(app) as client:
        created = client.post("/api/crawls", json={"start_url": "https://example.com", "max_pages": 200})
        invalid = client.post("/api/crawls", json={"url": "https://example.com", "unknown": True})
        listed = client.get("/api/crawls")
        detail = client.get(f"/api/crawls/{JOB_ID}")

    assert created.status_code == 201
    assert invalid.status_code == 422
    assert created.json()["options"] == {"max_pages": 200, "catalog_source": "crawl", "discovery": DISCOVERY}
    assert pool.connection.insert_value == {"max_pages": 200, "catalog_source": "crawl"}
    assert listed.status_code == 200
    assert listed.json()[0]["options"]["discovery"] == DISCOVERY
    assert detail.status_code == 200
    assert detail.json()["options"]["discovery"] == DISCOVERY
