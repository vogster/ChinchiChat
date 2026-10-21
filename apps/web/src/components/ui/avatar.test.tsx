import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GuildIcon } from '../../features/guilds/guild-icon'
import { MediaBaseProvider } from '../../features/media/media-base'
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

  it('loads the picture from the instance when the page lives elsewhere (the desktop)', () => {
    const { container } = render(
      <MediaBaseProvider base="https://chat.example.com">
        <Avatar name="Алиса" src="/api/v1/avatars/100/7.webp" id="100" />
        <GuildIcon id="500" name="Котики" iconUrl="/api/v1/icons/500/9.webp" />
      </MediaBaseProvider>,
    )
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual([
      'https://chat.example.com/api/v1/avatars/100/7.webp',
      'https://chat.example.com/api/v1/icons/500/9.webp',
    ])
  })
})

describe('GuildIcon', () => {
  it('puts the initials over a picture drawn from the server id', () => {
    const { container } = render(<GuildIcon id="500" name="Котики" iconUrl={null} />)
    expect(container.querySelector('img[data-generated]')).not.toBeNull()
    expect(container.textContent).toBe('К')
  })
})
