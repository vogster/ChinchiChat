import { describe, expect, it } from 'vitest'

import { createPollSchema, pollVoteRequestSchema } from './poll.schemas'

describe('creating a poll', () => {
  it('takes a question and 2–10 answers, one choice, a day and open voting by default', () => {
    expect(
      createPollSchema.parse({ question: ' Куда идём? ', answers: ['Кино', ' Бар '] }),
    ).toEqual({
      question: 'Куда идём?',
      answers: ['Кино', 'Бар'],
      multiple: false,
      durationHours: 24,
      anonymous: false,
    })
  })

  it.each([
    [{ question: '', answers: ['a', 'b'] }],
    [{ question: 'q', answers: ['только один'] }],
    [{ question: 'q', answers: Array.from({ length: 11 }, (_, i) => `${i}`) }],
    [{ question: 'q', answers: ['a', '   '] }],
    [{ question: 'q'.repeat(301), answers: ['a', 'b'] }],
    [{ question: 'q', answers: ['a'.repeat(56), 'b'] }],
    [{ question: 'q', answers: ['a', 'b'], durationHours: 5 }],
  ])('refuses %j', (body) => {
    expect(createPollSchema.safeParse(body).success).toBe(false)
  })
})

describe('voting', () => {
  it('takes distinct answers; an empty list takes the vote back', () => {
    expect(pollVoteRequestSchema.parse({ answerIds: [1, 3] })).toEqual({ answerIds: [1, 3] })
    expect(pollVoteRequestSchema.parse({ answerIds: [] })).toEqual({ answerIds: [] })
    expect(pollVoteRequestSchema.safeParse({ answerIds: [2, 2] }).success).toBe(false)
    expect(pollVoteRequestSchema.safeParse({ answerIds: [11] }).success).toBe(false)
  })
})
