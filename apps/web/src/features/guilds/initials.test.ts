import { describe, expect, it } from 'vitest'

import { guildInitials } from './initials'

describe('guildInitials', () => {
  it.each([
    ['Котики', 'К'],
    ['Клуб любителей котиков', 'Клк'],
    ['  my   cool server ', 'mcs'],
    ['🐈 Cats', '🐈C'],
    ['One Two Three Four Five', 'OTT'],
  ])('%j → %j', (name, expected) => {
    expect(guildInitials(name)).toBe(expected)
  })
})
