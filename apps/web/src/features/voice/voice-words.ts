import type { VoiceState } from '@chinchi/shared'
import type { TFunction } from 'i18next'

/** What the icons say, in words, for the accessible name. */
export const voiceStateWords = (t: TFunction, state: VoiceState, speaking: boolean): string[] =>
  [
    speaking ? t('voice.speaking') : null,
    state.serverDeaf ? t('voice.serverDeafened') : state.selfDeaf ? t('voice.deafened') : null,
    state.serverMute ? t('voice.serverMuted') : state.selfMute ? t('voice.muted') : null,
    state.video ? t('voice.video') : null,
    state.stream ? t('voice.stream') : null,
  ].filter((word): word is string => word !== null)
