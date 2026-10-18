import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { KeyboardEvent } from 'react'

/** Editing a message in place: Enter saves, Escape (or no change) cancels. */
export const EditBox = ({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') onCancel()
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim() === '') return
      if (value.trim() === initial.trim()) onCancel()
      else onSave(value)
    }
  }

  return (
    <div className="w-full min-w-[min(420px,100%)]">
      <textarea
        aria-label={t('messages.editLabel')}
        autoFocus
        value={value}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) =>
          event.target.setSelectionRange(event.target.value.length, event.target.value.length)
        }
        className="w-full resize-none rounded-[18px] bg-field px-3.5 py-2.5 text-body outline-none focus:ring-2 focus:ring-accent"
      />
      <p className="px-1.5 text-xs text-faint">{t('messages.editHint')}</p>
    </div>
  )
}
