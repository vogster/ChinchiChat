import { useTranslation } from 'react-i18next'

import { ProfileTrigger } from '../profile/profile-trigger'
import { formatMessageTime } from './format-time'

import type { MessageItem as Item } from './queries'

const badgeClass =
  'shrink-0 rounded-lg bg-accent-soft px-2 py-px text-[11px] font-medium text-accent-text'

/** Above a run of bubbles: who wrote them (not for your own) and when. */
export const MessageHeader = ({
  message,
  name,
  mine,
  authorColor,
  guildId,
}: {
  message: Item
  name: string
  mine: boolean
  authorColor?: string | undefined
  guildId: string | null
}) => {
  const { t, i18n } = useTranslation()
  return (
    <div
      className={`flex max-w-full min-w-0 items-baseline gap-2 whitespace-nowrap ${mine ? 'pr-3' : 'pl-3'}`}
    >
      {/* A long name shrinks with an ellipsis; the badges and time always stay whole. */}
      {mine ? (
        <span className="sr-only">{name}</span>
      ) : message.author ? (
        <ProfileTrigger
          userId={message.author.id}
          guildId={guildId}
          name={name}
          className="min-w-0 truncate text-[13px] font-semibold"
        >
          <span style={authorColor ? { color: authorColor } : undefined}>{name}</span>
        </ProfileTrigger>
      ) : (
        <span className="min-w-0 truncate text-[13px] font-semibold">{name}</span>
      )}
      {message.author?.bot ? <span className={badgeClass}>{t('bots.badge')}</span> : null}
      {message.webhook ? <span className={badgeClass}>{t('webhooks.badge')}</span> : null}
      {/* Encrypted conversations: the signature MLS checked disagrees with the server. */}
      {message.senderCheck?.kind === 'mismatch' ? (
        <span
          role="status"
          title={t('e2ee.sender.mismatchHint')}
          className="shrink-0 rounded-lg bg-danger-soft px-2 py-px text-[11px] font-semibold text-danger"
        >
          {t('e2ee.sender.mismatch')}
        </span>
      ) : null}
      {message.senderCheck?.kind === 'unverified' ? (
        <span title={t('e2ee.sender.unverifiedHint')} className="shrink-0 text-xs text-faint">
          {t('e2ee.sender.unverified')}
        </span>
      ) : null}
      <time dateTime={message.createdAt} className="shrink-0 text-[11.5px] text-faint">
        {formatMessageTime(message.createdAt, i18n.language)}
      </time>
      {message.published ? (
        <span title={t('announcements.publishedHint')} className="text-xs text-faint">
          {t('announcements.published')}
        </span>
      ) : null}
    </div>
  )
}
