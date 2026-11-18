"""Brand analytics and conversations: access control, calculations and query safety."""
from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api import analytics as an
from app.auth import User, current_user

BRAND = UUID("0b7d7744-a847-4fb7-a54c-771ca0f1b98e")
USER = User(id=uuid4(), org_id=uuid4())


@pytest.fixture(autouse=True)
def _fresh_caches():
    """The module keeps short-lived caches; every test starts with them empty."""
    for cache in (an._cache, an._auth_cache, an._catalog_cache):
        cache.clear()
    yield


def raw(**over) -> dict:
    base = {
        "range": {"from": "2026-10-19T00:00:00+00:00", "to": "2026-11-18T00:00:00+00:00", "timezone": "Asia/Kolkata"},
        "conversations": {"started": 200, "active": 150, "resolved": 50, "median_hours_to_resolve": 17.9,
                          "by_platform": [{"platform": "zoko", "conversations": 160}, {"platform": "instagram", "conversations": 40}]},
        "messages": {"customer": 900, "replies": 700, "sent_from_dashboard": 120},
        "escalations": {"records": 30, "conversations": 25, "conversations_in_active": 15},
        "first_reply": {"answered_conversations": 120, "median_seconds": 180, "p90_seconds": 900},
        "daily": [{"day": "2026-11-17", "conversations": 7, "customer_messages": 30, "replies": 22}],
        "hourly": [{"hour": h, "customer_messages": h} for h in range(24)],
        "topics": {"tagged_conversations": 50, "items": [{"topic": "Order Status", "conversations": 20}]},
        "products": [{"key": "p1", "title": "Serum", "conversations": 9}],
        "reviews": {"up": 3, "down": 1, "other": 0, "failure_categories": [{"category": "content_gap", "count": 1}]},
    }
    base.update(over)
    return base


# ------------------------------------------------------------------ calculations
def test_summary_uses_only_database_numbers_and_explicit_denominators() -> None:
    out = an.shape_analytics(BRAND, "30d", raw(), raw())
    s = out["summary"]
    assert (s["conversations_started"], s["active_conversations"], s["customer_messages"], s["replies_sent"]) == (200, 150, 900, 700)
    assert s["resolution_rate"] == 25.0                      # 50 resolved of 200 started
    assert s["escalation_rate"] == 10.0                      # 15 escalated of 150 active
    assert s["first_reply"]["answered_share"] == 80.0        # 120 answered of 150 active
    assert out["topics"]["coverage_pct"] == 25.0 and out["topics"]["tagged_conversations"] == 50 and out["topics"]["total_conversations"] == 200


def test_nothing_is_invented_for_missing_sources() -> None:
    out = an.shape_analytics(BRAND, "30d", raw(), raw())
    data = {key: value for key, value in out.items() if key != "availability"}     # the explanations may use these words
    flat = str(data).lower()
    assert "csat" not in flat and "rating" not in flat and "revenue" not in flat and "satisfaction" not in flat
    for key in ("customer_satisfaction", "ai_vs_human_replies", "revenue_attribution"):
        assert out["availability"][key]["available"] is False and out["availability"][key]["reason"]


def test_empty_brand_yields_none_not_fake_defaults() -> None:
    empty = {"conversations": {"started": 0, "active": 0, "resolved": 0, "median_hours_to_resolve": None}, "messages": {}, "escalations": {}, "first_reply": {}, "daily": [], "hourly": [], "topics": {"items": []}, "products": [], "reviews": {}}
    out = an.shape_analytics(BRAND, "30d", empty, empty)
    s = out["summary"]
    assert s["conversations_started"] == 0 and s["resolution_rate"] is None and s["escalation_rate"] is None
    assert s["median_hours_to_resolve"] is None and s["first_reply"]["median_seconds"] is None
    assert out["comparison"]["conversations_started"]["change_pct"] is None
    assert out["topics"]["coverage_pct"] is None and out["trends"] == []


