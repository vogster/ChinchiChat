import type { MailMessage } from './mailer'
import type { Locale } from '@chinchi/shared'

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

type EmailKind = 'verification' | 'reset' | 'lockout'

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
    lockout: {
      subject: 'Chinchi: вход в учётную запись заблокирован',
      body: 'Кто-то много раз вводил неверный пароль к вашей учётной записи, и вход заблокирован на 15 минут. Если это были вы и пароль забыт — задайте новый по кнопке: блокировка снимется сразу. Если это не вы, делать ничего не нужно: без пароля войти нельзя.',
      action: 'Задать новый пароль',
      footer: 'Ссылка действует 1 час. Такое письмо приходит не чаще раза в 15 минут.',
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
    lockout: {
      subject: 'Chinchi: sign-in to your account is locked',
      body: 'Someone entered a wrong password for your account too many times, and sign-in is locked for 15 minutes. If that was you and you forgot the password, set a new one with the button: the lock lifts at once. If it was not you, nothing to do: nobody gets in without the password.',
      action: 'Set a new password',
      footer: 'The link works for 1 hour. This email comes at most once in 15 minutes.',
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
/** Sent once per lock window; its reset link also lifts the lock. */
export const lockoutEmail = emailOf('lockout')
