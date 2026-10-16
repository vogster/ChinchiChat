import { vi } from 'vitest'

import type { MailMessage, Mailer } from '../src/mail/mailer'

/** Mailer that keeps messages in memory so tests can read links out of them. */
export const createOutbox = () => {
  const messages: MailMessage[] = []
  const mailer: Mailer = {
    send: async (message) => {
      messages.push(message)
    },
  }

  /** Mail is sent in the background, so wait for it to arrive. */
  const waitForMessage = (to: string, subject: RegExp): Promise<MailMessage> =>
    vi.waitFor(() => {
      const found = messages.findLast((m) => m.to === to && subject.test(m.subject))
      if (!found) throw new Error(`No mail to ${to} matching ${subject}`)
      return found
    })

  const tokenFrom = (message: MailMessage, path: string): string => {
    const match = new RegExp(`${path}#token=([A-Za-z0-9_-]+)`).exec(message.text)
    if (!match?.[1]) throw new Error(`No ${path} link in mail`)
    return match[1]
  }

  return {
    mailer,
    messages,
    waitForMessage,
    tokenFrom,
    clear: () => messages.splice(0),
  }
}
