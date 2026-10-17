import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { authKeys } from '../auth/queries'
import { userName } from '../dms/dm-names'
import { messageKeys } from '../messages/queries'
import { desktopNotificationsActive } from './desktop-preference'
import { notificationFor } from './notify'

import type { Presences } from '../messages/queries'
import type { DesktopNotification } from './notify'
import type { CurrentUser, DispatchType, Message, Relationship } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'

/** Someone asked to be my friend; my own requests and their answers stay quiet. */
const friendRequestNotification = (
  relationship: Relationship,
  t: TFunction,
): DesktopNotification | null =>
  relationship.type === 'pending_in'
    ? {
        title: t('notifications.friendRequest.title'),
        body: t('notifications.friendRequest.body', { name: userName(relationship.user) }),
        tag: `friend-request:${relationship.user.id}`,
        guildId: null,
        channelId: null,
      }
    : null

const notificationOf = (
  queryClient: QueryClient,
  type: DispatchType,
  data: unknown,
  t: TFunction,
): DesktopNotification | null => {
  if (type === 'MESSAGE_CREATE') return notificationFor(queryClient, data as Message, Date.now(), t)
  if (type === 'RELATIONSHIP_ADD') return friendRequestNotification(data as Relationship, t)
  return null
}

/**
 * Shows new messages and friend requests as system notifications while the tab is in the background (in a focused
 * tab the app itself shows them). Clicking one brings the tab forward at that channel.
 */
export const useDesktopNotifier = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (type: DispatchType, data: unknown) => {
    if (
      (type !== 'MESSAGE_CREATE' && type !== 'RELATIONSHIP_ADD') ||
      !desktopNotificationsActive()
    ) {
      return
    }
    if (!document.hidden && document.hasFocus()) return
    // "Do not disturb" silences everything.
    const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
    const presences = queryClient.getQueryData<Presences>(messageKeys.presences)
    if (me && presences?.[me.id] === 'dnd') return
    const notification = notificationOf(queryClient, type, data, t)
    if (!notification) return

    const shown = new Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      icon: '/favicon.svg',
    })
    shown.onclick = () => {
      window.focus()
      shown.close()
      const { guildId, channelId } = notification
      // A friend request has no channel: it opens the friends page.
      void navigate(
        channelId === null
          ? { to: '/' }
          : guildId
            ? { to: '/channels/$guildId/$channelId', params: { guildId, channelId } }
            : { to: '/channels/@me/$channelId', params: { channelId } },
      )
    }
  }
}
