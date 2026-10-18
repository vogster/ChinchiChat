/** Asks the history to render a loaded message that is outside its render window. */
export const REVEAL_MESSAGE_EVENT = 'chinchi:reveal-message'

const FLASH_MS = 1_800

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
  // Instant, not smooth: a smooth scroll passes the newest messages on its way, where the list
  // trims its render window and the target moves away mid-flight.
  element.scrollIntoView({ block: 'center' })
  element.focus({ preventScroll: true })
  // A moment of the accent behind it, so the eye finds it too.
  element.dataset.flash = ''
  window.setTimeout(() => delete element.dataset.flash, FLASH_MS)
  return true
}
