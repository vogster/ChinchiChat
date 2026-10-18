import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { Avatar } from '../../components/ui/avatar'
import { useApi } from '../../lib/api-context'
import { usePresences } from '../messages/use-presence'
import { membersQueryOptions } from './queries'

import type { Snowflake } from '@chinchi/shared'
import type { ButtonHTMLAttributes } from 'react'

const STACK_SIZE = 4

/** The header's members toggle: the faces of up to four members online (an icon when none are). */
export const MembersStackButton = ({
  guildId,
  className = '',
  ...props
}: { guildId: Snowflake } & ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { data: members = [] } = useQuery(membersQueryOptions(useApi(), guildId))
  const presences = usePresences()
  const online = members
    .filter((member) => {
      const status = presences[member.user.id]
      return status !== undefined && status !== 'offline'
    })
    .slice(0, STACK_SIZE)

  return (
    <button
      type="button"
      className={`h-[38px] shrink-0 items-center rounded-full transition-colors hover:bg-field aria-pressed:bg-field ${online.length > 0 ? 'pr-[13px] pl-1.5' : 'w-[38px] justify-center text-muted'} ${className}`}
      {...props}
    >
      {online.length > 0 ? (
        <span className="flex">
          {online.map((member) => (
            <Avatar
              key={member.user.id}
              name={member.nickname ?? member.user.displayName ?? member.user.username}
              src={member.user.avatarUrl}
              id={member.user.id}
              className="-mr-[7px] size-[26px] border-2 border-main text-[10px]"
            />
          ))}
        </span>
      ) : (
        <Users aria-hidden className="size-5" />
      )}
    </button>
  )
}