def test_comparison_is_against_the_real_previous_period() -> None:
    previous = raw(messages={"customer": 600, "replies": 700, "sent_from_dashboard": 0}, conversations={"started": 100, "active": 100, "resolved": 40, "median_hours_to_resolve": 1})
    out = an.shape_analytics(BRAND, "30d", raw(), previous)
    c = out["comparison"]
    assert c["customer_messages"] == {"previous": 600, "change_pct": 50.0}
    assert c["conversations_started"] == {"previous": 100, "change_pct": 100.0}
    assert c["replies_sent"]["change_pct"] == 0.0
    assert c["resolution_rate"] == {"previous": 40.0, "change_points": -15.0}       # 25% now vs 40% before
    assert an._change(5, 0) == {"previous": 0, "change_pct": None}                  # never divides by zero


# ------------------------------------------------------------------ query safety
@pytest.mark.parametrize("raw_term,expected", [("  order  status ", "order status"), ("a*b,c(d)%e_f", "a b c d e f"), ('x"y\'z', "x y z"), ("", ""), (None, "")])
def test_search_terms_cannot_inject_filter_syntax(raw_term, expected) -> None:
    assert an.clean_search(raw_term) == expected


def test_contact_numbers_are_masked() -> None:
    assert an.mask_contact("919876543210") == "••••3210"
    assert an.mask_contact("+91 98765 43210") == "••••3210"
    assert an.mask_contact("12") == "" and an.mask_contact(None) == ""


# ------------------------------------------------------------------ access control
def settings(auth_disabled=False):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(auth_disabled=auth_disabled))))


def rows_for(monkeypatch, *, brand=True, members=(), profile_email="", assigned=(), admin=False):
    calls = []

    async def rows(request, table, params):
        calls.append((table, params))
        if table == "brands":
            return [{"id": str(BRAND), "name": "Laani"}] if brand else []
        if table == "orb_brand_memberships":
            return [{"brand_id": str(BRAND)}] if members else []
        if table == "orb_profiles":
            return [{"email": profile_email}] if profile_email else []
        if table == "brand_assignments":
            return [{"email": e} for e in assigned]
        return []

    async def is_admin(request, user):
        return admin

    monkeypatch.setattr(an, "_supabase_service_rows", rows)
    monkeypatch.setattr(an, "_is_admin", is_admin)
    return calls


@pytest.mark.asyncio
async def test_unknown_brand_is_404(monkeypatch) -> None:
    rows_for(monkeypatch, brand=False)
    with pytest.raises(HTTPException) as err:
        await an._authorize_brand(settings(), USER, BRAND)
    assert err.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("kwargs", [{"admin": True}, {"members": [1]}, {"profile_email": "Pat@Brand.com", "assigned": ["pat@brand.com"]}])
async def test_admins_members_and_assigned_team_may_read(monkeypatch, kwargs) -> None:
    rows_for(monkeypatch, **kwargs)
    assert (await an._authorize_brand(settings(), USER, BRAND))["name"] == "Laani"


@pytest.mark.asyncio
@pytest.mark.parametrize("kwargs", [{}, {"profile_email": "pat@brand.com", "assigned": ["someone@else.com"]}, {"profile_email": "a_b@brand.com", "assigned": ["axb@brand.com"]}, {"assigned": ["pat@brand.com"]}])
async def test_everyone_else_is_refused(monkeypatch, kwargs) -> None:
    rows_for(monkeypatch, **kwargs)
    with pytest.raises(HTTPException) as err:
        await an._authorize_brand(settings(), USER, BRAND)
    assert err.value.status_code == 403         # includes "_" in an email never acting as a wildcard


@pytest.mark.asyncio
async def test_a_database_permission_error_never_reaches_the_customer(monkeypatch) -> None:
    """If the access tables cannot be read, the page gets a plain message, not database text."""
    async def broken(request, table, params):
        raise HTTPException(status_code=503, detail=f"Supabase could not read {table} with the backend service role (403): permission denied for table {table}")

    async def not_admin(request, user):
        return False

    monkeypatch.setattr(an, "_supabase_service_rows", broken)
    monkeypatch.setattr(an, "_is_admin", not_admin)
    with pytest.raises(HTTPException) as err:
        await an._authorize_brand(settings(), USER, BRAND)
    assert err.value.status_code == 503
    assert "Supabase" not in err.value.detail and "permission denied" not in err.value.detail and "orb_brand" not in err.value.detail


