import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('data export', () => {
  it('offers the archive of my data for download', async () => {
    renderApp('/settings/account', { user: testUser })

    const link = await screen.findByRole('link', { name: 'Скачать мои данные' })
    expect(link).toHaveAttribute('href', '/api/v1/users/@me/export')
    expect(link).toHaveAttribute('download')
  })
})
