import { HeadphoneOff, MicOff, Monitor, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { ProfileTrigger } from '../profile/profile-trigger'
import { VoiceModerationMenu } from './voice-moderation-menu'
import { voiceStateWords } from './voice-words'

import type { VoiceModerationRights } from './voice-moderation-menu'

import type { PublicUser, VoiceState } from '@chinchi/shared'

/** One person in a voice channel in the sidebar. */
export const VoiceMemberRow = ({
  state,
  name,
  user,
  speaking,
  rights,
}: {
  state: VoiceState
  name: string
  user: PublicUser | null
  speaking: boolean
  rights: VoiceModerationRights
}) => {
  const { t } = useTranslation()
  const words = voiceStateWords(t, state, speaking)
  const muted = state.selfMute || state.serverMute
  const deaf = state.selfDeaf || state.serverDeaf

  return (
    <li
      aria-label={words.length > 0 ? `${name} (${words.join(', ')})` : name}
      data-speaking={speaking}
      className="group flex items-center gap-2 rounded py-1 pr-2 pl-7 text-sm text-muted"
    >
      <span
        data-speaking={speaking}
        className="rounded-full outline-offset-1 data-[speaking=true]:outline-2 data-[speaking=true]:outline-green-500"
      >
        <Avatar
          name={name}
          src={user?.avatarUrl ?? null}
          id={user?.id}
          className="size-6 text-xs"
        />
      </span>
      {state.guildId ? (
        <ProfileTrigger
          userId={state.userId}
          guildId={state.guildId}
          name={name}
          className="min-w-0 flex-1 truncate"
        >
          {name}
        </ProfileTrigger>
      ) : (
        <span className="min-w-0 flex-1 truncate">{name}</span>
      )}
      <span aria-hidden className="flex gap-1">
        {state.stream ? <Monitor className="size-3.5" /> : null}
        {state.video ? <Video className="size-3.5" /> : null}
        {deaf ? (
          <HeadphoneOff
            className="size-3.5 data-[server=true]:text-danger"
            data-server={state.serverDeaf}
          />
        ) : muted ? (
          <MicOff
            className="size-3.5 data-[server=true]:text-danger"
            data-server={state.serverMute}
          />
        ) : null}
      </span>
      <VoiceModerationMenu state={state} name={name} rights={rights} />
    </li>
  )
}
