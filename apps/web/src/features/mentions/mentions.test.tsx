import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createFakeApi, testDm, testGuild, testUser } from '../../test/fake-api'
import { renderApp } from '../../test/render-app'

const CHANNEL_URL = `/channels/${testGuild.id}/503`

const composer = () => screen.findByRole('textbox', { name: 'Сообщение в #общий' })
const suggestions = () => screen.findByRole('listbox', { name: 'Упоминания' })

describe('mention suggestions', () => {
  it('offer members after @ and insert the mention', async () => {
    const api = createFakeApi({ user: testUser })
    const { user } = renderApp(CHANNEL_URL, { api })
    const box = await composer()

    await user.type(box, 'Привет @бо')
    const list = await suggestions()
    expect(within(list).getByRole('option', { name: /Боб/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.keyboard('{Enter}')

    expect(box).toHaveValue('Привет <@200> ')
    expect(screen.queryByRole('listbox', { name: 'Упоминания' })).not.toBeInTheDocument()
    await user.type(box, 'как дела?{Enter}')
    await waitFor(() =>
      expect(api.messages.create).toHaveBeenCalledWith(
        '503',
        expect.objectContaining({ content: 'Привет <@200> как дела?' }),
      ),
    )
  })

  it('find people by username too, and roles and @everyone for those allowed', async () => {
    const { user } = renderApp(CHANNEL_URL, { api: createFakeApi({ user: testUser }) })
    const box = await composer()

    await user.type(box, '@')
    const list = await suggestions()
    expect(within(list).getByRole('option', { name: /Модераторы/ })).toBeVisible()
    expect(within(list).getByRole('option', { name: /@everyone/ })).toBeVisible()

    await user.type(box, 'bo')
    expect(within(await suggestions()).getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: 'Упоминания' })).not.toBeInTheDocument()
    expect(box).toHaveValue('@bo')
  })

  it('offer text channels after #, picked with the mouse or arrows', async () => {
    const { user } = renderApp(CHANNEL_URL, { api: createFakeApi({ user: testUser }) })
    const box = await composer()

    await user.type(box, 'см. #')
    const list = await suggestions()
    expect(within(list).queryByRole('option', { name: /Общий/ })).not.toBeInTheDocument()
    await user.click(within(list).getByRole('option', { name: /мемы/ }))

    expect(box).toHaveValue('см. <#504> ')
  })

  it('offer the people of a DM', async () => {
    const api = createFakeApi({ user: testUser })
    api.dms.list.mockResolvedValue({ channels: [testDm] })
    const { user } = renderApp(`/channels/@me/${testDm.id}`, { api })
    const box = await screen.findByRole('textbox', { name: /Написать @/ })

    await user.type(box, '@')
    await user.keyboard('{Tab}')

    expect(box).toHaveValue(`<@${testDm.recipients[0]?.id}> `)
  })
})
