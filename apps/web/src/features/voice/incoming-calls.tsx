import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Phone, PhoneOff } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { privateChannelName, userName } from '../dms/dm-names'
import { dmsQueryOptions } from '../dms/queries'
import { declineCall, useDeclinedCalls, useVoiceStates } from './queries'
import { createRingtone } from './ringtone'
import { useVoice } from './voice-context'

/** Cards for DM calls the user is not in: answer (join) or decline (hide it here). */
export const IncomingCalls = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const voice = useVoice()
  const states = Object.values(useVoiceStates())
  const declined = useDeclinedCalls()
  const { data: channels = [] } = useQuery(dmsQueryOptions(useApi()))
  const inChannel = voice.status === 'idle' ? null : voice.channelId

  const calls = channels.flatMap((channel) => {
    if (channel.id === inChannel || declined.includes(channel.id)) return []
    const inside = states.filter((s) => s.channelId === channel.id)
    if (inside.length === 0 || inside.some((s) => s.userId === me?.id)) return []
    const caller = channel.recipients.find((user) => inside.some((s) => s.userId === user.id))
    return [{ channel, who: caller ? userName(caller) : privateChannelName(t, channel) }]
  })
  const ringing = calls.length > 0
  // One ring for the whole app, from the first call until the last is answered or declined.
  useEffect(() => {
    if (!ringing) return
    const ringtone = createRingtone()
    ringtone.start()
    return () => ringtone.stop()
  }, [ringing])
  if (!ringing) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-12 z-50 flex flex-col items-center gap-2 px-4">
      {calls.map(({ channel, who }) => (
        <section
          key={channel.id}
          role="alertdialog"
          aria-label={t('voice.incoming')}
          className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg bg-elevated p-3 shadow-lg"
        >
          <p className="min-w-0 flex-1 truncate font-medium">{t('voice.calling', { name: who })}</p>
          <button
            type="button"
            aria-label={t('voice.decline')}
            title={t('voice.decline')}
            onClick={() => declineCall(queryClient, channel.id)}
            className="rounded-full bg-danger p-2 text-danger-contrast hover:opacity-90"
          >
            <PhoneOff aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t('voice.accept')}
            title={t('voice.accept')}
            onClick={() => void voice.join(null, channel.id)}
            className="rounded-full bg-green-600 p-2 text-white hover:opacity-90"
          >
            <Phone aria-hidden className="size-4" />
          </button>
        </section>
      ))}
    </div>
  )
}
