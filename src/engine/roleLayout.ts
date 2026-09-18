import type { ContentBlock, LayoutType } from './contentBlocks'

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

export function roleLayoutHint(role: string | undefined, blocks: ContentBlock[]): LayoutType | null {
  if (!role) return null

  if (HERO_ROLES.has(role)) {
    // What every hero layout is built for: one heading, optionally one
    // paragraph beneath it — never a stat, a list or anything else.
    const headings = blocks.filter((b) => b.type === 'heading').length
    const rest = blocks.filter((b) => b.type !== 'heading')
    const restIsBareParagraph = rest.length === 0 || (rest.length === 1 && rest[0].type === 'paragraph')
    return headings === 1 && restIsBareParagraph ? 'hero' : null
  }

  if (RECAP_ROLES.has(role)) {
    return blocks.some((b) => b.type === 'bulletList') ? 'numberedList' : null
  }

  return null
}
