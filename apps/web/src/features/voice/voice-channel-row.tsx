import { Permission } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, HeadphoneOff, MicOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { useApi } from '../../lib/api-context'
import { dropTargetClass } from '../../lib/use-drag-sort'
import { guildQueryOptions } from '../guilds/queries'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { statesInChannel, useVoiceStates } from './queries'
import { useVoiceEnabled, useVoicePeople } from './use-voice-people'
import { useVoice } from './voice-context'
import { VoiceMemberRow } from './voice-member-row'
import { voiceStateWords } from './voice-words'

import type { DragItemProps } from '../../lib/use-drag-sort'
import type { Channel } from '@chinchi/shared'
import type { ReactNode } from 'react'

/**
 * A voice channel in the sidebar: a card that joins (and opens) the channel when clicked. Folded,
 * it stacks the faces of who is inside; unfolded, it lists them with their state and actions.
 */
export const VoiceChannelRow = ({
  channel,
  editButton,
  dragProps,
  unfolded,
  onToggleUnfolded,
}: {
  channel: Channel
  editButton: ReactNode
  /** Makes the row sortable in the sidebar (see useDragSort). */
  dragProps?: DragItemProps
  unfolded: boolean
  onToggleUnfolded: () => void
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
  const speaking = (userId: string) => connectedHere && voice.speaking.includes(userId)
  const live = inside.length > 0

  return (
    <li {...dragProps} className={`group relative my-0.5 ${dropTargetClass}`}>
      <div
        data-connected={connectedHere}
        className="relative flex flex-col gap-2.5 rounded-[18px] bg-field p-3 transition hover:brightness-105 data-[connected=true]:shadow-[inset_0_0_0_1.5px_var(--zl-accent)]"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${live ? 'bg-status-online' : 'bg-faint'}`}
          />
          {enabled ? (
            <button
              type="button"
              aria-label={t('voice.channelLabel', { name: channel.name })}
              onClick={() => {
                void voice.join(channel.guildId, channel.id)
                void navigate({
                  to: '/channels/$guildId/$channelId',
                  params: { guildId: channel.guildId, channelId: channel.id },
                })
              }}
              // Stretched over the card, so a click anywhere on it joins.
              className="min-w-0 flex-1 truncate text-left font-medium after:absolute after:inset-0 after:rounded-[18px]"
            >
              {channel.name}
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate font-medium" title={t('voice.disabled')}>
              {channel.name}
            </span>
          )}
          <span className="shrink-0 text-xs text-faint">
            {live ? t('voice.countIn', { count: inside.length }) : t('voice.countEmpty')}
          </span>
          <span className="relative z-10 -my-1 -mr-1 flex items-center">
            {editButton}
            {live ? (
              <button
                type="button"
                aria-expanded={unfolded}
                aria-label={
                  unfolded
                    ? t('voice.foldMembers', { name: channel.name })
                    : t('voice.unfoldMembers', { name: channel.name })
                }
                onClick={onToggleUnfolded}
                className="grid size-6 place-items-center rounded-full text-faint hover:bg-chip hover:text-text"
              >
                <ChevronDown
                  aria-hidden
                  className={`size-3.5 transition-transform duration-200 ${unfolded ? 'rotate-180' : ''}`}
                />
              </button>
            ) : null}
          </span>
        </div>
        {live && unfolded ? (
          <ul
            aria-label={t('voice.membersIn', { name: channel.name })}
            className="relative z-10 -mt-0.5 -mb-1 flex flex-col gap-0.5"
          >
            {inside.map((state) => {
              const person = people(state.userId)
              return (
                <VoiceMemberRow
                  key={state.userId}
                  state={state}
                  name={person.name}
                  user={person.user}
                  speaking={speaking(state.userId)}
                  rights={rights}
                />
              )
            })}
          </ul>
        ) : null}
        {live && !unfolded ? (
          <ul aria-label={t('voice.membersIn', { name: channel.name })} className="flex">
            {inside.map((state) => {
              const person = people(state.userId)
              const words = voiceStateWords(t, state, speaking(state.userId))
              return (
                <li
                  key={state.userId}
                  aria-label={
                    words.length > 0 ? `${person.name} (${words.join(', ')})` : person.name
                  }
                  title={person.name}
                  data-speaking={speaking(state.userId)}
                  className="relative -mr-1.5 rounded-full transition-shadow duration-200 data-[speaking=true]:shadow-[0_0_0_2px_var(--zl-accent)]"
                >
                  <Avatar
                    name={person.name}
                    src={person.user?.avatarUrl ?? null}
                    id={person.user?.id}
                    className="size-[30px] border-[2.5px] border-field text-[11px]"
                  />
                  {/* Muted by a moderator: a red mark on the face, seen even folded. */}
                  {state.serverMute || state.serverDeaf ? (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-danger text-danger-contrast ring-2 ring-field"
                    >
                      {state.serverDeaf ? (
                        <HeadphoneOff className="size-2" strokeWidth={3} />
                      ) : (
                        <MicOff className="size-2" strokeWidth={3} />
                      )}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </li>
  )
}
