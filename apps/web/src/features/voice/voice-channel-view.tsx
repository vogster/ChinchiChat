import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { PageHeader } from '../../components/layout/page-header'
import { Button } from '../../components/ui/button'
import { CallStage } from './call-stage'
import { statesInChannel, useVoiceStates } from './queries'
import { useVoiceEnabled, useVoicePeople } from './use-voice-people'
import { useVoice } from './voice-context'

import type { Channel } from '@chinchi/shared'

/** A voice channel's page: everyone in the call as tiles, and a way to join it. */
export const VoiceChannelView = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation()
  const voice = useVoice()
  const enabled = useVoiceEnabled()
  const people = useVoicePeople(channel.guildId)
  const inside = statesInChannel(useVoiceStates(), channel.id)
  const here = voice.channelId === channel.id && voice.status !== 'idle'

  return (
    <MainCard>
      <PageHeader>
        <Volume2 aria-hidden className="size-5 shrink-0 text-muted" />
        <h1 className="truncate">{channel.name}</h1>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {inside.length === 0 ? (
          <p className="m-auto text-muted">{t('voice.empty')}</p>
        ) : (
          <CallStage states={inside} channelId={channel.id} person={people} />
        )}
        {!here ? (
          <div className="mx-auto">
            <Button
              fullWidth={false}
              disabled={!enabled}
              title={enabled ? undefined : t('voice.disabled')}
              onClick={() => void voice.join(channel.guildId, channel.id)}
            >
              {t('voice.join')}
            </Button>
          </div>
        ) : null}
      </div>
    </MainCard>
  )
}
