import { describe, expect, it } from 'vitest'

import {
  auditLogQuerySchema,
  banRequestSchema,
  kickRequestSchema,
  MAX_TIMEOUT_MS,
  timeoutRequestSchema,
} from './moderation.schemas'

describe('moderation schemas', () => {
  it('bans with an optional reason and message cleanup of up to a week', () => {
    expect(banRequestSchema.parse({})).toEqual({ deleteMessageSeconds: 0 })
    expect(banRequestSchema.parse({ reason: ' спам ', deleteMessageSeconds: 3600 })).toEqual({
      reason: 'спам',
      deleteMessageSeconds: 3600,
    })
    expect(banRequestSchema.safeParse({ deleteMessageSeconds: 8 * 24 * 3600 }).success).toBe(false)
    expect(kickRequestSchema.safeParse({ reason: 'x'.repeat(513) }).success).toBe(false)
  })

  it('times out until a moment within 28 days, or lifts it with null', () => {
    const soon = new Date(Date.now() + 60_000).toISOString()
    expect(timeoutRequestSchema.parse({ until: soon })).toEqual({ until: soon })
    expect(timeoutRequestSchema.parse({ until: null })).toEqual({ until: null })
    const tooLong = new Date(Date.now() + MAX_TIMEOUT_MS + 3_600_000).toISOString()
    expect(timeoutRequestSchema.safeParse({ until: tooLong }).success).toBe(false)
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(timeoutRequestSchema.safeParse({ until: past }).success).toBe(false)
  })

  it('pages the audit log backwards', () => {
    expect(auditLogQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(auditLogQuerySchema.parse({ before: '123', limit: '10' })).toEqual({
      before: '123',
      limit: 10,
    })
  })
})
