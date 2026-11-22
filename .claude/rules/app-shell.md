---
paths:
  - "src/App.tsx"
  - "src/components/home/**"
  - "src/components/editor/**"
  - "src/pages/HomePage.tsx"
  - "src/pages/EditorPage.tsx"
  - "src/lib/editorLayout.ts"
  - "src/lib/useEditorLayout.ts"
  - "src/lib/motion.ts"
---

# App shell & motion

## App shell

- **Dashboard** (`DashboardShell`, always-dark `AppSidebar`; drawer below `lg`). Search binds ⌘F/Ctrl+F only when the page passes `onQueryChange`. `deckFilters.ts` `selectDecks()` does search+filter+sort.
- **Deck covers** are the first slide rendered live, never a stored screenshot. `listDecks` fetches covers in one query (`order_index = 0`; `cardMutations.ts` keeps orderIndex gapless). The row → `Card` mapping is the shared `cardFromRow`.
- **Narrow windows** (`lib/editorLayout.ts`): <768px `phone` shows read-only `PhoneDeckView`; 768–1099px `compact` opens panels over the canvas. **Drags follow one pointer** (`pointerDrag.ts`); a second finger ends a move.
- **Editor** (`EditorPage`): outline panel left, tools panel right (`ToolsPanel`, Figma-style sections Typography → Fill → Theme, Edit/Narrate tabs above it), floating toolbar top-centre (undo/redo, Select/Move, Layout, Insert, pen, shapes; a sibling of the scrolling `<main>`). `TopBar`: title, save status, zoom, Create & export menu, Present menu, account menu.
- **Outline thumbnails** scale to the rail's measured width; the rail has **no visible scrollbar** (`scrollbar-none`), which is load-bearing (a space-taking scrollbar creates a resize loop). Don't make it visible without `scrollbar-gutter: stable`.

## Motion (`src/lib/motion.ts`)

GSAP via `useMotion` (inside `gsap.context`, reverted on unmount). Every preset is `gsap.from` with `clearProps` and has a reduced-motion path. **Never animate a slide surface, the editor canvas or anything `SelectionLayer`/`measureBlock` measures**: a leftover transform skews `getBoundingClientRect`.
