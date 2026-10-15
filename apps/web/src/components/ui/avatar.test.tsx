import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GuildIcon } from '../../features/guilds/guild-icon'
import { Avatar } from './avatar'

describe('Avatar', () => {
  it('shows the uploaded picture, else one drawn from the id, else the first letter', () => {
    const uploaded = render(<Avatar name="Алиса" src="/a.webp" id="100" />)
    expect(uploaded.container.querySelector('img')).toHaveAttribute('src', '/a.webp')

    const drawn = render(<Avatar name="Алиса" src={null} id="100" />)
    const img = drawn.container.querySelector('img')
    expect(img).toHaveAttribute('data-generated')
    expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)

    const deleted = render(<Avatar name="удалённый" src={null} />)
    expect(deleted.container.textContent).toBe('У')
  })
})

describe('GuildIcon', () => {
  it('puts the initials over a picture drawn from the server id', () => {
    const { container } = render(<GuildIcon id="500" name="Котики" iconUrl={null} />)
    expect(container.querySelector('img[data-generated]')).not.toBeNull()
    expect(container.textContent).toBe('К')
  })
})
