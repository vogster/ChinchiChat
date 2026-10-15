import { resolveNotifications, shouldNotify } from '@chinchi/shared'

import { authKeys } from '../auth/queries'
import { dmKeys } from '../dms/queries'
import { userName } from '../dms/dm-names'
import { guildKeys } from '../guilds/queries'
import { mentionsMe } from '../messages/mentions'
import { notificationKeys } from './queries'

import type { QueryClient } from '@tanstack/react-query'
import type {
  Channel,
  CurrentUser,
  GuildDetail,
  Message,
  NotificationSetting,
  PrivateChannel,
} from '@chinchi/shared'
import type { TFunction } from 'i18next'

export interface DesktopNotification {
  readonly title: string
  readonly body: string
  /** One notification per channel: a newer message replaces the older one. */
  readonly tag: string
  readonly guildId: string | null
  readonly channelId: string
}

const BODY_MAX = 140

const bodyOf = (message: Message, t: TFunction) => {
  const text = message.content.trim()
  if (text) return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text
  return message.attachments.length > 0 ? t('notifications.sentFile') : ''
}

const chainOf = (channel: Channel, channels: readonly Channel[]) => {
  const chain = [channel.id]
  let parentId = channel.parentId
  while (parentId && chain.length < 4) {
    chain.push(parentId)
    const id = parentId
    parentId = channels.find((c) => c.id === id)?.parentId ?? null
  }
  return chain
}

/**
 * The notification a new message deserves, or null: never for my own or system messages, and
 * only as the user's settings say (DMs count as mentions). Visibility of the tab is the caller's
 * business.
 */
export const notificationFor = (
  queryClient: QueryClient,
  message: Message,
  now: number,
  t: TFunction,
): DesktopNotification | null => {
  const me = queryClient.getQueryData<CurrentUser | null>(authKeys.me)
  if (!me || !message.author || message.author.id === me.id || message.system) return null
  const settings = new Map(
    (queryClient.getQueryData<NotificationSetting[]>(notificationKeys.all) ?? []).map((s) => [
      s.targetId,
      s,
    ]),
  )
  const author = userName(message.author)
  const body = bodyOf(message, t)
  const base = { body, tag: message.channelId, channelId: message.channelId }

  if (message.guildId === null) {
    const dm = queryClient
      .getQueryData<PrivateChannel[]>(dmKeys.all)
      ?.find((channel) => channel.id === message.channelId)
    const resolved = resolveNotifications(
      settings,
      { guildId: null, channelIds: [message.channelId] },
      now,
    )
    if (!shouldNotify(resolved, true)) return null
    const title = dm?.type === 'group_dm' && dm.name ? `${author} (${dm.name})` : author
    return { ...base, title, guildId: null }
  }

  const guild = queryClient.getQueryData<GuildDetail>(guildKeys.detail(message.guildId))
  const channel = guild?.channels.find((c) => c.id === message.channelId)
  if (!guild || !channel) return null
  const resolved = resolveNotifications(
    settings,
    { guildId: guild.id, channelIds: chainOf(channel, guild.channels) },
    now,
  )
  if (!shouldNotify(resolved, mentionsMe(message, me.id, guild.myRoleIds))) return null
  return { ...base, title: `${author} (#${channel.name}, ${guild.name})`, guildId: guild.id }
}
