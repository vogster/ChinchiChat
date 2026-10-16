import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, HeadphoneOff, MicOff, MoreHorizontal, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu'
import { useApi } from '../../lib/api-context'
import { guildQueryOptions } from '../guilds/queries'

import type { MemberVoiceRequest, VoiceState } from '@chinchi/shared'

export interface VoiceModerationRights {
  readonly mute: boolean
  readonly deafen: boolean
  readonly move: boolean
}

/** Server mute, deafen, move and disconnect for one person, as far as the viewer may. */
export const VoiceModerationMenu = ({
  state,
  name,
  rights,
}: {
  state: VoiceState
  name: string
  rights: VoiceModerationRights
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const moderate = useMutation({
    mutationFn: (body: MemberVoiceRequest) =>
      api.voice.moderate(state.guildId ?? '', state.userId, body),
  })
  const move = useMutation({
    mutationFn: (channelId: string) => api.voice.move(state.guildId ?? '', state.userId, channelId),
  })
  const { data: guild } = useQuery({
    ...guildQueryOptions(api, state.guildId ?? ''),
    enabled: rights.move && state.guildId !== null,
  })
  const elsewhere = (guild?.channels ?? []).filter(
    (channel) => channel.type === 'voice' && channel.id !== state.channelId,
  )
  if (!state.guildId || (!rights.mute && !rights.deafen && !rights.move)) return null

  return (
    <Menu>
      <MenuTrigger
        aria-label={t('friends.actionLabel', { action: t('voice.actions'), name })}
        className="rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-text focus:opacity-100 data-[state=open]:opacity-100"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </MenuTrigger>
      <MenuContent>
        {rights.mute ? (
          <MenuItem
            icon={<MicOff aria-hidden className="size-4" />}
            onSelect={() => moderate.mutate({ mute: !state.serverMute })}
          >
            {state.serverMute ? t('voice.serverUnmute') : t('voice.serverMute')}
          </MenuItem>
        ) : null}
        {rights.deafen ? (
          <MenuItem
            icon={<HeadphoneOff aria-hidden className="size-4" />}
            onSelect={() => moderate.mutate({ deaf: !state.serverDeaf })}
          >
            {state.serverDeaf ? t('voice.serverUndeafen') : t('voice.serverDeafen')}
          </MenuItem>
        ) : null}
        {rights.move && elsewhere.length > 0 ? (
          <>
            <MenuSeparator />
            {elsewhere.map((channel) => (
              <MenuItem
                key={channel.id}
                icon={<ArrowRightLeft aria-hidden className="size-4" />}
                onSelect={() => move.mutate(channel.id)}
              >
                {t('voice.moveTo', { channel: channel.name })}
              </MenuItem>
            ))}
            <MenuSeparator />
          </>
        ) : null}
        {rights.move ? (
          <MenuItem
            danger
            icon={<PhoneOff aria-hidden className="size-4" />}
            onSelect={() => moderate.mutate({ disconnect: true })}
          >
            {t('voice.disconnectMember')}
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  )
}
