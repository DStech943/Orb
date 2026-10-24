"""Small HS256 bearer-token authentication dependency."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from uuid import UUID

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


async def current_user(request: Request) -> User:
    """Resolve the current request's user from a bearer token."""

    settings = get_settings()
    if settings.auth_disabled:
        return User(id=DEV_USER_ID, org_id=DEV_ORG_ID)
    credentials: HTTPAuthorizationCredentials | None = await bearer_scheme(request)
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer authentication is required")
    return _verify_token(credentials.credentials, settings)
