import type { ContentBlock, LayoutType } from './contentBlocks'
import { STATEMENT_MAX_LEAD } from './layoutEngine'

/**
 * A blueprint role, turned into an explicit layout where the role makes the
 * choice unambiguous.
 *
 * This is the one thing roles buy the *rendering* side. `chooseLayout` awards
 * `hero` only when `context.isFirstCard`, so the story blueprint's insight and
 * closing line — its two most deliberately dramatic slides — come out as
 * generic standard slides. The role is the only thing that knows they differ.
 *
 * Every hint is guarded by the card's own blocks: a role never forces a layout
 * the content cannot fill. Anything unhinted returns `null` and keeps
 * `layout: 'auto'`, i.e. the classifier decides exactly as before.
 */
const HERO_ROLES = new Set([
  'hook',
  'title-roadmap',
  'title-why-matters',
  'insight',
  'closing',
  'closing-line',
])

const RECAP_ROLES = new Set(['recap', 'recap-next-steps'])

/** `true` for a blueprint role whose slide is meant to stand alone as a short hero line. */
export function isHeroRole(role: string | undefined): boolean {
  return role !== undefined && HERO_ROLES.has(role)
}

/** What every hero layout is built for: one heading, optionally one paragraph beneath it — nothing else. */
export function isTitleShaped(blocks: ContentBlock[]): boolean {
  const headings = blocks.filter((b) => b.type === 'heading').length
  const rest = blocks.filter((b) => b.type !== 'heading')
  const restIsBareParagraph = rest.length === 0 || (rest.length === 1 && rest[0].type === 'paragraph')
  return headings === 1 && restIsBareParagraph
}

/**
 * A generated deck always opens on a title slide, named outright so it stays
 * one wherever it is later moved. Content that isn't title-shaped still shows:
 * the hero frame draws its extra blocks as leftovers.
 */
export function generatedLayout(index: number, role: string | undefined, blocks: ContentBlock[]): LayoutType {
  if (index === 0) return 'hero'
  return roleLayoutHint(role, blocks) ?? structuralLayout(blocks) ?? 'auto'
}

/**
 * The two plain-prose shapes a generated card is named for, outright at
 * ingest: a lone heading is a `section` divider, a heading and one paragraph of
 * at most `STATEMENT_MAX_LEAD` characters is a `statement`. The classifier never
 * awards either, because a live card re-resolves on every keystroke and a
 * length rule would swap the slide while it is typed. Never called for card 0.
 */
export function structuralLayout(blocks: ContentBlock[]): LayoutType | null {
  if (blocks.length === 1 && blocks[0].type === 'heading') return 'section'
  if (
    blocks.length === 2 &&
    blocks[0].type === 'heading' &&
    blocks[1].type === 'paragraph' &&
    blocks[1].text.length <= STATEMENT_MAX_LEAD
  ) {
    return 'statement'
  }
  return null
}

export function roleLayoutHint(role: string | undefined, blocks: ContentBlock[]): LayoutType | null {
  if (!role) return null

  if (HERO_ROLES.has(role)) {
    // A photo appended after the words doesn't make the card less of a title.
    return isTitleShaped(blocks.filter((b) => b.type !== 'image')) ? 'hero' : null
  }

  if (RECAP_ROLES.has(role)) {
    return blocks.some((b) => b.type === 'bulletList') ? 'numberedList' : null
  }

  return null
}
