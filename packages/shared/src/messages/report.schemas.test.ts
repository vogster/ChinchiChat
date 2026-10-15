import { describe, expect, it } from 'vitest'

import { createReportRequestSchema, reportsQuerySchema } from './report.schemas'

describe('report schemas', () => {
  it('takes a reason and optional details', () => {
    expect(createReportRequestSchema.parse({ reason: 'spam', details: '  реклама ' })).toEqual({
      reason: 'spam',
      details: 'реклама',
    })
    expect(createReportRequestSchema.safeParse({ reason: 'boring' }).success).toBe(false)
    expect(
      createReportRequestSchema.safeParse({ reason: 'other', details: 'x'.repeat(501) }).success,
    ).toBe(false)
  })

  it('lists open reports by default', () => {
    expect(reportsQuerySchema.parse({})).toEqual({ status: 'open', limit: 50 })
  })
})
