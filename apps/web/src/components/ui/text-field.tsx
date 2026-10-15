import { useId } from 'react'

import type { InputHTMLAttributes, Ref } from 'react'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string
  readonly error?: string | undefined
  readonly ref?: Ref<HTMLInputElement>
}

export const TextField = ({ label, error, id, className = '', ...props }: TextFieldProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={`text-xs font-bold tracking-wide uppercase ${error ? 'text-red-400' : 'text-muted'}`}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-md border bg-rail px-3 py-2 text-text outline-none transition focus:border-accent ${error ? 'border-red-500' : 'border-border'} ${className}`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
