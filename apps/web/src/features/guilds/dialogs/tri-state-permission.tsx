import { Check, Slash, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type OverwriteState = 'deny' | 'inherit' | 'allow'

export interface TriStatePermissionProps {
  readonly label: string
  readonly description: string
  readonly value: OverwriteState
  readonly onChange: (value: OverwriteState) => void
  readonly disabled: boolean
}

const OPTIONS = [
  { value: 'deny', Icon: X, active: 'bg-red-600 text-white' },
  { value: 'inherit', Icon: Slash, active: 'bg-elevated text-text' },
  { value: 'allow', Icon: Check, active: 'bg-green-600 text-white' },
] as const

/** Deny / inherit / allow for one permission in a channel overwrite. */
export const TriStatePermission = ({
  label,
  description,
  value,
  onChange,
  disabled,
}: TriStatePermissionProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted">{description}</span>
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex shrink-0 overflow-hidden rounded-md border border-border"
      >
        {OPTIONS.map(({ value: option, Icon, active }) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            aria-label={t(`permissions.${option}`)}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`flex size-8 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-50 ${value === option ? active : 'text-muted hover:bg-hover'}`}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