# ------------------------------------------------------------------ endpoints
@pytest.fixture
def api(monkeypatch):
    an._cache.clear()
    state = SimpleNamespace(rpc=[], gets=[], authorized=[], denied=False)

    async def authorize(request, user, brand_id):
        state.authorized.append(brand_id)
        if state.denied:
            raise HTTPException(status_code=403, detail="You don't have access to this brand's analytics.")
        return {"id": str(brand_id), "name": "Laani"}

    async def rpc(request, brand_id, start, end):
        state.rpc.append((brand_id, start, end))
        return raw()

    async def get(request, table, params, *, count=False):
        state.gets.append((table, dict(params)))
        if table == "chat_threads" and "conversation_id" in params.get("select", ""):
            return ([{"id": str(uuid4()), "conversation_id": "919876543210", "platform": "zoko", "customer_details": {"senderName": "Asha", "waId": "919876543210"}, "workflow_status": "resolved", "created_at": "2026-11-17T10:00:00+00:00", "resolved_at": None}] if not state.missing_thread else []), None
        if table == "chat_threads":
            return [{"id": str(uuid4()), "platform": "zoko", "customer_details": {"senderName": "Asha", "waId": "919876543210", "bot_number": "x"}, "last_message_preview": "Where is my order?", "latest_message_direction": "inbound", "workflow_status": "pending", "created_at": "2026-11-17T10:00:00+00:00", "resolved_at": None, "last_activity_at": "2026-11-17T11:00:00+00:00", "tags": ["Order Status"], "summary": "Asks about delivery.", "conversation_id": "919876543210"}], 42
        return [{"id": "m1", "role": "customer", "content": "Hi", "media_type": "text", "media_url": "javascript:alert(1)", "message_status": "received", "provider_source": "webhook", "timestamp": "2026-11-17T10:00:00+00:00"},
                {"id": "m2", "role": "agent", "content": "Hello", "media_type": "text", "media_url": "https://cdn.example.com/a.png", "message_status": "read", "provider_source": "dashboard", "timestamp": "2026-11-17T10:01:00+00:00"}], None

    state.missing_thread = False
    monkeypatch.setattr(an, "_authorize_brand", authorize)
    monkeypatch.setattr(an, "_rpc_analytics", rpc)
    monkeypatch.setattr(an, "_service_get", get)
    app = FastAPI(); app.state.settings = SimpleNamespace(auth_disabled=False); app.include_router(an.router)
    app.dependency_overrides[current_user] = lambda: USER
    client = TestClient(app); client.state = state
    return client


def test_analytics_compares_two_equal_periods_and_caches(api) -> None:
    first = api.get(f"/api/brands/{BRAND}/analytics?range=7d")
    assert first.status_code == 200 and first.json()["summary"]["customer_messages"] == 900
    (_, cur_start, cur_end), (_, prev_start, prev_end) = api.state.rpc
    assert (cur_end - cur_start).days == 7 and prev_end == cur_start and (prev_end - prev_start).days == 7
    api.get(f"/api/brands/{BRAND}/analytics?range=7d")
    assert len(api.state.rpc) == 2                         # second call came from the short cache
    api.get(f"/api/brands/{BRAND}/analytics?range=90d")
    assert len(api.state.rpc) == 4                         # a different range is a different query


def test_analytics_rejects_bad_range_and_unauthorised_users(api) -> None:
    assert api.get(f"/api/brands/{BRAND}/analytics?range=forever").status_code == 422
    assert api.get("/api/brands/not-a-uuid/analytics").status_code == 422
    api.state.denied = True
    assert api.get(f"/api/brands/{BRAND}/analytics").status_code == 403 and not api.state.rpc


