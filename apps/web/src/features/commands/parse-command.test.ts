import { describe, expect, it } from 'vitest'

import { parseCommand, suggestCommands } from './parse-command'

import type { Command } from '@chinchi/shared'

const bot = { id: '9', username: 'dice', displayName: null, avatarUrl: null, bot: true as const }
const roll: Command = {
  id: '1',
  name: 'roll',
  description: 'Бросить кубик',
  options: [
    { name: 'sides', description: 'Граней', required: true },
    { name: 'label', description: 'Подпись', required: false },
  ],
  bot,
}
const ping: Command = { id: '2', name: 'ping', description: 'Пинг', options: [], bot }
const commands = [ping, roll]

describe('suggestCommands', () => {
  it('lists commands while their name is being typed', () => {
    expect(suggestCommands('/', commands)).toEqual([ping, roll])
    expect(suggestCommands('/ro', commands)).toEqual([roll])
    expect(suggestCommands('/roll 6', commands)).toEqual([])
    expect(suggestCommands('hi /ro', commands)).toEqual([])
  })
})

describe('parseCommand', () => {
  it('fills options in order; the last one takes the rest', () => {
    expect(parseCommand('/roll 20 for the win', commands)).toEqual({
      command: roll,
      options: { sides: '20', label: 'for the win' },
      missing: [],
    })
    expect(parseCommand('/ping', commands)).toEqual({ command: ping, options: {}, missing: [] })
  })

  it('names missing required options and ignores ordinary text', () => {
    expect(parseCommand('/roll', commands)?.missing).toEqual(['sides'])
    expect(parseCommand('/shrug hi', commands)).toBeNull()
    expect(parseCommand('roll 6', commands)).toBeNull()
  })
})
