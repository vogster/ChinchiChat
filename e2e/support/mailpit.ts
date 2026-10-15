import { expect } from '@playwright/test'

import { e2eEnv } from '../playwright.config'

interface MailpitSummary {
  readonly ID: string
  readonly Subject: string
}

const api = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${e2eEnv.mailpitUrl}/api/v1${path}`)
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`)
  return (await response.json()) as T
}

/** Waits for the newest email to `to` whose subject matches, and returns the token from its link. */
export const tokenFromEmail = async (
  to: string,
  subject: RegExp,
  path: string,
): Promise<string> => {
  let text = ''
  await expect
    .poll(
      async () => {
        const { messages } = await api<{ messages: MailpitSummary[] }>(
          `/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        )
        const message = messages.find((m) => subject.test(m.Subject))
        if (!message) return false
        text = (await api<{ Text: string }>(`/message/${message.ID}`)).Text
        return true
      },
      { message: `email to ${to} matching ${subject}`, timeout: 15_000 },
    )
    .toBe(true)

  const match = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(text)
  if (!match?.[1]) throw new Error(`No ${path} link in the email to ${to}`)
  return match[1]
}