def test_conversation_list_is_scoped_filtered_and_masked(api) -> None:
    resp = api.get(f"/api/brands/{BRAND}/conversations?status=open&platform=zoko&search=ord*er,(x)&limit=10&offset=20")
    assert resp.status_code == 200
    table, params = api.state.gets[-1]
    assert table == "chat_threads" and params["brand_id"] == f"eq.{BRAND}"
    assert params["workflow_status"] == "neq.resolved" and params["platform"] == "eq.zoko"
    assert params["limit"] == "10" and params["offset"] == "20"
    assert "*ord er x*" in params["or"] and "(x)" not in params["or"].replace("(last_message_preview", "")   # wildcards/parens stripped
    body = resp.json(); item = body["items"][0]
    assert body["total"] == 42 and item["customer_name"] == "Asha" and item["contact"] == "••••3210"
    assert item["status"] == "open" and item["topics"] == ["Order Status"] and item["summary"] == "Asks about delivery."
    assert "919876543210" not in resp.text and "conversation_id" not in resp.text      # the real number never leaves the server


def test_conversation_list_validates_inputs(api) -> None:
    for query in ("limit=0", "limit=101", "offset=-1", "status=deleted", "platform=a%20b", "range=1y"):
        assert api.get(f"/api/brands/{BRAND}/conversations?{query}").status_code == 422, query


def test_messages_are_scoped_to_the_brand_and_hide_internals(api) -> None:
    thread = uuid4()
    resp = api.get(f"/api/brands/{BRAND}/conversations/{thread}/messages")
    assert resp.status_code == 200
    thread_query, msg_query = api.state.gets[-2][1], api.state.gets[-1][1]
    assert thread_query["brand_id"] == f"eq.{BRAND}" and thread_query["id"] == f"eq.{thread}"
    assert msg_query["brand_id"] == f"eq.{BRAND}" and msg_query["conversation_id"] == "eq.919876543210" and msg_query["role"] == "in.(customer,agent)"
    body = resp.json()
    assert [m["sender"] for m in body["messages"]] == ["customer", "business"]
    assert body["messages"][1]["sent_from_dashboard"] is True and body["messages"][0]["sent_from_dashboard"] is False
    assert body["messages"][0]["media_url"] is None and body["messages"][1]["media_url"].startswith("https://")   # no javascript: urls
    assert "919876543210" not in resp.text.replace("••••3210", "")


def test_unknown_conversation_is_404(api) -> None:
    api.state.missing_thread = True
    assert api.get(f"/api/brands/{BRAND}/conversations/{uuid4()}/messages").status_code == 404


# ------------------------------------------------------------------ access-check cache
@pytest.mark.asyncio
async def test_a_granted_access_check_is_remembered_briefly_but_refusals_are_not(monkeypatch) -> None:
    calls = rows_for(monkeypatch, members=[1])
    await an._authorize_brand(settings(), USER, BRAND)
    reads_after_first = len(calls)
    assert reads_after_first > 0
    await an._authorize_brand(settings(), USER, BRAND)          # served from memory
    assert len(calls) == reads_after_first
    # A different person is never covered by someone else's grant.
    stranger = User(id=uuid4(), org_id=uuid4())
    rows_for(monkeypatch)                                        # nobody is a member now
    with pytest.raises(HTTPException) as err:
        await an._authorize_brand(settings(), stranger, BRAND)
    assert err.value.status_code == 403
    # A refusal is not cached: the next attempt checks again (so a newly granted user gets in at once).
    calls = rows_for(monkeypatch)
    with pytest.raises(HTTPException):
        await an._authorize_brand(settings(), stranger, BRAND)
    assert len(calls) > 0


@pytest.mark.asyncio
async def test_the_remembered_grant_expires(monkeypatch) -> None:
    clock = {"now": 1000.0}
    monkeypatch.setattr(an.time, "monotonic", lambda: clock["now"])
    calls = rows_for(monkeypatch, members=[1])
    await an._authorize_brand(settings(), USER, BRAND)
    first = len(calls)
    clock["now"] += an.AUTH_CACHE_SECONDS - 1
    await an._authorize_brand(settings(), USER, BRAND)
    assert len(calls) == first                                   # still remembered
    clock["now"] += 2
    await an._authorize_brand(settings(), USER, BRAND)
    assert len(calls) > first                                    # expired, so access is re-checked


