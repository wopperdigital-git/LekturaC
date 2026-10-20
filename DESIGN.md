---
name: Lektura
description: The app chrome around an AI-made slide deck, set as a reference edition: bone page, iron-black ink, one vermilion rubric.
colors:
  rubric-vermilion: "#c23a2a"
  rubric-vermilion-text: "#a8301f"
  rubric-vermilion-text-night: "#e8664c"
  on-rubric: "#ffffff"
  brick-danger: "#8a1c1c"
  brick-danger-text-night: "#f19a8a"
  verdigris: "#3d6b4f"
  verdigris-text: "#2f5a40"
  verdigris-text-night: "#7fb393"
  bone-page: "#f7f3ea"
  bone-surface: "#ebe4d6"
  bone-canvas: "#efe9dd"
  bone-secondary: "#ddd5c5"
  hairline: "#cfc6b4"
  iron-ink: "#1a1a1a"
  slate-apparatus: "#5f5a52"
  night-page: "#1c1b19"
  night-surface: "#26241f"
  night-canvas: "#121110"
  night-hairline: "#3b3832"
  bone-ink: "#ece6da"
  night-apparatus: "#a59e90"
  login-panel: "#161513"
typography:
  display:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
    fontVariation: "'opsz' auto"
  headline:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  wordmark:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  subtitle:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.08em"
    fontFeature: "all-small-caps"
  label-panel:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.08em"
    fontFeature: "all-small-caps"
  count:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "0.75rem"
    fontWeight: 600
    fontFeature: "tabular-nums"
rounded:
  app: "0px"
  app-sm: "0px"
  full: "9999px"
spacing:
  field-y: "8px"
  field-x: "12px"
  button-y: "8px"
  button-x: "16px"
  card-inner: "16px 20px"
  modal: "24px"
  rail-width: "264px"
  page-x: "40px"
  page-y: "32px"
components:
  button-primary:
    backgroundColor: "{colors.rubric-vermilion}"
    textColor: "{colors.on-rubric}"
    typography: "{typography.body}"
    rounded: "{rounded.app-sm}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.bone-surface}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.app-sm}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.app-sm}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.brick-danger}"
    textColor: "{colors.on-rubric}"
    rounded: "{rounded.app-sm}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.bone-page}"
    textColor: "{colors.iron-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.app-sm}"
    padding: "8px 12px"
  view-tab-active:
    backgroundColor: "{colors.iron-ink}"
    textColor: "{colors.bone-page}"
    rounded: "{rounded.app-sm}"
    padding: "6px 12px"
  view-tab:
    backgroundColor: "transparent"
    textColor: "{colors.slate-apparatus}"
    padding: "6px 12px"
  nav-link-active:
    backgroundColor: "{colors.bone-surface}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.app-sm}"
    padding: "8px 12px"
  deck-card:
    backgroundColor: "{colors.bone-page}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.app}"
    padding: "16px 20px"
  modal:
    backgroundColor: "{colors.bone-page}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.app}"
    padding: "24px"
  avatar:
    backgroundColor: "{colors.iron-ink}"
    textColor: "{colors.bone-page}"
    rounded: "{rounded.full}"
    size: "32px"
---

# Design System: Lektura

## Overview

**Creative North Star: "The Annotated Edition"**

Lektura's chrome is set like a reference edition. The page is unbleached bone in three steps, the text is iron-black ink, the apparatus (captions, section heads, counts) is slate grey in small caps, and one vermilion rubric marks where to act. Whatever the AI wrote is treated as a text to be read and checked; what qualifies it sits in the margin, keyed to the line it concerns. The system rejects the category default of a white SaaS shell with a single brand-blue or lilac accent and soft rounded cards.

Density is that of a working desk, not a landing page: a 264px rail, a page column capped at 80rem, small body text (0.875rem) in a serif with optical sizing, and hairline rules doing the structural work that tints and shadows would do elsewhere. Surfaces are flat; only things that float above the page cast a shadow.

Scope: this system governs the `app-*` chrome only (dashboard, editor bars and panels, dialogs, login, classroom and quiz pages). The deck's five celestial slide themes (`slide-*` tokens, applied inside a scoped `ThemeProvider`) and `/welcome` are outside it and unchanged. Slides read `--slide-font-heading` / `--slide-font-body` and never the chrome serif.

