# Orb

Orb turns business sources into draft SOPs, FAQs, and product knowledge. The landing page stays at `/`; the protected app begins at `/app`.

## Run locally

```bash
npm install
npm run dev
npm run build
```

## App routes

- `/app` — onboarding generator or content overview
- `/app/sops` — generated SOPs and editor drawer
- `/app/faqs` — generated FAQs and editor drawer
- `/app/settings?tab=profile` — account and workspace setup

Old `/app/knowledge-packs` and `/app/templates` URLs redirect to `/app`.

## Mock login and generation

Authentication is local mock auth. Any valid email and a password with at least six characters work immediately. Sign-up keeps the entered display name in browser storage.

## Roles

The mock backend stores a `role` for every user: `admin` or `client`. The first local account is an admin and subsequent accounts begin as clients. Use the avatar menu’s **Demo role** controls to preview each dashboard role; assignments are persisted in `localStorage`. The future Supabase equivalent is in `supabase/migrations/20261022_add_orb_profile_roles.sql`.

The generation demo starts with no content. Add a source, select outputs, and choose **Generate**. The mock job moves from Queued to Running to Done in roughly eight seconds, then creates draft records. Data persists in browser local storage, including when you refresh or navigate away. Use **Settings → Sources → Load sample data** to seed the workspace.

To replace the mock generation backend, edit only [`src/services/generation.js`](src/services/generation.js). Its exported functions are the boundary for a real API. To replace authentication later, edit [`src/services/auth.js`](src/services/auth.js).
