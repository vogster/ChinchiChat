import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { guildQueryOptions, membersQueryOptions } from '../guilds/queries'
import { toHexColor } from '../permissions/permissions'
import { MentionResolverContext } from './mention-context'

import type { MentionResolver } from './mention-context'
import type { PublicUser, Snowflake } from '@chinchi/shared'
import type { ReactNode } from 'react'

const NO_PEOPLE: readonly PublicUser[] = []

/**
 * One resolver per message list: lookups are maps built once per change of server data. In a DM
 * (`guildId: null`) only its people can be named; there are no roles or channels.
 */
export const MentionResolverProvider = ({
  guildId,
  people = NO_PEOPLE,
  children,
}: {
  guildId: Snowflake | null
  people?: readonly PublicUser[] | undefined
  children: ReactNode
}) => {
  const api = useApi()
  const { t } = useTranslation()
  const inGuild = guildId !== null
  const { data: guild } = useQuery({ ...guildQueryOptions(api, guildId ?? ''), enabled: inGuild })
  const { data: members } = useQuery({
    ...membersQueryOptions(api, guildId ?? ''),
    enabled: inGuild,
  })

  const value = useMemo<MentionResolver>(() => {
    const names = new Map(
      inGuild
        ? (members ?? []).map((member) => [
            member.user.id,
            member.nickname ?? member.user.displayName ?? member.user.username,
          ])
        : people.map((user) => [user.id, user.displayName ?? user.username]),
    )
    const roles = new Map(
      (guild?.roles ?? []).map((role) => [
        role.id,
        { name: role.name, color: role.color ? toHexColor(role.color) : undefined },
      ]),
    )
    const channels = new Map((guild?.channels ?? []).map((channel) => [channel.id, channel.name]))
    return {
      guildId: guildId ?? '',
      user: (id) => names.get(id) ?? null,
      role: (id) => roles.get(id) ?? null,
      channel: (id) => channels.get(id) ?? null,
      labels: {
        unknownUser: t('markdown.unknownUser'),
        unknownRole: t('markdown.unknownRole'),
        unknownChannel: t('markdown.unknownChannel'),
        showSpoiler: t('markdown.showSpoiler'),
        qrSignInLink: t('markdown.qrSignInLink'),
      },
    }
  }, [guildId, inGuild, guild, members, people, t])

  return <MentionResolverContext value={value}>{children}</MentionResolverContext>
}
