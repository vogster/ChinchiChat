import { describe, expect, it } from 'vitest'

import { createEncryptedMemory } from './encrypted-memory'
import { createMemoryStore } from './store'

describe('the memory of encrypted conversations', () => {
  it('keeps every conversation this device saw encrypted, and only those', async () => {
    const store = createMemoryStore()
    const memory = createEncryptedMemory(store)
    expect(await memory.wasEncrypted('500')).toBe(false)

    await memory.remember('500')
    await memory.remember('500')

    expect(await memory.wasEncrypted('500')).toBe(true)
    expect(await memory.wasEncrypted('501')).toBe(false)
    // In the device's store: a reload doesn't forget it.
    expect(await createEncryptedMemory(store).wasEncrypted('500')).toBe(true)
  })
})
