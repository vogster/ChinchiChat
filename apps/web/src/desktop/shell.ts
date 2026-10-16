/** The name of the DOM event the web app fires with its unread total (see UnreadBadge). */
export const UNREAD_EVENT = 'chinchi:unread'

/** Fired by the web app whenever its unread total changes; the shell shows it on the dock/taskbar. */
export const announceUnread = (total: number) => {
  window.dispatchEvent(new CustomEvent<number>(UNREAD_EVENT, { detail: total }))
}

/**
 * Mirrors the unread total onto the app icon (dock badge on macOS, taskbar overlay on Windows,
 * launcher badge on Linux). `setBadgeCount(undefined)` clears it. Returns the unsubscribe.
 */
export const mirrorUnreadBadge = (
  setBadgeCount: (count: number | undefined) => Promise<void>,
): (() => void) => {
  const listener = (event: Event) => {
    const total = (event as CustomEvent<number>).detail
    void setBadgeCount(total > 0 ? total : undefined).catch(() => undefined)
  }
  window.addEventListener(UNREAD_EVENT, listener)
  return () => window.removeEventListener(UNREAD_EVENT, listener)
}
