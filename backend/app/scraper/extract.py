from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

import trafilatura
from selectolax.parser import HTMLParser


@dataclass(slots=True)
class ExtractedPage:
    title: str | None
    description: str | None
    canonical_url: str | None
    text: str
    structured: dict[str, Any]
    content_hash: str


def _text(node: Any) -> str | None:
    if node is None:
        return None
    value = node.text(separator=" ", strip=True)
    return value or None


def _metadata(document: HTMLParser) -> tuple[str | None, str | None, str | None]:
    title = _text(document.css_first("title"))
    description = None
    canonical = None
    for node in document.css("meta, link"):
        attrs = node.attributes
        key = (attrs.get("name") or attrs.get("property") or attrs.get("rel") or "").lower()
        content = attrs.get("content") or attrs.get("href")
        if not content:
            continue
        if key in {"description", "og:description"} and not description:
            description = content.strip()
        elif key == "canonical":
            canonical = content.strip()
        elif key == "og:title" and not title:
            title = content.strip()
    return title, description, canonical


def _json_ld(document: HTMLParser) -> list[Any]:
    results: list[Any] = []
    for node in document.css('script[type="application/ld+json"]'):
        raw = _text(node)
        if not raw:
            continue
        try:
            results.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return results


def extract_html(html: str) -> ExtractedPage:
    document = HTMLParser(html)
    title, description, canonical_url = _metadata(document)
    for node in document.css("nav, [role='navigation'], [class*='cookie'], [id*='cookie'], [class*='newsletter'], [id*='newsletter'], [class*='cart'], [id*='cart']"):
        node.decompose()
    markdown = trafilatura.extract(document.html, output_format="markdown", include_tables=True, favor_recall=True) or ""
    accordions = [_text(node) for node in document.css("details, [data-accordion], [class*='accordion']")]
    for button in document.css("button[aria-controls]"):
        panel_id = button.attributes.get("aria-controls")
        if not panel_id:
            continue
        panel = document.css_first(f"#{panel_id}")
        pair = "\n".join(value for value in (_text(button), _text(panel)) if value)
        if pair:
            accordions.append(pair)
    accordion_text = "\n\n".join(value for value in accordions if value)
    if accordion_text and accordion_text not in markdown:
        markdown = f"{markdown}\n\n{accordion_text}".strip()
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
    structured = {"json_ld": _json_ld(document)}
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    return ExtractedPage(title, description, canonical_url, markdown, structured, content_hash)
