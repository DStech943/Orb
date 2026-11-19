import React from "react";

// Matches Markdown links [label](https://...) and plain URLs (https://..., http://..., www....)
const LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|((?:https?:\/\/|www\.)[^\s<]+)/g;

/**
 * Parses plain URLs and Markdown links inside a string,
 * rendering them as clickable <a> tags with safe attributes.
 */
export function linkifyText(text, isUser = false) {
  if (!text) return null;
  const content = String(text);
  const elements = [];
  let lastIndex = 0;
  let match;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push(content.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Markdown link: [label](url)
      const label = match[1];
      const href = match[2];
      elements.push(
        <a
          key={`md-link-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={
            isUser
              ? "font-medium text-white underline decoration-white/70 underline-offset-2 hover:decoration-white hover:text-white/90 break-all transition-colors"
              : "font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary hover:text-primary-dark break-all transition-colors"
          }
        >
          {label}
        </a>,
      );
    } else if (match[3]) {
      // Raw URL: https://... or http://... or www....
      let rawUrl = match[3];
      let trailing = "";

      // Strip trailing punctuation so sentence-ending periods, commas, parens aren't part of the URL
      while (rawUrl.length > 0 && /[.,;:!?)'"\]*_~]/.test(rawUrl.slice(-1))) {
        if (rawUrl.endsWith(")")) {
          const openParens = (rawUrl.match(/\(/g) || []).length;
          const closeParens = (rawUrl.match(/\)/g) || []).length;
          if (closeParens <= openParens) {
            break; // Balanced paren is part of URL e.g. /wiki/Article_(Topic)
          }
        }
        trailing = rawUrl.slice(-1) + trailing;
        rawUrl = rawUrl.slice(0, -1);
      }

      const href =
        rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
          ? rawUrl
          : `https://${rawUrl}`;

      elements.push(
        <a
          key={`raw-link-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={
            isUser
              ? "font-medium text-white underline decoration-white/70 underline-offset-2 hover:decoration-white hover:text-white/90 break-all transition-colors"
              : "font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary hover:text-primary-dark break-all transition-colors"
          }
        >
          {rawUrl}
        </a>,
      );

      if (trailing) {
        elements.push(trailing);
      }
    }

    lastIndex = LINK_REGEX.lastIndex;
  }

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return elements;
}

export default function ChatMessageText({
  text,
  isUser = false,
  className = "",
}) {
  if (!text) return null;
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {linkifyText(text, isUser)}
    </p>
  );
}
