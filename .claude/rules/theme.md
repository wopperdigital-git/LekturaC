---
paths:
  - "src/index.css"
  - "src/main.tsx"
  - "src/lib/theme-tokens.ts"
  - "src/lib/appTheme.ts"
  - "src/lib/celestial.ts"
  - "src/components/theme/**"
  - "src/components/ui/**"
  - "src/components/layouts/**"
---

# Theme system (the main styling gotcha)

`src/index.css` defines two CSS-variable namespaces bridged into Tailwind v4 via `@theme inline` (no `tailwind.config.*`).

- **`app-*`**: all app chrome, never changes with a deck theme. Light and dark are separate palettes. `--app-accent-text`/`--app-highlight-text` are for text; `--app-accent`/`--app-highlight` for fills.
- App light/dark (`lib/appTheme.ts`): `mode` (setting) vs `theme` (resolved); paint code reads `theme`. `dark:` is rebound to `[data-theme='dark']`. **`AuthVisualPanel` and `AppSidebar` are always dark.**
- **`slide-*`**: the deck theme, applied only inside a scoped `ThemeProvider` (`applyTheme(theme, ref)`), never on `<html>`. `layouts/*` use `slide-*` only; `components/ui/*` use `app-*` only.
  - **`applyTheme` must stay in `useLayoutEffect`** (a passive effect flashes the `:root` fallback palette).
  - **Read slide fonts as `var(--slide-font-heading)` / `var(--slide-font-body)`** (`SLIDE_HEADING_FONT`/`SLIDE_BODY_FONT`), never a `--font-slide-*` alias (an `@theme inline` alias is substituted once on `:root` and blinds scoped overrides; a test fails on it). **Every element carrying words sets one of the two fonts on its own root.**
- `BUILTIN_THEMES` is the only source; thirteen presets. **`DEFAULT_THEME` is found by id `bordo`**, and the `:root` slide block in `index.css` mirrors Bordo. **Celestial theme ids stay `minimal/editorial/midnight/bold/sage`** (deck rows key on them). New ids are additive. Each theme's colours include `deep`, `deepForeground`, `tint`; no ground/ink/surface/accent-foreground is pure white or black.
- Theme fonts are Fontsource web fonts imported in `main.tsx`. A stack names the real family first and `<Family> Variable` second (the PPTX names a face by the **first** family). **Adding a theme font = the package, the `main.tsx` import, and the font test's table.**
- **New decks start on a random preset, not `DEFAULT_THEME`** (`pickFreshTheme`): both `createDeck` and `insertGeneratedDeck` skip the themes of the owner's last `FRESH_THEME_LOOKBACK` (5) decks, read best-effort by `recentThemeIds` (a failed read just means a plain random pick). `DEFAULT_THEME` is now only the fallback for unknown ids and the `:root` palette.
- `loadDeck` runs a stored theme through `resolveTheme` (match on `id`) so old decks pick up redesigns.
- `lib/theme-tokens.test.ts` pins per-theme contrast of grounds and inks, theme order, web-font imports.
- **Celestial backdrops** (`lib/celestial.ts`, `SlideBackdrop.tsx`): CSS/SVG layers, never images. The sky is **seeded on the theme id**; `starPositions` is shared with the PPTX export and **its `rand()` draw order is load-bearing**. The PPTX backdrop draws only `radial-gradient` glow layers.
