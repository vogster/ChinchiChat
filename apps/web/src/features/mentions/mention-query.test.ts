import { describe, expect, it } from 'vitest'

import { applyMention, encodeMentions, findMentionQuery, matchMentions } from './mention-query'

import type { MentionCandidate } from './mention-query'

const user = (id: string, ...terms: string[]): MentionCandidate => ({
  key: `user:${id}`,
  kind: 'user',
  text: `<@${id}>`,
  display: `@${terms[0] as string}`,
  label: terms[0] as string,
  terms,
})

describe('findMentionQuery', () => {
  it('reads the word being typed after @ or # at the caret', () => {
    expect(findMentionQuery('привет @Бо', 10)).toEqual({
      trigger: '@',
      query: 'бо',
      start: 7,
      end: 10,
    })
    expect(findMentionQuery('#', 1)).toEqual({ trigger: '#', query: '', start: 0, end: 1 })
  })

  it('looks only before the caret, and only at a word that starts with the trigger', () => {
    expect(findMentionQuery('@бо и дальше', 3)).toMatchObject({ query: 'бо', end: 3 })
    expect(findMentionQuery('пиши на a@b.ru', 14)).toBeNull()
    expect(findMentionQuery('@бо ', 4)).toBeNull()
    expect(findMentionQuery('уже <@200>', 10)).toBeNull()
  })
})

describe('matchMentions', () => {
  const people = [user('1', 'аркадий'), user('2', 'борис', 'boris'), user('3', 'роберт')]

  it('puts names that start with the query before names that contain it', () => {
    const query = { trigger: '@' as const, query: 'бо', start: 0, end: 3 }
    expect(matchMentions(people, query).map((c) => c.key)).toEqual(['user:2'])
    const ber = { ...query, query: 'р' }
    expect(matchMentions(people, ber).map((c) => c.key)).toEqual(['user:3', 'user:1', 'user:2'])
  })

  it('offers only channels after #', () => {
    expect(matchMentions(people, { trigger: '#', query: '', start: 0, end: 1 })).toEqual([])
  })
})

describe('applyMention', () => {
  it('replaces the query and keeps the rest, with one space after', () => {
    const query = { trigger: '@' as const, query: 'бо', start: 7, end: 10 }
    expect(applyMention('привет @бо как дела', query, user('2', 'борис'))).toEqual({
      value: 'привет @борис как дела',
      caret: 14,
      picked: { display: '@борис', text: '<@2>' },
    })
  })
})

describe('encodeMentions', () => {
  const boris = { display: '@Борис', text: '<@2>' }

  it('turns the picked names into tokens, wherever they are', () => {
    expect(encodeMentions('@Борис, привет! И ещё раз @Борис', [boris])).toBe(
      '<@2>, привет! И ещё раз <@2>',
    )
  })

  it('leaves names that were edited or merely typed', () => {
    expect(encodeMentions('@Бори привет @Борисыч и @Петя', [boris])).toBe(
      '@Бори привет @Борисыч и @Петя',
    )
    expect(encodeMentions('email@Борис', [boris])).toBe('email@Борис')
  })

  it('prefers the longer of two names that start alike', () => {
    const picked = [boris, { display: '@Борис Петров', text: '<@3>' }]
    expect(encodeMentions('@Борис Петров и @Борис', picked)).toBe('<@3> и <@2>')
  })

  it('does not touch code', () => {
    expect(encodeMentions('`@Борис` и @Борис', [boris])).toBe('`@Борис` и <@2>')
  })
})