**Key Characteristics:**
- Bone ground in three steps (page, surface, canvas), iron-black ink, slate apparatus.
- One vermilion rubric for primary action, active marks, focus on buttons, the caret and the detent.
- Source Serif 4 throughout, small caps for apparatus, tabular figures for counts.
- Square corners; circles only for avatars and round icon buttons.
- One-pixel hairlines; shadow only on what floats.
- Selection and "current" are ruled or filled in ink, never in the accent.

## Colors

A paper-and-ink palette with exactly one chromatic voice for action, a darker brick held back for destruction, and a verdigris reserved for success.

### Primary
- **Rubric Vermilion** (rubric-vermilion): the fill of the one primary action per view ("New presentation", a dialog's confirm), the caret colour, the 22% tint of `::selection`, and the keyboard focus outline on buttons and links. White on it clears 5.3:1. It is the same in light and dark.
- **Rubric Vermilion, text weight** (rubric-vermilion-text; rubric-vermilion-text-night at night): every vermilion that is read rather than filled: section heads in the rail, the detent cross, the rubric rule (at 45% opacity), the active nav icon and its count, the fact-check "Note" and its "Review" link. Darkened so it clears AA on every bone step; lightened at night.

### Secondary
- **Brick Danger** (brick-danger; brick-danger-text-night as night text): destructive buttons, invalid field borders, error text and the error alert tint (10% fill, 30% border). Deliberately darker than the rubric (8.4:1 on bone) so a Delete never reads as the vermilion "act here" mark.

### Tertiary
- **Verdigris** (verdigris; verdigris-text, verdigris-text-night): success only. The success alert tint (12% fill, 40% border) and the General-account avatar badge in the rail. White on the fill is 6.2:1.

### Neutral
- **Bone Page** (bone-page): the main reading ground: rail, cards, dialogs, fields, top bar, floating toolbar.
- **Bone Canvas** (bone-canvas): the body and dashboard ground behind the page column; also the scrollbar track.
- **Bone Surface** (bone-surface): the raised step: secondary buttons, hover fills, the active nav row, the active theme tile.
- **Bone Secondary** (bone-secondary): the deepest paper step, for secondary fills.
- **Hairline** (hairline): every 1px rule and frame at rest; the scrollbar thumb.
- **Iron Ink** (iron-ink): all text, the ruled underline of the active nav link, the toolbar strip's bottom rule, the view-tab frame and its active fill, the focused field border, the avatar fill.
- **Slate Apparatus** (slate-apparatus): captions, field labels, meta lines ("Updated 2 hours ago"), placeholders, inactive nav.
- **Night** (night-page, night-surface, night-canvas, night-hairline, bone-ink, night-apparatus): the same edition read at night, iron-black paper with bone ink. A purpose-built palette, not the light one inverted.
- **Login Panel** (login-panel): the always-dark visual panel on `/login`, with a bone and vermilion constellation drawn over it.

### Named Rules
**The One Rubric Rule.** Vermilion marks where to act and what is current, nothing else. One filled vermilion control per view; everything else that is vermilion is a thin mark (a detent, a rule, a section head).

**The Brick Is Not The Rubric Rule.** Destructive and error states use brick danger, never vermilion. If a red on screen could be pressed to delete something, it is brick.

**The Ink Selection Rule.** What is selected or current is ruled or filled in iron ink: the active view tab is filled in ink, the active nav link is ruled in ink beneath, the chosen theme tile is framed in ink, a focused field is bordered in ink. The accent never marks selection.

**The Verdigris For Success Rule.** Verdigris appears only for a success state (and the account badge). It is never decoration and never a second accent.

## Typography

**Display Font:** Source Serif 4 Variable (with Source Serif 4, Georgia, serif)
**Body Font:** the same face
**Label Font:** the same face in all-small-caps

**Character:** a single text serif with an optical-size axis (`opsz`, upright and italic both loaded from `@fontsource-variable/source-serif-4`) so the 2.5rem page title and the 12px panel caption are each drawn for their size. Italic carries the voice of commentary: page subtitles and the fact-check claim.

### Hierarchy
- **Display** (600, 2rem rising to 2.5rem from `sm`, leading tight, -0.015em): the dashboard page title ("Your presentations"), always followed by an italic subtitle and a rubric rule.
- **Wordmark** (600, 1.375rem, leading 1, -0.01em): "Lektura" in the rail and on the login panel, keyed by a detent cross.
- **Headline** (600, 1.125rem, tracking tight): dialog titles, over the rubric rule.
- **Title** (500, 1rem): deck card titles, list row names.
- **Subtitle** (400 italic, 1rem, slate): the line under a page title.
- **Body** (400, 0.875rem): fields, buttons, menus, alerts, panel controls.
- **Label** (600, all-small-caps, 0.08em tracking): field captions (slate, 0.875rem), rail section heads (vermilion text, 0.9375rem), editor panel section titles (ink, 13px) and captions (slate, 12px), the fact-check "Note".
- **Count** (600, 0.75rem, tabular figures): nav badges and any number that sits in a column.

### Named Rules
**The Apparatus Rule.** Section heads and field captions are set in real small caps (`font-variant-caps: all-small-caps; letter-spacing: 0.08em`, the `.apparatus` class), never in uppercase with tracking. All-small-caps keeps a typed capital from standing taller than the rest.

**The Tabular Count Rule.** Counts and badges use tabular figures so a column of numbers aligns.

**The Chrome Serif Stays Out Of Slides Rule.** The chrome serif is `--app-font`; slide content reads `--slide-font-*` only.

## Layout

The dashboard is a fixed 264px rail (bone page, hairline right edge) beside a scrolling page column on the bone canvas, centred to 80rem with 20px / 32px / 40px side padding by breakpoint and 32px top. The page head stacks title, italic subtitle and a rubric rule (20px above it), then a toolbar strip whose bottom edge is a 1px ink rule (12px below its controls), then the deck grid of square hairline frames. Below `lg` the rail becomes an off-canvas drawer over a 50% black scrim; there is no second mobile header.

The editor is a top bar on the bone page with a hairline bottom rule, a floating outline on the left, a 280px tools panel on the right, and a floating toolbar centred over the canvas. A marginal note (the fact-check notice) can hang directly under the top bar, joined to it.

Spacing rhythm is small and regular: 8px / 12px inside controls, 16px x 20px inside cards, 24px inside dialogs, 28px between rail sections. On touch screens bar and toolbar controls grow to 44px.

## Elevation & Depth

Flat by default. Depth is carried by the three bone steps and by hairlines, not by shadows: cards, the rail, the top bar, the toolbar strip and fields cast nothing. A shadow appears only on what floats above the page: menus, popovers, the Select listbox, dialogs, the floating editor toolbar and tooltips.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 1px 2px rgba(26, 20, 12, 0.06), 0 10px 26px rgba(26, 20, 12, 0.12)`): every floating layer in light mode.
- **Float, night** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 28px rgba(0, 0, 0, 0.5)`): the same layers at night.
- **Ink underline** (`box-shadow: inset 0 -1px 0 var(--app-foreground)`): not depth but a rule; the active nav link's ink underline.

