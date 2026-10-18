import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { PageHeader, PageTitle } from '../../components/layout/page-header'
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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-4">
        {inside.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-[24px] bg-stage p-6 text-center">
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-[22px] font-semibold">{t('voice.emptyTitle')}</p>
              <p className="text-muted">{t('voice.emptyHint')}</p>
            </div>
          </div>
        ) : (
          <CallStage states={inside} channelId={channel.id} person={people} />
        )}
      </div>
      <div className="flex shrink-0 justify-center px-4 pb-[18px]">
        {here ? (
          <CallDock />
        ) : (
          <div className="flex items-center gap-2 rounded-[34px] bg-side p-2 shadow-[0_0_0_1px_var(--zl-line)]">
            <span className="pr-2.5 pl-3.5 text-[13px] text-muted">
              {inside.length > 0
                ? t('voice.inChannelCount', { count: inside.length })
                : t('voice.nobody')}
            </span>
            <button
              type="button"
              disabled={!enabled}
              title={enabled ? undefined : t('voice.disabled')}
              onClick={() => void voice.join(channel.guildId, channel.id)}
              className="h-12 rounded-full bg-accent px-[26px] font-semibold text-accent-contrast transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('voice.join')}
            </button>
          </div>
        )}
      </div>
    </MainCard>
  )
}
