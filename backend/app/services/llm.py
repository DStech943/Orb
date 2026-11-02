"""OpenAI-compatible, source-grounded JSON generation."""
from __future__ import annotations

import json
from typing import Any

import asyncpg
import httpx

from app.config import Settings
from app.services.vault import SecretUnavailable, vault_secret


class GenerationUnavailable(RuntimeError):
    pass


def _json_object(value: str) -> dict[str, Any] | list[Any]:
    candidate = value.strip()
    if candidate.startswith("```"):
        candidate = candidate.split("\n", 1)[1] if "\n" in candidate else candidate
        candidate = candidate.rsplit("```", 1)[0].strip()
    parsed = json.loads(candidate)
    if not isinstance(parsed, (dict, list)):
        raise GenerationUnavailable("The model returned JSON in an unsupported shape")
    return parsed


async def generate_json(pool: asyncpg.Pool, settings: Settings, system: str, prompt: str) -> dict[str, Any] | list[Any]:
    if not settings.llm_base_url or not settings.llm_model:
        raise GenerationUnavailable("Generation is not configured: set LLM_BASE_URL and LLM_MODEL")
    try:
        api_key = await vault_secret(pool, "ORB_LLM_API_KEY")
    except SecretUnavailable as exc:
        raise GenerationUnavailable(str(exc)) from exc
    endpoint = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.llm_model,
        "temperature": 0.15,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, headers={"Authorization": f"Bearer {api_key}"}, json=body)
            # Some OpenAI-compatible models intermittently reject the optional
            # structured-output hint with a server error. The system prompt still
            # requires JSON, so retry once without that provider-specific field.
            if response.status_code >= 500:
                fallback_body = {key: value for key, value in body.items() if key != "response_format"}
                response = await client.post(endpoint, headers={"Authorization": f"Bearer {api_key}"}, json=fallback_body)
            response.raise_for_status()
            payload = response.json()
        content = payload["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in {401, 403}:
            raise GenerationUnavailable(
                "LLM authentication failed. Ensure ORB_LLM_API_KEY belongs to the provider in LLM_BASE_URL."
            ) from exc
        raise GenerationUnavailable(f"Generation request failed with HTTP {status}") from exc
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GenerationUnavailable(f"Generation request failed: {exc}") from exc
    try:
        return _json_object(str(content))
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise GenerationUnavailable("The model did not return valid JSON") from exc


async def embed_text(pool: asyncpg.Pool, settings: Settings, text: str) -> list[float]:
    base_url = settings.embedding_base_url or settings.llm_base_url
    model = settings.embedding_model
    if not base_url or not model:
        raise GenerationUnavailable("Embedding is not configured: set EMBEDDING_BASE_URL and EMBEDDING_MODEL")
    try:
        api_key = await vault_secret(pool, "ORB_EMBEDDING_API_KEY")
    except SecretUnavailable:
        try:
            api_key = await vault_secret(pool, "ORB_LLM_API_KEY")
        except SecretUnavailable as exc:
            raise GenerationUnavailable(str(exc)) from exc
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{base_url.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "input": text[:30_000]},
            )
            response.raise_for_status()
            vector = response.json()["data"][0]["embedding"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise GenerationUnavailable(f"Embedding request failed: {exc}") from exc
    if not isinstance(vector, list) or not all(isinstance(value, (int, float)) for value in vector):
        raise GenerationUnavailable("Embedding provider returned an invalid vector")
    if len(vector) != settings.embedding_dimensions:
        raise GenerationUnavailable(f"Embedding dimension {len(vector)} does not match EMBEDDING_DIMENSIONS={settings.embedding_dimensions}")
    return [float(value) for value in vector]
