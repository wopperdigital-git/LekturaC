---
name: Lektura
description: The app chrome around an AI-made slide deck, set as the identity of the user's own conference — badge stock, true ink, one signal orange, four track colours.
colors:
  signal-orange: "#ff5a1f"
  signal-orange-text: "#b8400f"
  signal-orange-night: "#ff6a33"
  signal-orange-text-night: "#ff8a5c"
  signal-orange-on-ink: "#ff5a1f"
  signal-orange-on-ink-night: "#b8400f"
  track-teal: "#00a6a6"
  track-teal-text: "#007274"
  track-teal-night: "#19b8b8"
  track-teal-text-night: "#4fd1d1"
  track-sun: "#ffc93c"
  track-cobalt: "#2b59ff"
  on-track-ink: "#111111"
  crimson-danger: "#c8102e"
  crimson-danger-text: "#b00d27"
  crimson-danger-night: "#d6303a"
  crimson-danger-text-night: "#ff8f8f"
  badge-white: "#ffffff"
  hall-wash: "#f4f4f2"
  stock-surface: "#efefeb"
  stock-secondary: "#e3e3dd"
  rule-grey: "#dcdcd6"
  true-ink: "#111111"
  programme-grey: "#55554f"
  night-stock: "#1a1a19"
  night-hall: "#111110"
  night-surface: "#242422"
  night-secondary: "#2e2e2b"
  night-rule: "#34342f"
  warm-white-ink: "#f2f2ee"
  night-programme-grey: "#a8a8a0"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  wordmark:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  dialog-title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  nav:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  meta:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.1em"
rounded:
  control: "6px"
  card: "10px"
  chip: "4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  card-x: "20px"
  lg: "24px"
  section: "28px"
  rail: "264px"
  page-max: "80rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.on-track-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.badge-white}"
    textColor: "{colors.true-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.stock-surface}"
  button-ghost:
    textColor: "{colors.true-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.crimson-danger}"
    textColor: "{colors.badge-white}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.badge-white}"
    textColor: "{colors.true-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  nav-link:
    textColor: "{colors.programme-grey}"
    typography: "{typography.nav}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  nav-link-active:
    backgroundColor: "{colors.true-ink}"
    textColor: "{colors.badge-white}"
  view-tab-active:
    backgroundColor: "{colors.true-ink}"
    textColor: "{colors.badge-white}"
    padding: "6px 14px"
  deck-card:
    backgroundColor: "{colors.badge-white}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  count-badge:
    backgroundColor: "{colors.track-sun}"
    textColor: "{colors.on-track-ink}"
    rounded: "{rounded.chip}"
    height: "20px"
  status-chip:
    backgroundColor: "{colors.track-sun}"
    textColor: "{colors.on-track-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  dialog:
    backgroundColor: "{colors.badge-white}"
    textColor: "{colors.true-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: Lektura

## Overview

**Creative North Star: "The Conference Programme"**

Every deck is a session at the user's own conference, and the chrome is that event's identity: white badge stock on a pale hall wash, true ink black, one signal orange for "act here", and four track colours (orange, teal, sun, cobalt) that always mean "which track". The dashboard reads as the printed programme: a four-colour track band over an expanded title, then the sessions, each deck wearing a badge with a punched lanyard slot and its track stripe. The system refuses the grey SaaS shell with one soft brand accent and rounded floating cards.

Density is a working desk's: a 264px rail, a page column capped at 80rem, 0.875rem body text, controls ruled in 1.5px ink rather than tinted. Archivo is the only chrome face; its expanded width (125%) is reserved for the wordmark and page and dialog titles, so the loudest type is always a name, never a label. Surfaces sit flat; only what floats casts a shadow.

Scope: this system governs the `app-*` chrome only (dashboard, editor bars and panels, dialogs, login, classroom and quiz pages). The five celestial slide themes (`slide-*` tokens in `src/lib/theme-tokens.ts` and `src/lib/celestial.ts`, applied inside a scoped `ThemeProvider`) and `/welcome` are outside it and unchanged. Chrome and slide tokens never mix: chrome components read `app-*` only, slide layouts read `slide-*` and `--slide-font-*` only.