### Named Rules
**The Only What Floats Rule.** If it sits on the page, it is flat and framed by a hairline. If it floats over the page (menu, popover, dialog, floating toolbar), it takes the float shadow.

## Shapes

Square. Both app radii are 0px: buttons, fields, cards, dialogs, menus, tabs and panels are all square frames, as a ruling engine draws them. Circles are the one exception and stay circles: avatars, round icon buttons (dialog close, the deck kebab) and status dots. Frames are 1px hairlines at rest and turn to ink on hover (deck cards) or focus (fields).

The recurring mark is the **detent cross**: a 10px drawn cross (1px strokes) with a 3px filled square at its centre, in rubric text. It keys rail section heads, follows the wordmark, sits at the centre of the rubric rule and keys the marginal note.

## Components

### Buttons
Square, compact, decisive.
- **Shape:** square (0px), 8px x 16px, 0.875rem medium.
- **Primary:** rubric vermilion fill, white text; hover brightens 10%, active darkens 5%.
- **Secondary:** bone surface fill, ink text, 1px hairline frame; hover deepens toward the hairline.
- **Ghost:** transparent, ink text; hover takes the bone surface.
- **Danger:** brick fill, white text.
- **Focus:** 2px vermilion outline offset 2px (keyboard only). Disabled is 50% opacity.

