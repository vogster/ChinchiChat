import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { InputHTMLAttributes, Ref } from 'react'

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: string
  readonly error?: string | undefined
  readonly ref?: Ref<HTMLInputElement>
}

/**
 * A password field, masked until the eye shows what was typed (and hides it again). Looks and
 * reports errors like TextField.
 */
export const PasswordField = ({ label, error, id, ...props }: PasswordFieldProps) => {
  const { t } = useTranslation()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const [shown, setShown] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={`px-1.5 text-[12.5px] font-medium ${error ? 'text-danger' : 'text-faint'}`}
      >
        {label}
      </label>
      {/* The ring follows the input only: clicking the eye doesn't light the field up. */}
      <div
        data-invalid={Boolean(error)}
        className="flex h-11 items-center rounded-field bg-field ring-accent transition has-[input:focus]:ring-2 data-[invalid=true]:ring-2 data-[invalid=true]:ring-danger"
      >
        <input
          id={inputId}
          type={shown ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-text outline-none placeholder:text-faint"
          {...props}
        />
        <button
          type="button"
          aria-label={shown ? t('common.hidePassword') : t('common.showPassword')}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-chip hover:text-text"
        >
          {shown ? (
            <EyeOff aria-hidden className="size-[18px]" />
          ) : (
            <Eye aria-hidden className="size-[18px]" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="px-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