**Key Characteristics:**
- White badge stock, a pale hall wash, true ink; a separate near-black palette for dark mode.
- Four track colours that mean "which track"; orange doubles as the one action colour.
- Archivo variable throughout; expanded 125% only for the wordmark and titles.
- Uppercase tracked caps for section heads and field captions; no kickers above headings.
- Controls ruled in 1.5px ink at rest; 6px corners on controls, 10px on cards.
- Shadow only on what floats; the badge lifts on hover; the lanyard tab slides between nav rows.

## Colors

A high-contrast event palette: neutral ink and badge white carry the structure, four saturated track fills carry identity, and orange alone says "act here".

### Primary
- **Signal Orange** (`--app-accent`, `--app-track-orange`): the one action fill (primary button, active-icon tint, lanyard tab, progress fill, focus outline, caret) and the orange track. Ink text sits on it, never white.
- **Signal Orange, text weight** (`--app-accent-text`): orange darkened for links and text on white and the wash ("Sign up", "Review"). Dark mode uses the night values from the frontmatter.

### Secondary
- **Track Teal** (`--app-highlight`, `--app-track-teal`): the teal track, and the success colour. Success panels are a 12% teal tint with a 40% teal border and teal-text copy; the avatar disc is solid teal with ink.
- **Track Sun** (`--app-track-sun`): the sun track, nav count badges, the "Check sources" chip, warning banners as a 25% tint under foreground text, and the text selection (60% sun).
- **Track Cobalt** (`--app-track-cobalt`): the cobalt track. Fill only.

### Tertiary
- **Crimson Danger** (`--app-danger`, `--app-danger-text`): destructive buttons (white text), invalid field borders and the 25% focus ring on an invalid field, error copy, error alerts as a 10% tint. Cooler than the orange so Delete never reads as "act here".

### Neutral
- **Badge White** (`--app-background`): cards, rail, fields, buttons, dialogs.
- **Hall Wash** (`--app-canvas`): the page behind everything; the scrollbar track; the punched slot's hole.
- **Stock Surface** (`--app-surface`): hover fill on secondary and ghost controls, info alerts, the editor mode-tab tray.
- **Stock Secondary** (`--app-secondary`): secondary fills.
- **Rule Grey** (`--app-border`): hairlines (rail edge, card frame at rest, dialog frame at 70%, panel dividers, scrollbar thumb). Decorative only (1.38:1 on white); never the only edge of a control.
- **True Ink** (`--app-foreground`, `--app-on-track`): all text, the 1.5px control rule, the active nav row and view segment fill, text on every track fill in both modes.
- **Orange on Ink** (`--app-accent-on-foreground`): orange marks drawn on the foreground fill (the active nav row's icon, the active view segment's lanyard bar). The fill orange in light; in dark the fill turns warm white, so it deepens to `#b8400f` to keep 3:1.
- **Programme Grey** (`--app-muted`): captions, meta, inactive nav, placeholders.
- **Night palette** (`[data-theme='dark']`): Night Stock, Night Hall, Night Surface, Night Secondary, Night Rule, Warm White Ink, Night Programme Grey. A separate palette, not the light one inverted; orange steps brighter, track fills stay, ink stays on orange and on every track.

Verified contrast (computed from the hex values, WCAG 2.x):

| Pair | Light | Dark |
|---|---|---|
| Ink on page / wash | 18.88 / 17.15 | 15.52 / 16.83 |
| Muted on page / wash / surface | 7.50 / 6.81 / 6.51 | 7.28 / 7.89 / 6.50 |
| Orange text on page / wash | 5.56 / 5.05 | 7.50 / 8.13 |
| Ink on orange fill | 6.06 (white would be 3.12) | 6.62 |
| Teal text on page | 5.74 | 9.43 |
| Teal text on 12% teal tint | 5.03 | 7.81 |
| Ink on teal / sun / cobalt fill | 6.30 / 12.29 / 3.57 | teal 7.72 |
| White on danger fill | 5.88 | 4.84 |
| Danger text on page / on 10% tint | 7.16 / 6.03 | 7.94 |
| Foreground on 25% sun tint | 16.94 | 8.25 |
| Active nav row (page colour on ink) | 18.88 | 15.52 |
| Orange mark on the ink fill (`--app-accent-on-foreground`: active nav icon, active view segment bar) | 6.06 | 4.95 |

