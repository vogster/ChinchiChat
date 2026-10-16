import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { initI18n } from '../lib/i18n'
import { InstancePicker } from './instance-picker'

import type { FetchLike } from '@chinchi/sdk'

initI18n('ru')

const instanceInfo = {
  name: 'Клуб',
  registrationMode: 'open',
  uploads: null,
  voice: false,
  requireVerifiedEmail: false,
}

const answering = (status: number, body: unknown) =>
  vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { status }))

describe('InstancePicker', () => {
  it('asks the server who it is and hands the normalized address on', async () => {
    const fetch = answering(200, { success: true, data: { instance: instanceInfo } })
    const onChosen = vi.fn()
    const user = userEvent.setup()
    render(<InstancePicker fetch={fetch} onChosen={onChosen} />)

    await user.type(screen.getByLabelText('Адрес сервера'), 'Chat.Example.com/login')
    await user.click(screen.getByRole('button', { name: 'Подключиться' }))

    await waitFor(() => expect(onChosen).toHaveBeenCalledWith('https://chat.example.com', 'Клуб'))
    expect(fetch.mock.calls[0]?.[0]).toBe('https://chat.example.com/api/v1/instance')
  })

  it('refuses what is not an address without asking the network', async () => {
    const fetch = answering(200, {})
    const onChosen = vi.fn()
    const user = userEvent.setup()
    render(<InstancePicker fetch={fetch} onChosen={onChosen} />)

    await user.type(screen.getByLabelText('Адрес сервера'), 'not a server')
    await user.click(screen.getByRole('button', { name: 'Подключиться' }))

    expect(await screen.findByText(/не похоже на адрес/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(onChosen).not.toHaveBeenCalled()
  })

  it('says when there is no Chinchi at the address', async () => {
    const fetch = answering(404, { success: false, code: 'NOT_FOUND', error: 'Not found' })
    const onChosen = vi.fn()
    const user = userEvent.setup()
    render(
      <InstancePicker fetch={fetch} initialUrl="https://old.example.com" onChosen={onChosen} />,
    )

    expect(screen.getByLabelText('Адрес сервера')).toHaveValue('https://old.example.com')
    await user.click(screen.getByRole('button', { name: 'Подключиться' }))

    expect(await screen.findByText(/Не удалось связаться/)).toBeInTheDocument()
    expect(onChosen).not.toHaveBeenCalled()
  })
})
