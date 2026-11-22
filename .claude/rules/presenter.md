---
paths:
  - "src/present/**"
  - "src/components/present/**"
  - "src/pages/PresentPage.tsx"
---

# Presenter view (`src/present/`, `components/present/`)

Spec: `2026-11-12-presenter-view-design.md`. Console (`PresenterConsole`) + projector window (`SlideWindow`), same route as Present with `?view=presenter|screen&session=<id>`. No network, AI or DB.

- **The console owns all state** (`presenterState.ts`, pure); the slide window renders what it's sent. `BroadcastChannel` `lekturac:present:<session>`; **every message is zod-parsed** (`protocol.ts`).
- The deck is a frozen snapshot message; the slide window never reads Supabase. Only `frameScale` is imported from `src/video`; keep it that way.
- A reload resumes from `sessionStorage`. **Liveness is silence** (`alive` every 1 s, banner after 3 s; 10 s grace while connecting), not `popup.closed`. The slide window never closes on its own (`bye` only blacks it); only `end` closes it.
- **`window.open` runs inside the click**, or pop-up blockers refuse it.
- **Escape must be pressed twice within 2 s to end** (a clicker's button alternates F5/Esc). Console buttons refuse focus on mousedown, or a clicked Pause eats the next Space.
