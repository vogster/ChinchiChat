/**
 * Desktop notifications are a per-browser choice (each device decides for itself), kept in
 * localStorage next to the browser's own permission.
 */
const KEY = 'chinchi.notifications.desktop'

export type DesktopPermission = NotificationPermission | 'unsupported'

export const desktopPermission = (): DesktopPermission =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

export const readDesktopNotifications = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export const setDesktopNotifications = (enabled: boolean) => {
  try {
    if (enabled) localStorage.setItem(KEY, 'on')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
}

/** On and allowed by the browser. */
export const desktopNotificationsActive = () =>
  readDesktopNotifications() && desktopPermission() === 'granted'
