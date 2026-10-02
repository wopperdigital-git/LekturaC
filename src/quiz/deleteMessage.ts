/** The warning shown before a quiz is deleted, naming what goes with it. */
export function deleteQuizMessage(title: string, usage: { classes: number; attempts: number }): string {
  const { classes, attempts } = usage
  const parts: string[] = []
  if (classes > 0) parts.push(`It's posted to ${classes} ${classes === 1 ? 'class' : 'classes'}`)
  if (attempts > 0) {
    const lost = `${attempts} student ${attempts === 1 ? 'submission' : 'submissions'} will be deleted with it`
    parts.push(parts.length > 0 ? `and ${lost}` : `${lost.charAt(0).toUpperCase()}${lost.slice(1)}`)
  }
  const detail = parts.length > 0 ? ` ${parts.join(' ')}.` : ''
  return `Delete “${title}”?${detail} This can't be undone.`
}
