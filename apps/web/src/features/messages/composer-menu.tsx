import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Paperclip, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { instanceQueryOptions } from '../auth/queries'
import { formatFileSize } from './format-size'

import type { ReactNode } from 'react'

const MenuEntry = ({
  icon,
  tile,
  title,
  hint,
  onSelect,
}: {
  icon: ReactNode
  /** The tile's colours. */
  tile: string
  title: string
  hint: string | null
  onSelect: () => void
}) => (
  <Dropdown.Item
    onSelect={onSelect}
    className="flex cursor-pointer items-center gap-3 rounded-[18px] p-2 outline-none select-none data-[highlighted]:bg-field"
  >
    <span
      aria-hidden
      className={`grid size-[42px] shrink-0 place-items-center rounded-[15px] ${tile}`}
    >
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block font-medium">{title}</span>
      {hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </span>
  </Dropdown.Item>
)

/** The composer's "+": attach files (opens the file picker) or start a poll. */
export const ComposerMenu = ({
  onPickFiles,
  onCreatePoll,
}: {
  /** Absent where files can't be sent. */
  onPickFiles: (() => void) | null
  /** Absent where polls can't be started. */
  onCreatePoll: (() => void) | null
}) => {
  const { t, i18n } = useTranslation()
  const { data: instance } = useQuery(instanceQueryOptions(useApi()))
  const maxBytes = instance?.uploads?.maxBytes ?? null
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        aria-label={t('messages.addToMessage')}
        title={t('messages.addToMessage')}
        className="grid size-[38px] shrink-0 place-items-center self-end rounded-full bg-stage text-muted transition-colors hover:text-text data-[state=open]:bg-chip data-[state=open]:text-text"
      >
        <Plus aria-hidden className="size-5" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side="top"
          align="start"
          sideOffset={10}
          className="z-50 flex w-[280px] flex-col gap-0.5 rounded-card bg-side p-1.5 text-sm text-text shadow-popover"
        >
          {onPickFiles ? (
            <MenuEntry
              icon={<Paperclip className="size-5" />}
              tile="bg-accent-soft text-accent-text"
              title={t('messages.attachMenu')}
              hint={
                maxBytes
                  ? t('messages.attachUpTo', { size: formatFileSize(maxBytes, i18n.language) })
                  : null
              }
              onSelect={onPickFiles}
            />
          ) : null}
          {onCreatePoll ? (
            <MenuEntry
              icon={<BarChart3 className="size-5" />}
              tile="bg-warning-soft text-warning-text"
              title={t('polls.menu')}
              hint={t('polls.menuHint')}
              onSelect={onCreatePoll}
            />
          ) : null}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
