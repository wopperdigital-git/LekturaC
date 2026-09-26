/**
 * Is a modal dialog open on the page right now?
 *
 * `ui/Modal` is the one place a dialog is drawn and it marks itself `aria-modal`, so this
 * sees every dialog — including ones opened from inside a panel, whose open state the
 * page cannot see. The editor's keyboard shortcuts stand down while one is open: `Modal`
 * neither moves nor traps focus, so a key pressed with a dialog up would otherwise still
 * act on the deck behind it (undo, remove the selected element, step the selection out).
 *
 * Takes the document as an argument so it can be tested without a DOM.
 */
export function modalIsOpen(root: Pick<Document, 'querySelector'> = document): boolean {
  return root.querySelector('[aria-modal="true"]') !== null
}
