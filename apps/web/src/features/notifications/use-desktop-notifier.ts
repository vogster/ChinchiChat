import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { authKeys } from '../auth/queries'
import { messageKeys } from '../messages/queries'
import { desktopNotificationsActive } from './desktop-preference'
import { notificationFor } from './notify'

import type { Presences } from '../messages/queries'
import type { CurrentUser, DispatchType, Message } from '@chinchi/shared'

/**
 * Shows new messages as system notifications while the tab is in the background (in a focused
 * tab the app itself shows them). Clicking one brings the tab forward at that channel.
 */
export const useDesktopNotifier = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (type: DispatchType, data: unknown) => {
    if (type !== 'MESSAGE_CREATE' || !desktopNotificationsActive()) return
    if (!document.hidden && document.hasFocus()) return
    // "Do not disturb" silences everything.
    const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
    const presences = queryClient.getQueryData<Presences>(messageKeys.presences)
    if (me && presences?.[me.id] === 'dnd') return
    const notification = notificationFor(queryClient, data as Message, Date.now(), t)
    if (!notification) return

    const shown = new Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      icon: '/favicon.svg',
    })
    shown.onclick = () => {
      window.focus()
      shown.close()
      void navigate(
        notification.guildId
          ? {
              to: '/channels/$guildId/$channelId',
              params: { guildId: notification.guildId, channelId: notification.channelId },
            }
          : { to: '/channels/@me/$channelId', params: { channelId: notification.channelId } },
      )
    }
  }
}
