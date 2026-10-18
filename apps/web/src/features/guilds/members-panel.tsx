import { useQuery } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { useApi } from '../../lib/api-context'
import { usePresences } from '../messages/use-presence'
import { useMemberColors } from '../permissions/use-member-colors'
import { CustomStatusLine } from '../presence/custom-status-line'
import { ProfileTrigger } from '../profile/profile-trigger'
import { groupMembers } from './member-groups'
import { membersQueryOptions } from './queries'

import type { MemberGroup } from './member-groups'
import type { GuildDetail, Member, PresenceStatus } from '@chinchi/shared'

interface MemberRowProps {
  readonly member: Member
  readonly status: PresenceStatus
  readonly isOwner: boolean
  readonly color: string | undefined
  readonly guildId: string
}

const MemberRow = ({ member, status, isOwner, color, guildId }: MemberRowProps) => {
  const { t } = useTranslation()
  const name = member.nickname ?? member.user.displayName ?? member.user.username
  return (
    <li data-status={status} className="data-[status=offline]:opacity-50">
      <ProfileTrigger
        userId={member.user.id}
        guildId={guildId}
        name={name}
        label={[name, t(`presence.${status}`), isOwner ? t('guild.owner') : null]
          .filter(Boolean)
          .join(', ')}
        side="left"
        className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 hover:bg-hover hover:no-underline"
      >
        <span className="relative shrink-0">
          <Avatar
            name={name}
            src={member.user.avatarUrl}
            id={member.user.id}
            className="size-8 text-sm"
          />
          <PresenceDot status={status} label={t(`presence.${status}`)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={color ? { color } : undefined}>
            {name}
          </span>
          {status === 'offline' ? null : <CustomStatusLine userId={member.user.id} />}
        </span>
        {isOwner ? (
          <Crown aria-label={t('guild.owner')} className="size-4 shrink-0 text-yellow-500" />
        ) : null}
      </ProfileTrigger>
    </li>
  )
}

export const MembersPanel = ({
  guild,
  narrowOpen = false,
}: {
  guild: GuildDetail
  /** Narrow screens: slides over the chat from the right while open. */
  narrowOpen?: boolean
}) => {
  const { t } = useTranslation()
  const { data: members = [] } = useQuery(membersQueryOptions(useApi(), guild.id))
  const presences = usePresences()
  const colorOf = useMemberColors(guild)
  const statusOf = (member: Member): PresenceStatus => presences[member.user.id] ?? 'offline'
  const heading = t('guild.members', { count: members.length })

  const titleOf = (group: MemberGroup) => {
    const count = group.members.length
    if (group.kind === 'role') return t('presence.groupRole', { name: group.role.name, count })
    return group.kind === 'online'
      ? t('presence.groupOnline', { count })
      : t('presence.groupOffline', { count })
  }

  return (
    <aside
      aria-label={heading}
      className={`${narrowOpen ? 'fixed inset-y-2.5 right-2.5 z-40 flex shadow-modal' : 'hidden'} w-[260px] shrink-0 flex-col overflow-y-auto rounded-panel bg-side p-3 xl:static xl:z-auto xl:flex xl:shadow-none`}
    >
      <h2 className="sr-only">{heading}</h2>
      {/* One flat list keyed by user: a member changing group moves their row instead of
          remounting it, so an open profile card (or its dialogs) survives presence changes. */}
      <ul className="flex flex-col gap-0.5">
        {groupMembers(members, guild.roles, statusOf).flatMap((group) => [
          <li
            key={`group:${group.kind === 'role' ? group.role.id : group.kind}`}
            className="mt-4 first:mt-0"
          >
            <h3 className="px-2 pb-1 text-xs font-bold tracking-wide text-muted uppercase">
              {titleOf(group)}
            </h3>
          </li>,
          ...group.members.map((member) => (
            <MemberRow
              key={member.user.id}
              member={member}
              status={statusOf(member)}
              isOwner={member.user.id === guild.ownerId}
              color={colorOf(member.user.id)}
              guildId={guild.id}
            />
          )),
        ])}
      </ul>
    </aside>
  )
}
