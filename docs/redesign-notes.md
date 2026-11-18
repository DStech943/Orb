# Orb redesign: notes and backend dependencies

This file records what the redesign changed in the frontend, and the places where the UI
is limited by what the API currently exposes. None of these were hidden behind UI changes
or simulated with mock data.

## What changed

- **Design tokens** live in `tailwind.config.js` (colours, radii, shadows, animation) and
  `src/index.css` (base typography, focus ring, scrollbars). Legacy token names
  (`ink`, `purple`, `primary`, `peach`) were kept and re-pointed, so existing pages pick up
  the new palette. Font is Geist (already a dependency, now loaded in `src/main.jsx`).
- **Primitives** in `src/components/ui/` were rewritten (Button, Card, Input, Select,
  Textarea, Modal, Drawer, Dropdown, Tabs, Toggle, Avatar, StatusChip, StatCard, DataTable,
  EmptyState, Skeleton, Toast) and `Tooltip` and `PageHeader` were added. The marketing
  site, login, signup and 404 keep their bold look through `BrutalStyle` (`UiStyle.jsx`),
  which Button, Card and Badge read.
- **Brand context**: `src/context/BrandContext.jsx` is the single source of "which brand am
  I in". It still writes `orb_selected_brand*` to localStorage and fires
  `orb:brand-changed`, so every existing page and service keeps working. `AppLayout` keys the
  page on the brand id, so switching brand remounts the page and every screen refetches.
- **Shell**: grouped sidebar with the brand switcher, collapsible rail with tooltips,
  mobile drawer, breadcrumb topbar (`Sidebar.jsx`, `BrandSwitcher.jsx`, `Topbar.jsx`).
  Every route that existed still exists. New route: `/app/feedback`.
- **Overview** (`components/overview/AgentHome.jsx`): readiness checklist, next actions,
  at-a-glance counts, attention list and recent activity, all from real API data. The
  operations, inventory and mastersheet blocks were kept below it as "Business snapshot".
- **AI's Brain** is now a hub (no `tab`) with FAQs, SOPs, Knowledge sources and the
  playground. **AI configuration** (`/app/workspace`) has plain-language tabs, helper
  text, and an unsaved-changes bar with Discard/Save and a leave warning.
- **Playground** (`/app/chat`): added a left "Test sessions" panel (search, new, reopen,
  delete) next to the existing chat and feedback panels, plus brand context on the page.
- **Feedback & issues** (`pages/Feedback.jsx`): list, filters, detail and progress trail.

## Backend dependencies and limits

1. **Brand-wide feedback is admin-only.** `GET /api/brands/{id}/agent-feedback` without a
   `session_id` requires an admin (`knowledge.py`, `list_agent_feedback`). Non-admin brand
   users therefore only see feedback from test sessions recorded in their own browser
   (`src/lib/testSessions.js`, `src/lib/feedbackData.js`), and the page says so. A
   brand-scoped list endpoint for non-admin members would remove this limit.
2. **No endpoint lists test sessions.** The agent API stores history per `session_id` but
   cannot list sessions, so the session list is kept in `localStorage` per brand (id,
   title, timestamps only). It does not follow a user across browsers. Session deletion
   calls the existing history-delete endpoint.
3. **Feedback statuses** are the four the API supports (`open`, `updated_in_knowledge`,
   `retested`, `resolved`). The UI shows them as Received, Knowledge updated, Retested and
   Resolved, and groups them as Open, In progress and Resolved. There is no "rejected" or
   "won't fix" state.
4. **Brand voice is admin-only** (`GET /api/brands/{id}/voice`). The "Set how your agent
   should sound" readiness step is therefore shown as "can't check" for non-admins instead
   of being guessed.
5. **Activity timestamps.** Recent activity uses `updated_at` / `created_at` on knowledge
   points, operations and feedback. Items without a timestamp are left out. There is no
   audit-log endpoint, so events like "AI configuration changed" or "flow published" cannot
   be listed yet.
6. **`extendOperation`** in `orbApi.js` was already a local stub (the API has no
   expiry-update endpoint). It is unchanged.
7. **Brand isolation** is unchanged: the brand list comes from `/api/brands` (scoped by the
   API), and every data call is authorised server-side. The switcher is a convenience only.
   Note that `GET /api/knowledge/*` and `/api/flows` take `brand_name` as a query parameter;
   confirm that the API checks the caller's access to that brand name on every route.

## Overview refinement pass: data notes

- **Test sessions.** The agent API cannot list sessions, so the Overview counts a brand's test
  sessions as the union of (a) sessions this user ran for that brand (remembered locally, keyed
  by brand id) and (b) sessions that received feedback (brand-wide for admins, from
  `agent-feedback`). It is labelled "Test sessions" for admins and "Your test sessions" for
  everyone else, and never mixes brands. "Last tested" is the newest timestamp across both.
  A server-side session list (or a `last_tested_at` on the brand) would make this exact.
- **Knowledge source count** is not shown. `GET /api/pipelines` returns import runs (max 20,
  each assembled with its own queries) rather than a source list, so it is neither cheap nor an
  accurate count of sources. A lightweight sources endpoint would unlock it.
- **Readiness** counts only checks the current role can make (brand voice and integrations may
  be unknown for non-admins and are excluded from the total instead of guessed).
- **Knowledge updates this week** uses `updated_at` / `created_at` on FAQ and SOP points.
