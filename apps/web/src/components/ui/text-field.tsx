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
        className={`px-1.5 text-[12.5px] font-medium ${error ? 'text-danger' : 'text-faint'}`}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-11 rounded-field bg-field px-3.5 text-text outline-none transition placeholder:text-faint focus:ring-2 ${error ? 'ring-2 ring-danger' : 'focus:ring-accent'} ${className}`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="px-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
