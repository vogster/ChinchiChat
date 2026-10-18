import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { PageHeader, PageTitle } from '../../components/layout/page-header'
import { Button } from '../../components/ui/button'
import { CallDock } from './call-dock'
import { CallStage } from './call-stage'
import { statesInChannel, useVoiceStates } from './queries'
import { useVoiceEnabled, useVoicePeople } from './use-voice-people'
import { useVoice } from './voice-context'

import type { Channel } from '@chinchi/shared'

/** A voice channel's page: everyone in it as tiles, and the call's controls or a way to join. */
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
        <PageTitle
          glyph={<Volume2 className="size-5" />}
          title={channel.name}
          subtitle={
            inside.length > 0 ? t('voice.countIn', { count: inside.length }) : t('voice.countEmpty')
          }
        />
      </PageHeader>
      <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col gap-3.5 rounded-panel bg-rail p-3.5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inside.length === 0 ? (
            <p className="flex h-full items-center justify-center text-faint">{t('voice.empty')}</p>
          ) : (
            <CallStage states={inside} channelId={channel.id} person={people} />
          )}
        </div>
        {here ? (
          <CallDock />
        ) : (
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
        )}
      </div>
    </MainCard>
  )
}
