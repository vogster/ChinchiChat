import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testFriend, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

import type { Report } from '@chinchi/shared'

const CHANNEL_URL = `/channels/${testGuild.id}/503`
const messageRow = (text: string) => screen.getByText(text).closest('li') as HTMLElement

const testReport: Report = {
  id: '950',
  guildId: testGuild.id,
  channelId: '503',
  messageId: '1003',
  author: testFriend,
  content: 'купи казино',
  reporter: { id: '300', username: 'carol', displayName: null, avatarUrl: null },
  reason: 'spam',
  details: 'реклама',
  status: 'open',
  resolvedBy: null,
  createdAt: '2026-10-15T10:00:00.000Z',
}

describe('reporting a message', () => {
  it("sends a reason and details for someone else's message", async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })

    await screen.findByText('Как дела?')
    // Your own messages ("Отлично!") can't be reported.
    expect(
      within(messageRow('Отлично!')).queryByRole('button', { name: 'Пожаловаться' }),
    ).not.toBeInTheDocument()
    await user.click(within(messageRow('Как дела?')).getByRole('button', { name: 'Пожаловаться' }))
    const dialog = await screen.findByRole('dialog', { name: 'Пожаловаться на сообщение' })
    await user.click(within(dialog).getByRole('radio', { name: 'Спам или реклама' }))
    await user.type(within(dialog).getByLabelText('Подробности', { exact: true }), 'казино')
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }))

    expect(await within(dialog).findByText(/Жалоба отправлена/)).toBeVisible()
    expect(api.reports.create).toHaveBeenCalledWith('503', '1002', {
      reason: 'spam',
      details: 'казино',
    })
  })
})

describe('handling reports', () => {
  it('lets moderators delete the message and close the report', async () => {
    const api = createFakeApi({ user: testUser })
    api.reports.guild.mockResolvedValueOnce({ reports: [testReport] }).mockResolvedValue({
      reports: [],
    })
    const { user } = renderApp(`/server-settings/${testGuild.id}/reports`, { api })

    const list = await screen.findByRole('list', { name: 'Жалобы' })
    expect(await within(list).findByText('купи казино')).toBeVisible()
    expect(within(list).getByText(/Спам или реклама/)).toBeVisible()

    await user.click(within(list).getByRole('button', { name: 'Удалить сообщение' }))
    await waitFor(() => expect(api.messages.delete).toHaveBeenCalledWith('503', '1003'))
    await waitFor(() =>
      expect(api.reports.closeGuild).toHaveBeenCalledWith(testGuild.id, '950', 'resolved'),
    )
    expect(await screen.findByText('Открытых жалоб нет')).toBeVisible()
  })

  it('shows instance admins the reports about direct messages', async () => {
    const api = createFakeApi({ user: { ...testUser, isAdmin: true } })
    api.reports.direct.mockResolvedValue({ reports: [{ ...testReport, guildId: null }] })
    const { user } = renderApp('/admin/reports', { api })

    const list = await screen.findByRole('list', { name: 'Жалобы' })
    await user.click(await within(list).findByRole('button', { name: 'Отклонить' }))

    await waitFor(() => expect(api.reports.closeDirect).toHaveBeenCalledWith('950', 'dismissed'))
  })
})
