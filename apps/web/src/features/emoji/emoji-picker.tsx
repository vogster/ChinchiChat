import { CUSTOM_EMOJI_PATTERN, customEmojiText } from '@chinchi/shared'
import * as Popover from '@radix-ui/react-popover'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CustomEmoji, EmojiGlyph } from './custom-emoji'
import { EMOJI_GROUPS, emojiQueryOptions, searchEmoji } from './emoji-data'
import { readRecentEmoji, rememberEmoji } from './recent-emoji'

import type { GuildEmoji } from '@chinchi/shared'
import type { ReactNode } from 'react'

export interface QuickEmoji {
  readonly emoji: string
  /** Spoken name of the quick button (e.g. "React with 👍"). */
  readonly label: string
}

export interface EmojiPickerProps {
  /** Name of the trigger and of the panel. */
  readonly label: string
  readonly trigger: ReactNode
  readonly triggerClassName?: string
  readonly onSelect: (emoji: string) => void
  readonly onOpenChange?: (open: boolean) => void
  /** A row of one-click choices above the full list. */
  readonly quick?: readonly QuickEmoji[]
  /** The server's own emoji, listed first under its name. */
  readonly custom?: { readonly title: string; readonly emojis: readonly GuildEmoji[] } | null
}

const emojiButton =
  'flex size-9 items-center justify-center rounded text-2xl hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent'

/** Search or browse by category; picking closes the panel. Loads its data on first open. */
export const EmojiPicker = ({
  label,
  trigger,
  triggerClassName = '',
  onSelect,
  onOpenChange,
  quick = [],
  custom = null,
}: EmojiPickerProps) => {
  const { t, i18n } = useTranslation()
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<number>(EMOJI_GROUPS[0].id)
  const { data: entries = [], isPending } = useQuery({
    ...emojiQueryOptions(i18n.language),
    enabled: open,
  })

  const pick = (emoji: string) => {
    rememberEmoji(emoji)
    onSelect(emoji)
    setOpen(false)
    setQuery('')
  }
  // The server's emoji match the search by name.
  const serverEmojis = (custom?.emojis ?? []).filter((emoji) =>
    emoji.name.toLowerCase().includes(query.trim().toLowerCase().replace(/:/g, '')),
  )
  // Server emoji from elsewhere wouldn't show here: only this server's own come back.
  const ownIds = new Set((custom?.emojis ?? []).map((emoji) => emoji.id))
  const recent = open
    ? readRecentEmoji().filter((emoji) => {
        const match = CUSTOM_EMOJI_PATTERN.exec(emoji)
        return !match || ownIds.has(match[3] as string)
      })
    : []
  const shown = query.trim()
    ? searchEmoji(entries, query)
    : entries.filter((entry) => entry.group === group)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={label} title={label} className={triggerClassName}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label={label}
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex w-80 flex-col gap-2 rounded-lg bg-rail p-2 text-text shadow-xl"
        >
          <input
            type="search"
            value={query}
            autoFocus
            aria-label={t('emoji.search')}
            placeholder={t('emoji.search')}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded-md bg-elevated px-2 py-1.5 text-sm outline-none placeholder:text-muted"
          />
          {quick.length > 0 ? (
            <div className="flex gap-1 border-b border-border pb-2">
              {quick.map((item) => (
                <button
                  key={item.emoji}
                  type="button"
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => pick(item.emoji)}
                  className={emojiButton}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : null}
          {query.trim() ? null : (
            <div role="tablist" aria-label={t('emoji.categories')} className="flex justify-between">
              {EMOJI_GROUPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={group === item.id}
                  aria-label={t(`emoji.groups.${item.key}`)}
                  title={t(`emoji.groups.${item.key}`)}
                  onClick={() => setGroup(item.id)}
                  className="rounded p-1 text-lg opacity-60 hover:opacity-100 aria-selected:opacity-100"
                >
                  {item.icon}
                </button>
              ))}
            </div>
          )}
          {recent.length > 0 && !query.trim() ? (
            <section aria-label={t('emoji.recent')} className="border-b border-border pb-2">
              <h3 className="mb-1 px-1 text-xs font-bold tracking-wide text-muted uppercase">
                {t('emoji.recent')}
              </h3>
              <div className="grid grid-cols-8 gap-0.5">
                {recent.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={emoji}
                    title={emoji}
                    onClick={() => pick(emoji)}
                    className={emojiButton}
                  >
                    <EmojiGlyph emoji={emoji} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {serverEmojis.length > 0 ? (
            <section aria-label={custom?.title} className="border-b border-border pb-2">
              <h3 className="mb-1 px-1 text-xs font-bold tracking-wide text-muted uppercase">
                {custom?.title}
              </h3>
              <div className="grid max-h-28 grid-cols-8 gap-0.5 overflow-y-auto">
                {serverEmojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    aria-label={`:${emoji.name}:`}
                    title={`:${emoji.name}:`}
                    onClick={() => pick(customEmojiText(emoji))}
                    className={emojiButton}
                  >
                    <CustomEmoji id={emoji.id} name={emoji.name} className="size-7" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="grid h-64 auto-rows-min grid-cols-8 gap-0.5 overflow-y-auto">
            {isPending ? (
              <p className="col-span-8 p-2 text-sm text-muted">{t('emoji.loading')}</p>
            ) : null}
            {!isPending && shown.length === 0 ? (
              <p className="col-span-8 p-2 text-sm text-muted">{t('emoji.nothing')}</p>
            ) : null}
            {shown.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                aria-label={`${entry.emoji} ${entry.label}`}
                title={entry.label}
                onClick={() => pick(entry.emoji)}
                className={emojiButton}
              >
                {entry.emoji}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