# ------------------------------------------------------------------ catalog summary
def product(**over) -> dict:
    base = {"id": "p1", "pstatus": "ACTIVE", "title": "Serum", "handle": "serum", "v2": [{"inventoryQuantity": 3}, {"inventoryQuantity": 0}]}
    base.update(over)
    return base


def test_variants_are_read_from_every_shape_shopify_uses() -> None:
    assert an._variant_list([{"a": 1}, "junk"]) == [{"a": 1}]
    assert an._variant_list({"nodes": [{"a": 1}]}) == [{"a": 1}]
    assert an._variant_list({"edges": [{"node": {"a": 1}}, {"node": None}]}) == [{"a": 1}]
    assert an._variant_list(None) == [] and an._variant_list("x") == []


def test_stock_rules_match_the_ones_the_browser_used() -> None:
    assert an.catalog_product(product())["out_of_stock"] is False                                           # 3 + 0 in stock
    assert an.catalog_product(product(v2=[{"inventoryQuantity": 0}, {"inventory_quantity": 0}]))["out_of_stock"] is True
    assert an.catalog_product(product(v2={"nodes": [{"inventoryQuantity": "0"}]}))["out_of_stock"] is True   # strings and node shapes
    assert an.catalog_product(product(v2=None, v3={"edges": [{"node": {"inventoryQuantity": 5}}]}))["out_of_stock"] is False
    # No inventory figures at all: unknown is not "out of stock" unless the record says so.
    assert an.catalog_product(product(v2=[{"title": "x"}]))["out_of_stock"] is False
    assert an.catalog_product(product(v2=None, flag="true"))["out_of_stock"] is True
    # The first variant list that has anything wins, like payload.variants || shopify.variants.
    assert an.catalog_product(product(v1=[{"inventoryQuantity": 0}], v2=[{"inventoryQuantity": 9}]))["out_of_stock"] is True


def test_only_products_for_sale_are_counted_and_names_have_fallbacks() -> None:
    assert an.catalog_product(product(pstatus="DRAFT")) is None and an.catalog_product(product(pstatus="archived")) is None
    assert an.catalog_product(product(pstatus=None, sstatus="Published")) is not None
    assert an.catalog_product(product(pstatus=None)) is not None                      # no status recorded
    named = an.catalog_product(product(title=None, name=None, stitle="From shopify", shandle="from-shopify", handle=None))
    assert (named["name"], named["handle"]) == ("From shopify", "from-shopify")
    assert an.catalog_product(product(title=None))["name"] == "Untitled product"


def test_catalog_summary_is_light_scoped_and_cached(api) -> None:
    rows = [product(id="a"), product(id="b", v2=[{"inventoryQuantity": 0}]), product(id="c", pstatus="draft")]
    calls = []

    async def get(request, table, params, *, count=False):
        calls.append((table, dict(params)))
        return rows, None

    an._service_get = get                                   # the `api` fixture restores the original afterwards
    first = api.get(f"/api/brands/{BRAND}/catalog-summary")
    assert first.status_code == 200
    body = first.json()
    assert body["source"] == "shopify" and body["count"] == 2 and body["out_of_stock_count"] == 1
    assert [p["id"] for p in body["products"]] == ["a", "b"] and set(body["products"][0]) == {"id", "name", "handle", "out_of_stock"}
    table, params = calls[0]
    assert table == "orb_products" and params["brand_id"] == f"eq.{BRAND}" and params["provider"] == "eq.shopify_admin"
    assert "payload" not in params["select"].replace("payload->", "")           # never the whole payload column
    api.get(f"/api/brands/{BRAND}/catalog-summary")
    assert len(calls) == 1                                  # second call from the short cache


def test_catalog_summary_says_none_when_there_are_no_synced_products(api) -> None:
    async def get(request, table, params, *, count=False):
        return [], None

    an._service_get = get
    assert api.get(f"/api/brands/{BRAND}/catalog-summary").json() == {"source": "none", "count": 0, "out_of_stock_count": 0, "products": []}


def test_catalog_summary_requires_access(api) -> None:
    api.state.denied = True
    assert api.get(f"/api/brands/{BRAND}/catalog-summary").status_code == 403
