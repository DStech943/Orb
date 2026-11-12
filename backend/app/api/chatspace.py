"""Real-time WebSocket and persistence router for Brand Chatspace."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import asyncpg
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chatspace"])


class ChatspaceConnectionManager:
    """Manages active WebSockets segmented by brand."""

    def __init__(self) -> None:
        # brand_key -> set of active WebSockets
        self.connections: dict[str, set[WebSocket]] = {}

    def _normalize_key(self, brand: str) -> str:
        return brand.strip().lower() if brand else "default_brand"

    async def connect(self, brand: str, websocket: WebSocket) -> None:
        await websocket.accept()
        key = self._normalize_key(brand)
        if key not in self.connections:
            self.connections[key] = set()
        self.connections[key].add(websocket)
        logger.info("WebSocket connected for brand '%s'. Total: %d", key, len(self.connections[key]))

    def disconnect(self, brand: str, websocket: WebSocket) -> None:
        key = self._normalize_key(brand)
        if key in self.connections:
            self.connections[key].discard(websocket)
            if not self.connections[key]:
                del self.connections[key]
        logger.info("WebSocket disconnected for brand '%s'.", key)

    async def broadcast(self, brand: str, message: dict[str, Any]) -> None:
        key = self._normalize_key(brand)
        targets = list(self.connections.get(key, []))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(brand, ws)


manager = ChatspaceConnectionManager()


async def _ensure_chatspace_table(pool: asyncpg.Pool) -> None:
    """Ensure the chat messages table exists in the database."""
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute("CREATE SCHEMA IF NOT EXISTS cx_copilot;")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS cx_copilot.orb_client_chat_messages (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              brand_id uuid,
              brand_name text NOT NULL,
              sender_id text,
              sender_name text NOT NULL,
              sender_role text NOT NULL DEFAULT 'client',
              sender_avatar text,
              content text NOT NULL,
              media jsonb NOT NULL DEFAULT '[]'::jsonb,
              status text NOT NULL DEFAULT 'sent',
              reply_to_id uuid,
              reply_to_snippet text,
              reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            ALTER TABLE cx_copilot.orb_client_chat_messages
              ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;
            CREATE INDEX IF NOT EXISTS orb_client_chat_brand_name_idx
              ON cx_copilot.orb_client_chat_messages (brand_name, created_at ASC);
        """)


