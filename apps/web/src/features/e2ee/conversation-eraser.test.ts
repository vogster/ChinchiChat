import { describe, expect, it } from 'vitest'

import { createConversationEraser } from './conversation-eraser'
import { createLocalSearch } from './local-search'
import { createMemoryStore } from './store'

describe('erasing a deleted conversation from this device', () => {
  it('drops its keys, plaintext, backups and index, and nothing of other conversations', async () => {
    const store = createMemoryStore()
    const index = createLocalSearch(store)
    await index.record('500', { id: '1', authorId: 'a', text: 'секрет' })
    await index.record('501', { id: '2', authorId: 'a', text: 'другое' })
    for (const key of ['conv:500', 'plain:1', 'plain:1:2026-10-22', 'backup:1', 'react:own:1']) {
      await store.set(key, { any: 'thing' })
    }
    await store.set('group:known:500', ['a'])
    await store.set('encrypted:500', true)
    await store.set('plain:2', { keep: true })
    await store.set('conv:501', { keep: true })

    await createConversationEraser(store).forget('500')

    for (const key of [
      'conv:500',
      'plain:1',
      'plain:1:2026-10-22',
      'backup:1',
      'react:own:1',
      'group:known:500',
      'index:500',
    ]) {
      expect(await store.get(key)).toBeUndefined()
    }
    expect(await index.search('500', 'секрет')).toEqual([])
    // Still known as once encrypted: a server can't bring it back as a plain one unnoticed.
    expect(await store.get('encrypted:500')).toBe(true)
    expect(await store.get('plain:2')).toEqual({ keep: true })
    expect(await store.get('conv:501')).toEqual({ keep: true })
  })
})
