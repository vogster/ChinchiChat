import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

describe('automod settings', () => {
  it('saves blocked words, anti-spam and the mention limit', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(`/server-settings/${testGuild.id}/automod`, { api })

    const words = await screen.findByLabelText('Запрещённые слова', { exact: true })
    await user.type(words, 'казино{Enter}Спам ')
    await user.click(screen.getByRole('checkbox', { name: /Анти-спам/ }))
    await user.type(screen.getByLabelText('Максимум упоминаний в сообщении', { exact: true }), '5')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() =>
      expect(api.automod.update).toHaveBeenCalledWith(testGuild.id, {
        blockedWords: ['казино', 'Спам'],
        antiSpam: true,
        maxMentions: 5,
      }),
    )
    expect(await screen.findByText('Сохранено')).toBeVisible()
  })
})
