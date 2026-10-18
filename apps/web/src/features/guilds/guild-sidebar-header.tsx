import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { usePresences } from '../messages/use-presence'
import { membersQueryOptions } from './queries'

import type { Snowflake } from '@chinchi/shared'
import type { ReactNode } from 'react'

/** "3 online · 12 members", from the member list and live presences. */
const useOnlineSummary = (guildId: Snowflake) => {
  const { t } = useTranslation()
  const { data: members } = useQuery(membersQueryOptions(useApi(), guildId))
  const presences = usePresences()
  if (!members) return null
  const online = members.filter((member) => {
    const status = presences[member.user.id]
    return status !== undefined && status !== 'offline'
  }).length
  return t('guild.onlineSummary', { online, count: members.length })
}

/** The server's name and who is around, with the server menu (`menu`) beside them. */
export const GuildSidebarHeader = ({
  guildId,
  name,
  menu,
}: {
  guildId: Snowflake
  name: string
  menu: ReactNode
}) => {
  const summary = useOnlineSummary(guildId)
  return (
    <header className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-2.5">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold tracking-[-0.01em]">{name}</h2>
        {summary ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-faint">
            <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-status-online" />
            <span className="truncate">{summary}</span>
          </p>
        ) : null}
      </div>
      {menu}
    </header>
  )
}
