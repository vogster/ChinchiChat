import { describe, expect, it } from 'vitest'

import { invokeCommandRequestSchema, putCommandsRequestSchema } from './command.schemas'

describe('command schemas', () => {
  it('take lowercase names and distinct options', () => {
    expect(
      putCommandsRequestSchema.parse([
        {
          name: 'roll',
          description: 'Бросить кубик',
          options: [{ name: 'sides', description: 'Граней' }],
        },
      ]),
    ).toEqual([
      {
        name: 'roll',
        description: 'Бросить кубик',
        options: [{ name: 'sides', description: 'Граней', required: false }],
      },
    ])
    expect(putCommandsRequestSchema.safeParse([{ name: 'Roll', description: 'x' }]).success).toBe(
      false,
    )
    expect(
      putCommandsRequestSchema.safeParse([
        { name: 'a', description: 'x' },
        { name: 'a', description: 'y' },
      ]).success,
    ).toBe(false)
  })

  it('invoke with text options', () => {
    expect(invokeCommandRequestSchema.parse({ commandId: '5' })).toEqual({
      commandId: '5',
      options: {},
    })
  })
})
