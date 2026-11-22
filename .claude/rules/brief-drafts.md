---
paths:
  - "src/lib/briefDrafts.ts"
  - "src/pages/DraftsPage.tsx"
  - "src/pages/CreatePage.tsx"
  - "src/components/home/DraftRow.tsx"
  - "src/lib/temporaryInk.ts"
  - "src/jobs/newItems.ts"
---

# Brief drafts (`src/lib/briefDrafts.ts`)

Unfinished briefs live at `/drafts`. All reads/writes go through this file (moving to Supabase later = rewriting only it).

- `localStorage` key `lekturac:brief-drafts:<uid>`; writes try/catch'd. **Namespaced by user id, load-bearing**: `signOut()` only clears the session. `storageKey()` returns `null` while hydrating and reads/writes skip; never fall back to an un-namespaced key.
- `purgeForeignDrafts()` runs on sign-**in**, never sign-out. Order in that subscription is load-bearing: drop cache → `listDrafts()` (adopts legacy keys) → purge.
- `useDrafts()` is `useSyncExternalStore`; `listDrafts()` caches its array and rebuilds only on mutation/`storage` event (an unstable snapshot re-renders forever). `MAX_DRAFTS = 30`.
- The **user-namespaced, no fallback, null-while-hydrating** pattern is reused by temporary ink, new-item dots and quiz answers.
