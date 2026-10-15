import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { userName } from '../dms/dm-names'
import { formatMessageTime } from './format-time'

import type { MessageItem } from './queries'

const ICONS = {
  recipient_add: ArrowRight,
  recipient_remove: ArrowLeft,
  leave: ArrowLeft,
  rename: Pencil,
} as const

/** A group DM note (someone joined, was removed, left, renamed the group): one quiet line. */
export const SystemMessage = ({ message }: { message: MessageItem }) => {
  const { t, i18n } = useTranslation()
  const system = message.system
  if (!system) return null
  const Icon = ICONS[system.kind]
  const actor = message.author ? userName(message.author) : t('messages.deletedUser')
  const target = system.target ? userName(system.target) : t('messages.deletedUser')
  const text =
    system.kind === 'rename' && !system.name
      ? t('messages.system.renameCleared', { actor })
      : t(`messages.system.${system.kind}`, { actor, target, name: system.name })

  return (
    <li
      data-message-id={message.id}
      tabIndex={-1}
      className="mt-3 flex items-center gap-4 px-4 py-0.5"
    >
      <div className="flex w-10 shrink-0 justify-center">
        <Icon aria-hidden className="size-4 text-muted" />
      </div>
      <p className="min-w-0 flex-1 text-sm text-muted">
        {text}{' '}
        <time dateTime={message.createdAt} className="text-xs">
          {formatMessageTime(message.createdAt, i18n.language)}
        </time>
      </p>
    </li>
  )
}
