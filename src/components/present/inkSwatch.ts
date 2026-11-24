import { inkColor } from '@/engine/overlay'

/** A live ink colour as the console shows it: "Text colour" is the theme's, which the app chrome stands in for. */
export function swatch(value: string): string {
  return value === 'foreground' ? 'var(--app-foreground)' : inkColor(value)
}
