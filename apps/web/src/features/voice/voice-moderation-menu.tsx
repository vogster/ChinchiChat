import { useMutation } from '@tanstack/react-query'
import { HeadphoneOff, MicOff, MoreHorizontal, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'
import { useApi } from '../../lib/api-context'

import type { MemberVoiceRequest, VoiceState } from '@chinchi/shared'

export interface VoiceModerationRights {
  readonly mute: boolean
  readonly deafen: boolean
  readonly move: boolean
}

/** Server mute, server deafen and disconnect for one person, as far as the viewer may. */
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
