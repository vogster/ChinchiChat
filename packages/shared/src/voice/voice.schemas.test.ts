import { describe, expect, it } from 'vitest'

import {
  joinVoiceRequestSchema,
  memberVoiceRequestSchema,
  updateVoiceStateRequestSchema,
  voiceStateSchema,
} from './voice.schemas'

describe('voice schemas', () => {
  it('describes where a user is in voice, null channel meaning they left', () => {
    const state = {
      guildId: '1',
      channelId: null,
      userId: '2',
      selfMute: false,
      selfDeaf: false,
      serverMute: true,
      serverDeaf: false,
      video: false,
      stream: false,
    }
    expect(voiceStateSchema.parse(state)).toEqual(state)
  })

  it('joins unmuted unless asked otherwise', () => {
    expect(joinVoiceRequestSchema.parse({})).toEqual({ selfMute: false, selfDeaf: false })
    expect(joinVoiceRequestSchema.parse({ selfMute: true })).toMatchObject({ selfMute: true })
  })

  it('needs something to change, and nothing unknown', () => {
    expect(updateVoiceStateRequestSchema.safeParse({}).success).toBe(false)
    expect(updateVoiceStateRequestSchema.safeParse({ selfDeaf: true }).success).toBe(true)
    expect(updateVoiceStateRequestSchema.safeParse({ serverMute: true }).success).toBe(false)
    expect(memberVoiceRequestSchema.safeParse({}).success).toBe(false)
    expect(memberVoiceRequestSchema.safeParse({ disconnect: true }).success).toBe(true)
    expect(memberVoiceRequestSchema.safeParse({ disconnect: false }).success).toBe(false)
    expect(memberVoiceRequestSchema.safeParse({ mute: true, deaf: false }).success).toBe(true)
  })
})
