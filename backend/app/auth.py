"""Small HS256 bearer-token authentication dependency."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

bearer_scheme = HTTPBearer(auto_error=False)
DEV_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
DEV_ORG_ID = UUID("00000000-0000-0000-0000-000000000002")


@dataclass(frozen=True)
class User:
    """Authenticated user and tenant identity."""

    id: UUID
    org_id: UUID


def _decode_part(value: str) -> dict[str, object]:
    padded = value + "=" * (-len(value) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    return data


def _verify_token(token: str, settings: Settings) -> User:
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    header = _decode_part(parts[0])
    payload = _decode_part(parts[1])
    if header.get("alg") != "HS256":
        raise HTTPException(status_code=401, detail="Unsupported token algorithm")
    expected = hmac.new(settings.jwt_secret.encode("utf-8"), f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(expected).decode("ascii").rstrip("=")
    if not hmac.compare_digest(signature, parts[2]):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    expires_at = payload.get("exp")
    if expires_at is not None and (not isinstance(expires_at, (int, float)) or expires_at <= time.time()):
        raise HTTPException(status_code=401, detail="Bearer token has expired")
    try:
        return User(id=UUID(str(payload["sub"])), org_id=UUID(str(payload["org_id"])))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Bearer token must include sub and org_id") from exc


async def _verify_supabase_token(token: str, settings: Settings) -> User:
    """Validate a browser Supabase session without exposing a server key."""
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    endpoint = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(endpoint, headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {token}",
            })
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Could not validate the signed-in user") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    try:
        payload = response.json()
        user_id = UUID(str(payload["id"]))
        app_metadata = payload.get("app_metadata") or {}
        user_metadata = payload.get("user_metadata") or {}
        org_id = app_metadata.get("org_id") or user_metadata.get("org_id") or settings.default_org_id
        return User(id=user_id, org_id=UUID(str(org_id)))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Supabase user record is invalid") from exc


async def current_user(request: Request) -> User:
    """Resolve the current request's user from a bearer token."""

    settings = get_settings()
    if settings.auth_disabled:
        return User(id=DEV_USER_ID, org_id=DEV_ORG_ID)
    credentials: HTTPAuthorizationCredentials | None = await bearer_scheme(request)
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer authentication is required")
    try:
        return _verify_token(credentials.credentials, settings)
    except HTTPException as custom_token_error:
        try:
            return await _verify_supabase_token(credentials.credentials, settings)
        except HTTPException as supabase_token_error:
            if supabase_token_error.status_code == 503:
                raise
            raise custom_token_error