@router.websocket("/ws/chatspace/{brand_name}")
async def chatspace_websocket(websocket: WebSocket, brand_name: str) -> None:
    """Real-time bi-directional WebSocket connection for a brand's Chatspace."""
    pool: asyncpg.Pool | None = getattr(websocket.app.state, "db", None)
    if pool is not None:
        try:
            await _ensure_chatspace_table(pool)
        except Exception as exc:
            logger.warning("Could not auto-verify chat table: %s", exc)

    await manager.connect(brand_name, websocket)

    try:
        # On connection, send an acknowledgment / connected event
        await websocket.send_json({
            "type": "connection_ack",
            "brand": brand_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        while True:
            raw = await websocket.receive_text()
            if not raw or not raw.strip():
                continue

            try:
                data = json.loads(raw)
            except ValueError:
                continue

            action = data.get("type") or "chat_message"

            if action == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if action == "chat_message":
                msg_id = str(data.get("id") or uuid4())
                brand_id = data.get("brandId") or data.get("brand_id")
                sender = data.get("sender") or {}
                content = str(data.get("content") or "").strip()
                media = data.get("media") or []
                mentions = data.get("mentions") or []
                if not content and not media:
                    continue

                reply_to_id = data.get("replyToId")
                reply_to_snippet = data.get("replyToSnippet")
                reactions = data.get("reactions") or {}
                status_val = data.get("status") or "sent"
                created_at = data.get("createdAt") or datetime.now(timezone.utc).isoformat()

                # Persist to database if pool is ready
                if pool is not None:
                    try:
                        async with pool.acquire() as conn:
                            # Auto-resolve brand_id from cx_copilot.brands if missing
                            actual_brand_id = brand_id
                            if not actual_brand_id:
                                try:
                                    resolved = await conn.fetchval(
                                        "SELECT id FROM cx_copilot.brands WHERE lower(name) = lower($1) LIMIT 1",
                                        brand_name.strip()
                                    )
                                    if resolved:
                                        actual_brand_id = str(resolved)
                                except Exception:
                                    pass

                            await conn.execute("""
                                INSERT INTO cx_copilot.orb_client_chat_messages
                                  (id, brand_id, brand_name, sender_id, sender_name, sender_role, sender_avatar, content, media, status, reply_to_id, reply_to_snippet, reactions, created_at)
                                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::uuid, $12, $13::jsonb, $14::timestamptz)
                                ON CONFLICT (id) DO UPDATE SET
                                  brand_id=COALESCE(EXCLUDED.brand_id, cx_copilot.orb_client_chat_messages.brand_id),
                                  media=EXCLUDED.media,
                                  reactions=EXCLUDED.reactions,
                                  status=EXCLUDED.status,
                                  updated_at=now();
                            """, msg_id, actual_brand_id if actual_brand_id else None, brand_name,
                                str(sender.get("id") or ""), str(sender.get("name") or "User"),
                                str(sender.get("role") or "client"), sender.get("avatar"), content, json.dumps(media),
                                status_val, reply_to_id if reply_to_id else None, reply_to_snippet,
                                json.dumps(reactions), datetime.fromisoformat(created_at.replace("Z", "+00:00")))
                    except Exception as db_err:
                        logger.error("Database insert failed: %s", db_err)

                # Broadcast to all live clients listening to this brand
                broadcast_payload = {
                    "type": "chat_message",
                    "id": msg_id,
                    "brandId": actual_brand_id if 'actual_brand_id' in locals() else brand_id,
                    "brand": brand_name,
                    "sender": sender,
                    "content": content,
                    "media": media,
                    "mentions": mentions,
                    "status": status_val,
                    "replyToId": reply_to_id,
                    "replyToSnippet": reply_to_snippet,
                    "reactions": reactions,
                    "createdAt": created_at,
                }
                await manager.broadcast(brand_name, broadcast_payload)

            elif action == "reaction_toggle":
                msg_id = data.get("messageId")
                emoji = data.get("emoji")
                reactions = data.get("reactions") or {}

                if pool is not None and msg_id:
                    try:
                        async with pool.acquire() as conn:
                            await conn.execute("""
                                UPDATE cx_copilot.orb_client_chat_messages
                                SET reactions=$2::jsonb, updated_at=now()
                                WHERE id=$1::uuid
                            """, msg_id, json.dumps(reactions))
                    except Exception as db_err:
                        logger.error("Database reaction update failed: %s", db_err)

                await manager.broadcast(brand_name, {
                    "type": "reaction_update",
                    "messageId": msg_id,
                    "emoji": emoji,
                    "reactions": reactions,
                })

            elif action == "status_update":
                msg_id = data.get("messageId")
                new_status = data.get("status") or "read"

                if pool is not None and msg_id:
                    try:
                        async with pool.acquire() as conn:
                            await conn.execute("""
                                UPDATE cx_copilot.orb_client_chat_messages
                                SET status=$2, updated_at=now()
                                WHERE id=$1::uuid
                            """, msg_id, new_status)
                    except Exception as db_err:
                        logger.error("Database status update failed: %s", db_err)

                await manager.broadcast(brand_name, {
                    "type": "status_update",
                    "messageId": msg_id,
                    "status": new_status,
                })

            elif action == "typing":
                user_name = data.get("userName") or "Someone"
                is_typing = bool(data.get("isTyping"))
                await manager.broadcast(brand_name, {
                    "type": "typing",
                    "userName": user_name,
                    "isTyping": is_typing,
                })

    except WebSocketDisconnect:
        manager.disconnect(brand_name, websocket)
    except Exception as exc:
        logger.warning("WebSocket loop ended: %s", exc)
        manager.disconnect(brand_name, websocket)
