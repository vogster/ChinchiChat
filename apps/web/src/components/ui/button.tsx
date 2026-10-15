import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'link' | 'on-accent'

const VARIANTS: Readonly<Record<Variant, string>> = {
  primary:
    'rounded-md bg-accent px-4 py-2.5 font-medium text-accent-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'rounded-md bg-elevated px-4 py-2.5 font-medium text-text transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60',
  danger:
    'rounded-md bg-red-600 px-4 py-2.5 font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60',
  link: 'text-sm font-medium text-accent hover:underline disabled:opacity-60',
  'on-accent':
    'text-sm font-semibold text-accent-contrast underline hover:opacity-90 disabled:opacity-60',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant
  readonly pending?: boolean
  /** Block buttons stretch to their container; set false for inline buttons. */
  readonly fullWidth?: boolean
}

export const Button = ({
  variant = 'primary',
  pending = false,
  fullWidth = variant !== 'link' && variant !== 'on-accent',
  disabled,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) => (
  <button
    type={type}
    disabled={disabled || pending}
    aria-busy={pending || undefined}
    className={`${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    {...props}
  >
    {children}
  </button>
)
