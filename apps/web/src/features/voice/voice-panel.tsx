import { useQuery } from '@tanstack/react-query'
import { Lock, Monitor, MonitorOff, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { privateChannelName } from '../dms/dm-names'
import { dmsQueryOptions } from '../dms/queries'
import { guildQueryOptions } from '../guilds/queries'
import { useVoice } from './voice-context'

const iconButton =
  'rounded p-1.5 text-muted hover:bg-hover hover:text-text aria-pressed:text-text disabled:opacity-60'

/** Above the user panel while in voice: where you are, camera, screen and hang up. */
export const VoicePanel = () => {
  const { t } = useTranslation()
  const voice = useVoice()
  const { data: dms = [] } = useQuery(dmsQueryOptions(useApi()))
  const { data: guild } = useQuery({
    ...guildQueryOptions(useApi(), voice.guildId ?? ''),
    enabled: voice.guildId !== null,
  })

  if (voice.status === 'idle') {
    return voice.error ? (
      <div
        role="alert"
        className="flex items-start gap-2 border-t border-border bg-danger/10 px-3 py-2 text-xs text-danger"
      >
        <span className="flex-1">{errorMessage(t, voice.error)}</span>
      </div>
    ) : null
  }

  const channel = guild?.channels.find((c) => c.id === voice.channelId)
  const dm = voice.guildId === null ? dms.find((c) => c.id === voice.channelId) : undefined
  const place = dm ? [privateChannelName(t, dm)] : [channel?.name, guild?.name]
  const connected = voice.status === 'connected'

  return (
    <section
      aria-label={t('voice.panelLabel')}
      className="border-t border-border bg-rail/40 px-2 py-2"
    >
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 text-xs">
          <div
            data-connected={connected}
            className="truncate font-semibold text-muted data-[connected=true]:text-green-500"
          >
            {connected ? t('voice.connected') : t('voice.connecting')}
          </div>
          <div className="truncate text-muted">{place.filter(Boolean).join(' / ')}</div>
          {connected && voice.encrypted ? (
            <div className="flex items-center gap-1 text-muted">
              <Lock aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{t('voice.encrypted')}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-pressed={voice.camera}
          aria-label={voice.camera ? t('voice.cameraOff') : t('voice.cameraOn')}
          title={voice.camera ? t('voice.cameraOff') : t('voice.cameraOn')}
          disabled={!connected}
          onClick={voice.toggleCamera}
          className={iconButton}
        >
          {voice.camera ? (
            <VideoOff aria-hidden className="size-4" />
          ) : (
            <Video aria-hidden className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-pressed={voice.screen}
          aria-label={voice.screen ? t('voice.screenOff') : t('voice.screenOn')}
          title={voice.screen ? t('voice.screenOff') : t('voice.screenOn')}
          disabled={!connected}
          onClick={voice.toggleScreen}
          className={iconButton}
        >
          {voice.screen ? (
            <MonitorOff aria-hidden className="size-4" />
          ) : (
            <Monitor aria-hidden className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-label={t('voice.leave')}
          title={t('voice.leave')}
          onClick={() => void voice.leave()}
          className="rounded p-1.5 text-muted hover:bg-hover hover:text-danger"
        >
          <PhoneOff aria-hidden className="size-4" />
        </button>
      </div>
      {voice.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {errorMessage(t, voice.error)}
        </p>
      ) : null}
    </section>
  )
}
