import { describe, expect, it } from 'vitest'

import { expandCustomEmoji } from './expand-custom-emoji'

const cat = { id: '600', name: 'Cat', url: '' }

describe('expandCustomEmoji', () => {
  it('writes known :names: as server emoji', () => {
    expect(expandCustomEmoji(':cat: и :dog:', [cat])).toBe('<:Cat:600> и :dog:')
  })

  it('leaves code and already written emoji alone', () => {
    expect(expandCustomEmoji('`:cat:` ```\n:cat:\n``` <:Cat:600>', [cat])).toBe(
      '`:cat:` ```\n:cat:\n``` <:Cat:600>',
    )
    expect(expandCustomEmoji('12:30:45', [cat])).toBe('12:30:45')
    expect(expandCustomEmoji('https://x.com/a/:cat: \\:cat:', [cat])).toBe(
      'https://x.com/a/:cat: \\:cat:',
    )
  })
})
