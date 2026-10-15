import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Headphones, HeadphoneOff, LogOut, Mic, MicOff, Settings, Smile } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCurrentUser, useLogout } from '../../features/auth/use-auth-actions'
import { messageKeys } from '../../features/messages/queries'
import { usePresence } from '../../features/messages/use-presence'
import { useGateway } from '../../features/realtime/gateway-context'
import { useVoice } from '../../features/voice/voice-context'
import { VoicePanel } from '../../features/voice/voice-panel'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu'
import { CustomStatusDialog } from '../../features/presence/custom-status-dialog'
import { customStatusText, useCustomStatus } from '../../features/presence/use-custom-status'
import { PresenceDot } from '../ui/presence-dot'
import { Avatar } from '../ui/avatar'

import type { Presences } from '../../features/messages/queries'
import type { SelectableStatus } from '@chinchi/shared'

export const UserPanel = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const logout = useLogout()
  const gateway = useGateway()
  const queryClient = useQueryClient()
  const status = usePresence(user?.id)
  const voice = useVoice()
  const customStatus = useCustomStatus(user?.id)
  const [editingStatus, setEditingStatus] = useState(false)

  if (!user) return null
  const name = user.displayName ?? user.username

  const choose = (next: SelectableStatus) => {
    gateway.setStatus(next)
    // Show the change at once; the server confirms with PRESENCE_UPDATE.
    queryClient.setQueryData<Presences>(messageKeys.presences, (presences = {}) => {
      const { [user.id]: _previous, ...rest } = presences
      return next === 'invisible' ? rest : { ...rest, [user.id]: next }
    })
  }

  return (
    <>
      <VoicePanel />
      {editingStatus ? (
        <CustomStatusDialog userId={user.id} onClose={() => setEditingStatus(false)} />
      ) : null}
      <section
        aria-label={t('userPanel.label')}
        className="flex h-14 items-center gap-2 border-t border-border bg-rail/40 px-2"
      >
        <Menu>
          <MenuTrigger
            aria-label={t('presence.setStatus')}
            className="relative shrink-0 rounded-full"
          >
            <Avatar name={name} src={user.avatarUrl} id={user.id} className="size-8 text-sm" />
            <PresenceDot status={status} label={t(`presence.${status}`)} />
          </MenuTrigger>
          <MenuContent>
            {(['online', 'idle', 'dnd', 'invisible'] as const).map((option) => (
              <MenuItem key={option} onSelect={() => choose(option)}>
                {t(`presence.${option}`)}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              onSelect={() => setEditingStatus(true)}
              icon={<Smile aria-hidden className="size-4" />}
            >
              {t('presence.setCustom')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium">{name}</div>
          {customStatus ? (
            <div className="truncate text-xs text-muted" title={customStatusText(customStatus)}>
              {customStatusText(customStatus)}
            </div>
          ) : (
            <div className="truncate text-xs text-muted">{t(`presence.${status}`)}</div>
          )}
        </div>
        <button
          type="button"
          aria-pressed={voice.selfMute || voice.selfDeaf}
          aria-label={voice.selfMute || voice.selfDeaf ? t('voice.unmute') : t('voice.mute')}
          title={voice.selfMute || voice.selfDeaf ? t('voice.unmute') : t('voice.mute')}
          onClick={voice.toggleMute}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-text aria-pressed:text-danger"
        >
          {voice.selfMute || voice.selfDeaf ? (
            <MicOff aria-hidden className="size-4" />
          ) : (
            <Mic aria-hidden className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-pressed={voice.selfDeaf}
          aria-label={voice.selfDeaf ? t('voice.undeafen') : t('voice.deafen')}
          title={voice.selfDeaf ? t('voice.undeafen') : t('voice.deafen')}
          onClick={voice.toggleDeaf}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-text aria-pressed:text-danger"
        >
          {voice.selfDeaf ? (
            <HeadphoneOff aria-hidden className="size-4" />
          ) : (
            <Headphones aria-hidden className="size-4" />
          )}
        </button>
        <Link
          to="/settings/account"
          aria-label={t('userPanel.settings')}
          title={t('userPanel.settings')}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-text"
        >
          <Settings aria-hidden className="size-4" />
        </Link>
        <button
          type="button"
          aria-label={t('userPanel.logout')}
          title={t('userPanel.logout')}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-text disabled:opacity-60"
        >
          <LogOut aria-hidden className="size-4" />
        </button>
      </section>
    </>
  )
}
