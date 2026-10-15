/** Asks the history to render a loaded message that is outside its render window. */
export const REVEAL_MESSAGE_EVENT = 'chinchi:reveal-message'

/**
 * Brings a loaded message into view and moves focus to it, so keyboard and screen reader users
 * land there too. False when the message is not loaded (older history).
 */
export const jumpToMessage = (messageId: string): boolean => {
  const element = document.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  )
  if (!element) {
    // Maybe loaded but outside the render window: the list widens it, a retry then finds it.
    window.dispatchEvent(new CustomEvent(REVEAL_MESSAGE_EVENT, { detail: messageId }))
    return false
  }
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element.focus({ preventScroll: true })
  return true
}
