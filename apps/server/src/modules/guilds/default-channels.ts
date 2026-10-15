import type { NewChannel } from '../channels/channel.repository'
import type { Snowflake } from '@chinchi/shared'

type Locale = 'ru' | 'en'

const NAMES: Readonly<
  Record<Locale, Readonly<Record<'textCategory' | 'text' | 'voiceCategory' | 'voice', string>>>
> = {
  en: {
    textCategory: 'Text Channels',
    text: 'general',
    voiceCategory: 'Voice Channels',
    voice: 'General',
  },
  ru: {
    textCategory: 'Текстовые каналы',
    text: 'общий',
    voiceCategory: 'Голосовые каналы',
    voice: 'Общий',
  },
}

/** What a brand-new server starts with: one text and one voice channel, each in a category. */
export const defaultChannels = (
  guildId: Snowflake,
  locale: Locale,
  nextId: () => Snowflake,
): NewChannel[] => {
  const names = NAMES[locale]
  const textCategory = nextId()
  const voiceCategory = nextId()
  return [
    {
      id: textCategory,
      guildId,
      type: 'category',
      name: names.textCategory,
      parentId: null,
      position: 0,
      topic: null,
    },
    {
      id: voiceCategory,
      guildId,
      type: 'category',
      name: names.voiceCategory,
      parentId: null,
      position: 1,
      topic: null,
    },
    {
      id: nextId(),
      guildId,
      type: 'text',
      name: names.text,
      parentId: textCategory,
      position: 0,
      topic: null,
    },
    {
      id: nextId(),
      guildId,
      type: 'voice',
      name: names.voice,
      parentId: voiceCategory,
      position: 0,
      topic: null,
    },
  ]
}
