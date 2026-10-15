import { describe, expect, it } from 'vitest'

import { testMessage } from '../../test/fake-api'
import { groupMessages } from './group-messages'

const at = (id: string, iso: string, authorId = '200') =>
  testMessage(id, {
    createdAt: iso,
    author: { id: authorId, username: `u${authorId}`, displayName: null, avatarUrl: null },
  })

describe('groupMessages', () => {
  it('starts each day with a separator and collapses runs from the same author', () => {
    const rows = groupMessages([
      at('1', '2026-10-13T18:00:00.000Z'),
      at('2', '2026-10-13T18:03:00.000Z'),
      at('3', '2026-10-13T18:04:00.000Z', '300'),
      at('4', '2026-10-14T09:00:00.000Z', '300'),
    ])

    expect(
      rows.map((row) =>
        row.kind === 'day' ? `day:${row.day}` : `${row.message.id}:${row.compact ? 'c' : 'full'}`,
      ),
    ).toEqual(['day:2026-10-13', '1:full', '2:c', '3:full', 'day:2026-10-14', '4:full'])
  })

  it('breaks a run after 7 minutes of silence', () => {
    const rows = groupMessages([
      at('1', '2026-10-13T18:00:00.000Z'),
      at('2', '2026-10-13T18:07:01.000Z'),
    ])
    expect(
      rows.filter((r) => r.kind === 'message').map((r) => r.kind === 'message' && r.compact),
    ).toEqual([false, false])
  })

  it('never collapses messages from deleted accounts into each other', () => {
    const ghost = (id: string, iso: string) => testMessage(id, { createdAt: iso, author: null })
    const rows = groupMessages([
      ghost('1', '2026-10-13T18:00:00.000Z'),
      ghost('2', '2026-10-13T18:01:00.000Z'),
    ])
    expect(
      rows.filter((r) => r.kind === 'message').every((r) => r.kind === 'message' && !r.compact),
    ).toBe(true)
  })

  it('handles an empty channel', () => {
    expect(groupMessages([])).toEqual([])
  })
})
