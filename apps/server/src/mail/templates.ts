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

// TODO(i18n): pick the language from the user's locale once accounts store it.
export const verificationEmail = (to: string, username: string, link: string): MailMessage =>
  linkEmail({
    to,
    subject: 'Chinchi: подтвердите email',
    greeting: `Привет, ${username}!`,
    body: 'Подтвердите адрес электронной почты, чтобы завершить регистрацию в Chinchi.',
    action: 'Подтвердить email',
    link,
    footer: 'Ссылка действует 24 часа. Если вы не регистрировались, просто проигнорируйте письмо.',
  })

export const passwordResetEmail = (to: string, username: string, link: string): MailMessage =>
  linkEmail({
    to,
    subject: 'Chinchi: сброс пароля',
    greeting: `Привет, ${username}!`,
    body: 'Мы получили запрос на сброс пароля. Нажмите на кнопку, чтобы задать новый пароль.',
    action: 'Сбросить пароль',
    link,
    footer: 'Ссылка действует 1 час. Если вы не запрашивали сброс, просто проигнорируйте письмо.',
  })
