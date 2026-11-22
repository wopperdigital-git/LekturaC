---
paths:
  - "src/export/**"
---

# PPTX export (`src/export/`)

`exportDeckToPptx(deck)` makes native, editable slides. **Read "Implementation invariants" in `docs/superpowers/specs/2026-09-19-pptx-fit-design.md` (and `2026-08-25-pptx-export-design.md`) before changing anything here.**

- Nothing in `src/export/` imports React. Dashboard export uses `fetchDeck`, not `loadDeck`.
- Fits text itself; exact-point `lineSpacing`, never `lineSpacingMultiple`. Any nudged element routes the card to the `adjusted` path.
- Photos are prefetched once and passed in a `RenderContext`; a failed fetch leaves alt text, never fails the export. Pictures are placed with their real aspect from the header, never stretched.
- Grounds: tint/deep slides get a flat background and a `groundTheme`, so renderers don't know grounds exist.
- `starPositions` is shared with `lib/celestial.ts`; its `rand()` draw order is load-bearing. The backdrop draws only `radial-gradient` glow layers.
- **Gaps:** the redrawn arrangements and density compositions aren't exported (old arrangements are drawn); the seven newer layouts map onto old ones (`GROUP_BY_LAYOUT`); `card.overlay` isn't exported.
