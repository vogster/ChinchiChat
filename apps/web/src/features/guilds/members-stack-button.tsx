import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'

import { Avatar } from '../../components/ui/avatar'
import { useApi } from '../../lib/api-context'
import { usePresences } from '../messages/use-presence'
import { membersQueryOptions } from './queries'

import type { Snowflake } from '@chinchi/shared'
import type { ButtonHTMLAttributes } from 'react'

const STACK_SIZE = 4

/** Someone whose face may show on the stack. */
export interface StackPerson {
  readonly id: Snowflake
  readonly name: string
  readonly avatarUrl: string | null
}

type StackButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

/** A members toggle: the faces of up to four of these people online (an icon when none are). */
export const PeopleStackButton = ({
  people,
  className = '',
  ...props
}: { people: readonly StackPerson[] } & StackButtonProps) => {
  const presences = usePresences()
  const online = people
    .filter((person) => {
      const status = presences[person.id]
      return status !== undefined && status !== 'offline'
    })
    .slice(0, STACK_SIZE)

  return (
    <button
      type="button"
      className={`h-[38px] shrink-0 items-center rounded-full transition-colors hover:bg-field aria-pressed:bg-field ${online.length > 0 ? 'px-1.5' : 'w-[38px] justify-center text-muted'} ${className}`}
      {...props}
    >
      {online.length > 0 ? (
        <span className="flex">
          {online.map((person) => (
            <Avatar
              key={person.id}
              name={person.name}
              src={person.avatarUrl}
              id={person.id}
              // Overlap from the second face on: a negative margin on the last one would squeeze
              // a lone avatar into an oval.
              className="size-[26px] border-2 border-main text-[10px] not-first:-ml-[7px]"
            />
          ))}
        </span>
      ) : (
        <Users aria-hidden className="size-5" />
      )}
    </button>
  )
}

/** The server header's members toggle. */
export const MembersStackButton = ({
  guildId,
  ...props
}: { guildId: Snowflake } & StackButtonProps) => {
  const { data: members = [] } = useQuery(membersQueryOptions(useApi(), guildId))
  const people = members.map((member) => ({
    id: member.user.id,
    name: member.nickname ?? member.user.displayName ?? member.user.username,
    avatarUrl: member.user.avatarUrl,
  }))
  return <PeopleStackButton people={people} {...props} />
}
