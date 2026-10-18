import { HeadphoneOff, MicOff, Monitor, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { ProfileTrigger } from '../profile/profile-trigger'
import { VoiceModerationMenu } from './voice-moderation-menu'
import { voiceStateWords } from './voice-words'

import type { VoiceModerationRights } from './voice-moderation-menu'
import type { PublicUser, VoiceState } from '@chinchi/shared'

/** One person in an unfolded voice channel card in the sidebar. */
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
  const silent = state.selfMute || state.serverMute || state.selfDeaf || state.serverDeaf

  return (
    <li
      aria-label={words.length > 0 ? `${name} (${words.join(', ')})` : name}
      data-speaking={speaking}
      className="group/member flex h-[34px] items-center gap-2.5 rounded-xl px-1.5 text-[13px] text-muted data-[speaking=true]:font-medium data-[speaking=true]:text-text"
    >
      <span
        data-speaking={speaking}
        className="shrink-0 rounded-[9px] transition-shadow duration-200 data-[speaking=true]:shadow-[0_0_0_2px_var(--zl-accent)]"
      >
        <Avatar
          name={name}
          src={user?.avatarUrl ?? null}
          id={user?.id}
          rounded="rounded-[9px]"
          className="size-[26px] text-[10px]"
        />
      </span>
      {state.guildId ? (
        <ProfileTrigger
          userId={state.userId}
          guildId={state.guildId}
          name={name}
          className="min-w-0 flex-1 truncate text-left"
        >
          {name}
        </ProfileTrigger>
      ) : (
        <span className="min-w-0 flex-1 truncate">{name}</span>
      )}
      <span aria-hidden className="flex shrink-0 items-center gap-1 text-[11px]">
        {state.stream ? <Monitor className="size-3.5" /> : null}
        {state.video ? <Video className="size-3.5" /> : null}
        {/* A moderator's mute stands out in red; their own is the quiet word. */}
        {state.serverDeaf ? (
          <span title={t('voice.serverDeafened')} className="text-danger">
            <HeadphoneOff className="size-3.5" />
          </span>
        ) : state.serverMute ? (
          <span title={t('voice.serverMuted')} className="text-danger">
            <MicOff className="size-3.5" />
          </span>
        ) : null}
        {speaking ? (
          <span className="text-accent-text">{t('voice.speaking')}</span>
        ) : silent && !state.serverMute && !state.serverDeaf ? (
          <span className="text-danger">{t('voice.silent')}</span>
        ) : null}
      </span>
      <VoiceModerationMenu state={state} name={name} rights={rights} />
    </li>
  )
}
