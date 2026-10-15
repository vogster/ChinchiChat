import { createTransport } from 'nodemailer'

import type { FastifyBaseLogger } from 'fastify'

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

export const createSmtpMailer = (smtpUrl: string, from: string): Mailer => {
  const transport = createTransport(smtpUrl)
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from, to, subject, text, html })
    },
  }
}

/**
 * Used when SMTP is not configured. Logs the recipient and subject only: message bodies contain
 * one-time tokens and must not end up in logs.
 */
export const createLogMailer = (log: FastifyBaseLogger): Mailer => ({
  async send({ to, subject }) {
    log.warn({ to, subject }, 'SMTP_URL is not set; email was not sent')
  },
})
