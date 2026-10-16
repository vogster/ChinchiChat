import { Permission } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { dropTargetClass } from '../../lib/use-drag-sort'
import { guildQueryOptions } from '../guilds/queries'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { statesInChannel, useVoiceStates } from './queries'
import { useVoiceEnabled, useVoicePeople } from './use-voice-people'
import { useVoice } from './voice-context'
import { VoiceMemberRow } from './voice-member-row'

import type { DragItemProps } from '../../lib/use-drag-sort'
import type { Channel } from '@chinchi/shared'
import type { ReactNode } from 'react'

const rowClass =
  'group flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-muted hover:bg-hover hover:text-text data-[active=true]:bg-hover data-[active=true]:text-text'

/** A voice channel in the sidebar: click to join (and open it), with who is inside below. */
export const VoiceChannelRow = ({
  channel,
  editButton,
  dragProps,
}: {
  channel: Channel
  editButton: ReactNode
  /** Makes the row sortable in the sidebar (see useDragSort). */
  dragProps?: DragItemProps
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const enabled = useVoiceEnabled()
  const voice = useVoice()
  const people = useVoicePeople(channel.guildId)
  const inside = statesInChannel(useVoiceStates(), channel.id)
  const { data: guild } = useQuery(guildQueryOptions(useApi(), channel.guildId))
  // The server checks these server-wide, so the menu does too.
  const base = useGuildPermissions(guild).base
  const rights = {
    mute: can(base, Permission.MuteMembers),
    deafen: can(base, Permission.DeafenMembers),
    move: can(base, Permission.MoveMembers),
  }
  const connectedHere = voice.channelId === channel.id && voice.status !== 'idle'

  const label = (
    <>
      <Volume2 aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{channel.name}</span>
    </>
  )

  return (
    <li {...dragProps} className={`group relative ${dropTargetClass}`}>
      {enabled ? (
        <button
          type="button"
          aria-label={t('voice.channelLabel', { name: channel.name })}
          data-active={connectedHere}
          onClick={() => {
            void voice.join(channel.guildId, channel.id)
            void navigate({
              to: '/channels/$guildId/$channelId',
              params: { guildId: channel.guildId, channelId: channel.id },
            })
          }}
          className={`${rowClass} pr-7`}
        >
          {label}
        </button>
      ) : (
        <div className={rowClass} title={t('voice.disabled')}>
          {label}
        </div>
      )}
      {editButton ? <span className="absolute top-2 right-2">{editButton}</span> : null}
      {inside.length > 0 ? (
        <ul aria-label={t('voice.membersIn', { name: channel.name })} className="pb-1">
          {inside.map((state) => {
            const person = people(state.userId)
            return (
              <VoiceMemberRow
                key={state.userId}
                state={state}
                name={person.name}
                user={person.user}
                speaking={connectedHere && voice.speaking.includes(state.userId)}
                rights={rights}
              />
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}
