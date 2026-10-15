import { useTranslation } from 'react-i18next'

import type { Command } from '@chinchi/shared'

/** The commands matching what is typed after `/`, above the composer. */
export const CommandSuggestions = ({
  commands,
  active,
  onPick,
}: {
  commands: readonly Command[]
  /** Index of the highlighted command (arrows move it, Enter or Tab picks it). */
  active: number
  onPick: (command: Command) => void
}) => {
  const { t } = useTranslation()
  return (
    <ul
      role="listbox"
      aria-label={t('commands.suggestions')}
      className="mb-1 flex max-h-64 flex-col overflow-y-auto rounded-lg border border-border bg-sidebar py-1"
    >
      {commands.map((command, index) => (
        <li
          key={command.id}
          role="option"
          aria-selected={index === active}
          // Keeps focus in the composer while picking with the mouse.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(command)}
          className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm hover:bg-elevated aria-selected:bg-elevated"
        >
          <span className="font-semibold">/{command.name}</span>
          {command.options.map((option) => (
            <span key={option.name} className="text-xs text-muted">
              {option.required ? `<${option.name}>` : `[${option.name}]`}
            </span>
          ))}
          <span className="min-w-0 flex-1 truncate text-muted">{command.description}</span>
          <span className="shrink-0 text-xs text-muted">{command.bot.username}</span>
        </li>
      ))}
    </ul>
  )
}
