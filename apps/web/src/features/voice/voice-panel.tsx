import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Lock, Monitor, MonitorOff, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { privateChannelName } from '../dms/dm-names'
import { dmsQueryOptions } from '../dms/queries'
import { BetaBadge } from '../e2ee/beta-badge'
import { guildQueryOptions } from '../guilds/queries'
import { useVoice } from './voice-context'

// Small, so they fit beside where you are; on the call's own page the dock has the big ones.
const iconButton =
  'grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-text aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:opacity-60'

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
      <div role="alert" className="rounded-[18px] bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
        <span className="flex-1">{errorMessage(t, voice.error)}</span>
      </div>
    ) : null
  }

  const channel = guild?.channels.find((c) => c.id === voice.channelId)
  const dm = voice.guildId === null ? dms.find((c) => c.id === voice.channelId) : undefined
  const place = dm ? [privateChannelName(t, dm)] : [channel?.name, guild?.name]
  const where = place.filter(Boolean).join(' · ')
  const connected = voice.status === 'connected'

  return (
    <section
      aria-label={t('voice.panelLabel')}
      className="rounded-[18px] bg-accent-soft py-2.5 pr-2.5 pl-3.5"
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <div
            data-connected={connected}
            className="truncate text-[13px] font-semibold text-muted data-[connected=true]:text-accent-text"
          >
            {connected ? t('voice.connected') : t('voice.connecting')}
          </div>
          {/* Back to where the call is (a DM, a server's voice channel), from anywhere. */}
          {voice.channelId ? (
            <Link
              {...(voice.guildId
                ? {
                    to: '/channels/$guildId/$channelId' as const,
                    params: { guildId: voice.guildId, channelId: voice.channelId },
                  }
                : {
                    to: '/channels/@me/$channelId' as const,
                    params: { channelId: voice.channelId },
                  })}
              aria-label={t('voice.goToCall', { name: where })}
              title={t('voice.goToCall', { name: where })}
              className="group flex min-w-0 items-center gap-0.5 text-xs text-muted hover:text-text"
            >
              <span className="truncate group-hover:underline">{where}</span>
              {/* Shows it leads somewhere, also where there is no hover (phones). */}
              <ChevronRight aria-hidden className="size-3.5 shrink-0" />
            </Link>
          ) : null}
          {connected && voice.encrypted ? (
            <div className="flex items-center gap-1 text-xs text-secure-text">
              <Lock aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{t('voice.encrypted')}</span>
              <BetaBadge />
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
          className={`${iconButton} max-md:hidden`}
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
          className="ml-0.5 grid h-8 w-10 shrink-0 place-items-center rounded-full bg-danger text-danger-contrast hover:brightness-110"
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
