import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const GENERAL_URL = `/channels/${testGuild.id}/503`
const row = (text: string) => screen.getByText(text).closest('li') as HTMLElement

describe('message bubbles', () => {
  it('puts your own messages on the right and the others on the left', async () => {
    renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Отлично!')

    expect(row('Отлично!')).toHaveAttribute('data-side', 'mine')
    expect(row('Привет всем!')).toHaveAttribute('data-side', 'other')
  })

  it('shapes a run of messages as one group, with the face beside its last bubble', async () => {
    renderApp(GENERAL_URL, { user: testUser })
    await screen.findByText('Как дела?')

    const first = row('Привет всем!')
    const last = row('Как дела?')
    expect(first).toHaveAttribute('data-group', 'first')
    expect(last).toHaveAttribute('data-group', 'last')
    expect(row('Отлично!')).toHaveAttribute('data-group', 'single')

    // The name heads the group; the avatar sits at its foot.
    expect(within(first).getByText('Боб')).toBeVisible()
    expect(within(last).queryByText('Боб')).not.toBeInTheDocument()
    expect(first.querySelector('img')).toBeNull()
    expect(last.querySelector('img')).not.toBeNull()
  })
})
