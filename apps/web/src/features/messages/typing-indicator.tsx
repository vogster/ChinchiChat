import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { membersQueryOptions } from '../guilds/queries'
import { useGateway } from '../realtime/gateway-context'

import type { PublicUser, Snowflake } from '@chinchi/shared'

/** Who is typing: a server's members, or the people in a DM (`guildId: null`). */
export const TypingIndicator = ({
  guildId,
  channelId,
  people = [],
}: {
  guildId: Snowflake | null
  channelId: Snowflake
  people?: readonly PublicUser[]
}) => {
  const { t } = useTranslation()
  const { typing } = useGateway()
  const me = useCurrentUser()
  const { data: guildMembers = [] } = useQuery({
    ...membersQueryOptions(useApi(), guildId ?? ''),
    enabled: guildId !== null,
  })
  const members = guildId === null ? people.map((user) => ({ user })) : guildMembers
  useSyncExternalStore(typing.subscribe, typing.snapshot)

  const names = typing
    .typingIn(channelId)
    .filter((userId) => userId !== me?.id)
    .map((userId) => {
      const member = members.find((m) => m.user.id === userId)
      if (!member) return null
      return (
        ('nickname' in member && member.nickname) || member.user.displayName || member.user.username
      )
    })
    .filter((name): name is string => name !== null)

  const text =
    names.length === 0
      ? ''
      : names.length === 1
        ? t('messages.typingOne', { names: names[0] })
        : names.length === 2
          ? t('messages.typingTwo', { first: names[0], second: names[1] })
          : t('messages.typingMany')

  return (
    <p aria-live="polite" className="h-5 truncate px-4 text-xs text-muted">
      {text}
    </p>
  )
}
