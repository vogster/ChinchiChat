import type { Locale } from '@chinchi/shared'
import type { MailMessage } from './mailer'

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

interface LinkEmail {
  readonly to: string
  readonly subject: string
  readonly greeting: string
  readonly body: string
  readonly action: string
  readonly link: string
  readonly footer: string
}

const linkEmail = ({
  to,
  subject,
  greeting,
  body,
  action,
  link,
  footer,
}: LinkEmail): MailMessage => ({
  to,
  subject,
  text: `${greeting}\n\n${body}\n\n${link}\n\n${footer}\n`,
  html: [
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1e1f22">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(body)}</p>`,
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#5b5bd6;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(action)}</a></p>`,
    `<p style="font-size:13px;color:#5c5f66">${escapeHtml(link)}</p>`,
    `<p style="font-size:13px;color:#5c5f66">${escapeHtml(footer)}</p>`,
    '</div>',
  ].join(''),
})

type EmailKind = 'verification' | 'reset'

const TEXTS: Record<
  Locale,
  Record<EmailKind, Omit<LinkEmail, 'to' | 'greeting' | 'link'>> & {
    greeting: (username: string) => string
  }
> = {
  ru: {
    greeting: (username) => `Привет, ${username}!`,
    verification: {
      subject: 'Chinchi: подтвердите email',
      body: 'Подтвердите адрес электронной почты, чтобы завершить регистрацию в Chinchi.',
      action: 'Подтвердить email',
      footer:
        'Ссылка действует 24 часа. Если вы не регистрировались, просто проигнорируйте письмо.',
    },
    reset: {
      subject: 'Chinchi: сброс пароля',
      body: 'Мы получили запрос на сброс пароля. Нажмите на кнопку, чтобы задать новый пароль.',
      action: 'Сбросить пароль',
      footer: 'Ссылка действует 1 час. Если вы не запрашивали сброс, просто проигнорируйте письмо.',
    },
  },
  en: {
    greeting: (username) => `Hi, ${username}!`,
    verification: {
      subject: 'Chinchi: confirm your email',
      body: 'Confirm your email address to finish signing up for Chinchi.',
      action: 'Confirm email',
      footer: "The link works for 24 hours. If you didn't sign up, just ignore this email.",
    },
    reset: {
      subject: 'Chinchi: reset your password',
      body: 'We got a request to reset your password. Press the button to set a new one.',
      action: 'Reset password',
      footer: "The link works for 1 hour. If you didn't ask for a reset, just ignore this email.",
    },
  },
}

const emailOf =
  (kind: EmailKind) =>
  (to: string, username: string, link: string, locale: Locale = 'ru'): MailMessage => {
    const texts = TEXTS[locale]
    return linkEmail({ to, link, greeting: texts.greeting(username), ...texts[kind] })
  }

export const verificationEmail = emailOf('verification')
export const passwordResetEmail = emailOf('reset')
