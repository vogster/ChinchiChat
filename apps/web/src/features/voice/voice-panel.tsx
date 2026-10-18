import { useQuery } from '@tanstack/react-query'
import { Lock, PhoneOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { privateChannelName } from '../dms/dm-names'
import { dmsQueryOptions } from '../dms/queries'
import { BetaBadge } from '../e2ee/beta-badge'
import { guildQueryOptions } from '../guilds/queries'
import { useVoice } from './voice-context'

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
          <div className="truncate text-xs text-muted" title={where}>
            {where}
          </div>
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
