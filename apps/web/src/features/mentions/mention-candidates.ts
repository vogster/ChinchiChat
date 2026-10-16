import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { membersQueryOptions } from '../guilds/queries'

import type { MentionCandidate } from './mention-query'
import type { GuildDetail, PrivateChannel, PublicUser } from '@chinchi/shared'

const lower = (values: readonly (string | null | undefined)[]) =>
  values.filter((value): value is string => Boolean(value)).map((v) => v.toLocaleLowerCase())

const person = (user: PublicUser, nickname: string | null = null): MentionCandidate => {
  const label = nickname ?? user.displayName ?? user.username
  return {
    key: `user:${user.id}`,
    kind: 'user',
    text: `<@${user.id}>`,
    label,
    detail: user.username,
    terms: lower([nickname, user.displayName, user.username]),
    user: { id: user.id, avatarUrl: user.avatarUrl },
  }
}

/**
 * What can be mentioned in a server's channel: members, roles, @everyone, text channels.
 * `everyone`: the writer has MENTION_EVERYONE there, which also opens every role.
 */
export const useGuildMentions = (guild: GuildDetail, everyone: boolean): MentionCandidate[] => {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const { data: members = [] } = useQuery(membersQueryOptions(useApi(), guild.id))
  const roles = guild.roles
    .filter((role) => role.id !== guild.id && (role.mentionable || everyone))
    .toSorted((a, b) => b.position - a.position)
  const categories = new Map(guild.channels.map((channel) => [channel.id, channel.name]))

  return [
    ...members.filter((m) => m.user.id !== me?.id).map((m) => person(m.user, m.nickname)),
    ...roles.map((role) => ({
      key: `role:${role.id}`,
      kind: 'role' as const,
      text: `<@&${role.id}>`,
      label: `@${role.name}`,
      detail: t('mentions.role'),
      terms: lower([role.name]),
      color: role.color,
    })),
    ...(everyone
      ? (['everyone', 'here'] as const).map((name) => ({
          key: name,
          kind: 'everyone' as const,
          text: `@${name}`,
          label: `@${name}`,
          detail: t(`mentions.${name}`),
          terms: [name],
        }))
      : []),
    ...guild.channels
      .filter((channel) => channel.type === 'text')
      .map((channel) => ({
        key: `channel:${channel.id}`,
        kind: 'channel' as const,
        text: `<#${channel.id}>`,
        label: channel.name,
        detail: channel.parentId ? categories.get(channel.parentId) : undefined,
        terms: lower([channel.name]),
      })),
  ]
}

/** In a DM or group: the other people in it. */
export const dmMentions = (channel: PrivateChannel): MentionCandidate[] =>
  channel.recipients.map((user) => person(user))
