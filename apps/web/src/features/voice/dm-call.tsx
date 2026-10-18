import { Lock, Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useNow } from '../../lib/use-now'
import { CallDock } from './call-dock'
import { CallStage } from './call-stage'
import { useVoice } from './voice-context'

import type { PublicUser, VoiceState } from '@chinchi/shared'

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  const rest = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  return hours > 0 ? `${hours}:${rest}` : rest
}

/**
 * A call in a DM, under the header: "calling…" until someone else is in, then the time; the
 * tiles; and the controls (or a way to join a call that is already going). It can grow over the
 * whole chat and back.
 */
export const DmCall = ({
  channelId,
  myId,
  states,
  person,
  encrypted,
  canJoin,
}: {
  channelId: string
  myId: string | undefined
  states: readonly VoiceState[]
  person: (userId: string) => { name: string; user: PublicUser | null }
  encrypted: boolean
  canJoin: boolean
}) => {
  const { t } = useTranslation()
  const voice = useVoice()
  const now = useNow(1_000)
  const [full, setFull] = useState(false)
  const [liveSince, setLiveSince] = useState<number | null>(null)
  const here = voice.channelId === channelId && voice.status !== 'idle'
  const live = here && voice.status === 'connected' && states.some((s) => s.userId !== myId)
  // Start the clock when the other side picks up; stop it when the call is no longer live.
  if (live && liveSince === null) setLiveSince(now)
  if (!live && liveSince !== null) setLiveSince(null)

  return (
    <section
      aria-label={t('voice.callBlock')}
      data-full={full}
      className="flex flex-col gap-3 rounded-panel bg-rail p-3.5 data-[full=false]:mx-3 data-[full=false]:mb-2.5 data-[full=false]:h-[min(400px,58%)] data-[full=false]:min-h-[260px] data-[full=false]:shrink-0 data-[full=true]:absolute data-[full=true]:inset-x-3 data-[full=true]:top-[68px] data-[full=true]:bottom-3 data-[full=true]:z-10"
    >
      <div className="flex min-h-8 items-center gap-2.5">
        <span
          data-live={live}
          className="flex h-8 items-center gap-2 rounded-full bg-field pr-3.5 pl-3 text-[13px] font-medium text-muted data-[live=true]:bg-secure-soft data-[live=true]:text-secure-text"
        >
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {live
            ? t('voice.callLive', { time: clock(now - (liveSince ?? now)) })
            : here
              ? t('voice.dialing')
              : t('voice.callGoing')}
        </span>
        {encrypted ? (
          <span className="flex h-6 items-center gap-1.5 rounded-full bg-secure-soft px-2.5 text-[11.5px] font-medium text-secure-text">
            <Lock aria-hidden className="size-3" />
            {t('voice.endToEnd')}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={full ? t('voice.shrink') : t('voice.expand')}
          title={full ? t('voice.shrink') : t('voice.expand')}
          onClick={() => setFull((value) => !value)}
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-field hover:text-text"
        >
          {full ? (
            <Minimize2 aria-hidden className="size-4" />
          ) : (
            <Maximize2 aria-hidden className="size-4" />
          )}
        </button>
      </div>
      <CallStage states={states} channelId={channelId} person={person} layout="row" large={full} />
      {here ? (
        <CallDock />
      ) : canJoin ? (
        <div className="mx-auto">
          <Button fullWidth={false} onClick={() => void voice.join(null, channelId)}>
            {t('voice.joinCall')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