### Named Rules
**The Track Means Track Rule.** Orange, teal, sun and cobalt identify which track something belongs to (a deck's badge stripe, the band over page titles). They are never decoration beyond that, and never a second action colour.

**The One Signal Rule.** Orange is the only action colour. One filled orange control per view; everywhere else orange is a mark (the lanyard tab, an active icon, a focus outline, the caret).

**The Ink On Track Rule.** Text on any solid track fill is ink (`--app-on-track`) in both modes. Warm white on sun is 1.37:1. Ink on cobalt is 3.57:1, so cobalt carries no body-size text at all.

**The Tokens For State Rule.** Success uses the teal highlight tokens; warnings use sun tints with foreground text; errors use crimson. No raw amber, emerald, blue or other palette utilities in chrome.

## Typography

**Display Font:** Archivo Variable at 125% width (with Archivo, system-ui, sans-serif)
**Body Font:** Archivo Variable at normal width (same stack)
**Label Font:** Archivo, uppercase, tracked 0.1em, weight 700

**Character:** One grotesque in two cuts. The expanded extrabold cut is the event's signage: the wordmark, page titles, dialog titles, the login headline. The normal cut does all the work. Loaded from `@fontsource-variable/archivo/wdth.css` (width 62–125%, weight axis).

### Hierarchy
- **Display** (800, 2rem rising to 2.75rem from 640px, line-height 1.05, expanded): dashboard page titles under the track band.
- **Headline** (800, 1.875rem, expanded): the login and sign-up title; the login panel's own headline is 2.25rem, line-height 1.08, in white.
- **Wordmark** (800, 1.3125rem, uppercase, line-height 1, expanded): "LEKTURA" beside the badge mark.
- **Dialog title** (800, 1.125rem, expanded): every `Modal` title.
- **Title** (700, 1rem): deck card titles, list row names.
- **Nav** (400, 0.9375rem; 600 when active): rail links.
- **Body** (400, 0.875rem): fields, menus, alerts, subtitles at 1rem; buttons at 0.875rem weight 700.
- **Meta** (400, 0.75rem, programme grey): "Updated 2 hours ago", field hints and errors.
- **Label** (700, 0.6875rem, uppercase, 0.1em tracking): rail section heads and field captions in programme grey; tools-panel section heads in ink at 11px. Tools-panel field captions are sentence case at 11px, weight 500, muted.

### Named Rules
**The Expanded Is For Names Rule.** The 125% width (`.display`) is used only for the wordmark and page, auth and dialog titles. Everything else stays at normal width.

**The Caps Label Rule.** Section heads and field captions are `.caps`: uppercase, 0.1em tracking, weight 700, sized where used. There is no kicker or eyebrow above a heading; caps label a group or a field, never introduce a title.

**The Chrome Face Stays Out Of Slides Rule.** Archivo is `--app-font`; slide content reads `--slide-font-*` only.

## Layout

The dashboard is a fixed 264px rail beside a scrolling main column on the hall wash. The main column centres at a maximum of 80rem with 20px side padding, 32px from 640px and 40px from 1024px, 32px top and bottom. Page heads stack: the track band (8px tall, 24px below it), the display title with a 1rem muted subtitle 8px under it, then a toolbar row (segmented Grid/List on the left; Filter and the orange "New presentation" on the right). Deck badges run three-up on desktop and one-up on phone.

Below 1024px the rail becomes an off-canvas drawer behind a 36px menu button beside the title; there is no duplicate mobile header. Rail sections are 28px apart, links stack 2px apart, with 8px under each caps head. Card bodies pad 16px by 20px; dialogs 24px; buttons 8px by 16px; fields 8px by 12px.

The editor keeps its own geometry (see CLAUDE.md): phone under 768px, compact 768–1099px (panels open over the canvas), full from 1100px; a 280px tools panel on the right and a floating toolbar at the top centre of the canvas. On touch screens the top bar, floating toolbar and slide-action buttons are 44px.

## Elevation & Depth

Flat by default, structure from rules and fills. One shadow token, `--app-shadow`, for everything that floats: two layers of ink at low alpha in light (6% at 2px/4px, 14% at 12px/30px), black at 40% and 50% in dark. The badge's punched slot uses an inset shadow, which reads as a hole in the stock, not as height.

### Shadow Vocabulary
- **Float** (`--app-shadow`): deck cards while hovered (with the lift), menus, popovers, dialogs, the floating editor toolbar, job rows.
- **Punched slot** (`inset 0 1px 2px rgba(17,17,17,0.35)` plus a 1px ink ring at 40%): the lanyard slot on each deck card.

### Named Rules
**The Only What Floats Rule.** If it sits on the page it is flat, edged by a hairline or ruled in ink. If it floats over the page, or is being lifted by the pointer, it takes the float shadow. Nothing has a resting shadow.

## Shapes

Badge corners: 10px on cards, panels and dialogs (`--app-radius`), 6px on controls (`--app-radius-sm`: buttons, fields, nav rows, segmented tabs). Small inline chips (nav count badges, the search shortcut hint, the "Check sources" chip) are 4px. Fully round only for the avatar, round icon buttons (dialog close, settings gear), status dots and the punched slot.

Controls are ruled in 1.5px ink at rest (`border-[1.5px] border-app-foreground`): secondary buttons, fields, the rail search, the segmented view tabs and their dividers. Primary and danger buttons carry a 1.5px border in their own fill colour so every button is the same size. Cards and dialogs use a 1px hairline instead; a deck card's hairline turns ink on hover.

The recurring silhouette is the badge: a tall-cornered card, a pill-shaped slot centred near its top, and a 6px track stripe under the cover. The wordmark's glyph (`BadgeMark`) draws the same thing small.

## Components

### Buttons
Tactile and printed: ink rule, bold label, no gradients.
- **Shape:** control corners (6px), 1.5px border on every variant except ghost.
- **Primary:** signal orange fill and border, ink label at 0.875rem weight 700, 8px by 16px. Hover brightens 5%, press darkens 5%.
- **Secondary (default):** badge white, ruled in ink; hover fills with stock surface.
- **Ghost:** no fill, no border; hover fills with stock surface.
- **Danger:** crimson fill and border, white label; hover brightens 10%.
- **Focus:** 2px orange outline, 2px offset. Disabled at 50% opacity. Transitions on background, filter and box-shadow at 150ms.

### Inputs / Fields
- **Style:** badge white, 1.5px ink rule, 6px corners, 8px by 12px, 0.875rem; placeholder in programme grey.
- **Focus:** a 3px orange ring at 35% (the border stays ink).
- **Error:** crimson border, 3px crimson ring at 25% on focus, error line under the field in danger text with a circled-mark icon.
- **Caption:** a `.caps` label 6px above, 0.6875rem, programme grey.

### Cards / Containers
- **Deck badge:** 10px corners, badge white, 1px rule-grey hairline. The 16:9 live cover sits flush under the top corners; a 6px track stripe (`trackFill(deckTrack(id))`) separates it from the body; title (1rem, 700) and updated time (0.75rem, muted) pad 16px by 20px. A 40px by 8px pill slot is punched at the top centre (hall-wash fill, inset shadow, 1px ink ring at 40%).
- **Hover:** the badge lifts 4px, its hairline turns ink and it takes the float shadow (200ms ease-out). Under reduced motion the lift is off.
- **Empty deck:** the cover is a gradient from the deck's track into the next track.

### Navigation
- **Rail:** badge white with a rule-grey right edge, following the app theme (no longer always-dark). Wordmark at the top, then the ink-ruled search (with a ⌘F / Ctrl F hint chip and the orange focus ring), then caps section heads.
- **Links:** 0.9375rem, programme grey, 6px corners, 8px by 12px; hover fills stock surface and turns ink. **Active:** filled in ink with page-colour text at weight 600, its icon tinted orange, its count badge orange with ink.
- **Count badge:** sun fill, ink text, 0.75rem weight 700, tabular figures, 4px corners.
- **Lanyard tab:** one 16px by 6px orange bar on the rail's right edge, centred on the active link; it slides between rows (`top`, 320ms, `cubic-bezier(0.16, 1, 0.3, 1)`), and does not move under reduced motion.

### Segmented tabs
- **Dashboard view tabs (Grid / List):** an ink-ruled 6px group with 1.5px ink dividers; the active segment is filled in ink with page-colour text and wears a 20px by 4px orange lanyard tab at its bottom centre.
- **Editor mode tabs (Edit / Narrate):** a stock-surface tray with 10px corners; the selected mode is a badge-white chip with a hairline ring and the same orange lanyard tab.

### Dialog
- **Style:** badge white, 10px corners, 1px rule-grey frame at 70%, float shadow, 24px padding, over a 50% black backdrop with a slight blur. Title in the expanded dialog cut; a round close button in the top right (hover stock surface, orange focus outline).

### Alerts and notices
- **Success:** teal tint (12%) with a 40% teal border and teal-text copy.
- **Error:** crimson tint (10%) with a 30% crimson border and danger-text copy.
- **Info:** stock surface, hairline, ink copy.
- **Check sources notice (editor):** a full-width strip under the top bar with a sun "CHECK SOURCES" caps chip (4px), the sentence in ink, an orange-text "Review" link and a muted "Hide for now". Warnings elsewhere are a 25% sun tint with foreground text.

### Track band (signature)
The four tracks side by side in equal segments (orange, teal, sun, cobalt), 8px tall over page titles. Decorative and hidden from assistive tech.

### Tools panel (editor)
App chrome on badge white with 10px corners. Sections in a fixed order (Typography, Fill, Theme), each headed in ink caps at 11px with the scope in muted text on the right; filled fields without a border until hover or focus; theme choices as wireframe tiles in each theme's own colours, the current one framed in ink.

## Do's and Don'ts

### Do:
- **Do** use signal orange for the one primary action per view, the lanyard tab, active icons, focus outlines and the caret, and nothing more.
- **Do** put ink text on every track fill and on the orange (`--app-on-track`, `--app-accent-foreground`).
- **Do** use the four tracks only to say which track something belongs to, and the track band over page titles.
- **Do** rule controls in 1.5px ink at rest, with 6px corners on controls and 10px on cards and dialogs.
- **Do** set section heads and field captions in `.caps` (uppercase, 0.1em, 700).
- **Do** keep the expanded width for the wordmark and page, auth and dialog titles.
- **Do** use teal tokens for success, sun tints with foreground text for warnings, crimson for errors.
- **Do** keep the badge lift and the lanyard slide off under `prefers-reduced-motion`.
- **Do** build light and dark as separate palettes from the `app-*` tokens.

### Don't:
- **Don't** put white text on the orange (3.12:1) or any text on cobalt fills (ink is 3.57:1).
- **Don't** use orange or a track colour as a second action colour or as ornament.
- **Don't** place a kicker or eyebrow above a heading.
- **Don't** give a card, field, button or bar a resting shadow.
- **Don't** use raw amber, emerald, blue or other palette utilities in chrome; use `app-*` danger, highlight, accent and track tokens.
- **Don't** let `app-*` tokens or Archivo reach slide content, or `slide-*` tokens reach chrome.
- **Don't** set body or label text in the expanded width.

## Known gaps

Open items, stated as they stand in the build:

1. A deck's track colour is a hash of its id (`deckTrack`), so it carries no meaning yet.
2. The editor carries little of the world beyond tabs, caps and buttons; the top bar, Create & export menu and floating toolbar are largely unrestyled.
3. The login panel's visual is still a constellation starfield, recoloured, on a literal `#111110`.
4. JobTray rows are not yet restyled as ink-ruled badges (hairline frame, float shadow).