### Inputs / Fields
- **Style:** bone page fill, 1px hairline frame, square, 8px x 12px, slate placeholder.
- **Focus:** ruled in ink: the frame turns iron ink with a 1px ink ring. Not vermilion, which read as an error beside the brick invalid state.
- **Error:** brick frame and ring; the message below in danger text led by a drawn circle-and-bar icon (SVG, 1.5px stroke).
- **Caption:** an apparatus label above (small caps, slate, 600).

### Chips / Segmented controls
- **View tabs:** one ink-framed strip divided by ink rules; the active segment is filled in ink with bone text, inactive segments are slate and take the bone surface on hover.

### Cards / Containers
- **Deck card:** square, bone page fill, 1px hairline frame that turns ink on hover, no shadow. The cover sits above a hairline; title in title type and an updated line in slate below.
- **Deck kebab:** a round 32px icon button; on a cover it is a bone chip with a hairline frame that turns ink on hover.
- **Alerts:** square tinted strips: error in brick (10% fill), success in verdigris (12% fill), info on bone surface with a hairline.

### Navigation
- **Rail section head:** apparatus label in rubric text, keyed by a detent cross.
- **Link:** 0.9375rem, slate; hover takes bone surface and ink. **Active:** bone surface, 600 ink text, a 1px ink rule beneath, its icon and count in rubric text.
- **Top bar:** bone page with a hairline bottom rule; the account avatar is an ink circle with bone initials.

### Dialogs
Square bone page, hairline frame at 70%, float shadow, 24px padding, over a 50% black scrim with a light blur. The headline title sits over a rubric rule; the close is a round icon button.

### The Rubric Rule (signature)
A 1px rule in rubric text at 45% opacity with a detent cross at its centre, set under every page title and every dialog title. Decorative and hidden from assistive tech.

### The Marginal Note (signature)
The editor's fact-check notice is set as the top bar's marginal note, not a banner. It overlaps the bar's rule by 1px and draws the rule below itself so bar and note read as one head. Inside, a 1px vermilion hairline (60%) runs down the left margin, keyed at its middle by a detent cross; then a small-caps "Note" in rubric text, the claim in italic ink, a "Review" link in rubric text and a quiet slate "Hide for now".

### Editor tools panel
Sections titled in ink small caps (13px, 600) with context in slate on the right; each field captioned in slate small caps (12px). Theme tiles are wireframes in each theme's own colours; the chosen tile is framed in ink on the bone surface.

## Do's and Don'ts

### Do:
- **Do** use rubric vermilion for the single primary action, the detent, rail section heads and keyboard focus on buttons, and nothing more.
- **Do** use brick danger for every destructive button, invalid field and error message.
- **Do** mark selection and the current item in iron ink: fill, frame or a 1px rule beneath.
- **Do** keep every app frame square (0px) and use `rounded-full` only for avatars, round icon buttons and dots.
- **Do** set section heads and field captions as `.apparatus` small caps, and counts in tabular figures.
- **Do** put the rubric rule under page and dialog titles, and an italic subtitle under a page title.
- **Do** keep the float shadow for menus, popovers, dialogs, tooltips and the floating toolbar.
- **Do** draw marks and icons as inline SVG at a 1 to 1.6px stroke.

### Don't:
- **Don't** fill a destructive or error state in vermilion.
- **Don't** mark a selected tab, row, tile or focused field in the accent.
- **Don't** give a card, field, button or bar a radius or a resting shadow.
- **Don't** add a second accent hue; verdigris is for success only.
- **Don't** use uppercase-with-tracking where the apparatus small caps belong.
- **Don't** let the chrome serif or any `app-*` token reach slide content; slides use `slide-*` and `--slide-font-*`.
- **Don't** hard-code state colours (amber, emerald) in new chrome; use the `app-*` danger, highlight and accent tokens.
