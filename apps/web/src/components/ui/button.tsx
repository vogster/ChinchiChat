import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'link' | 'on-accent'

/** Filled buttons are pills (radius = half the height). */
const PILL =
  'h-10 rounded-full px-5 font-medium transition disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS: Readonly<Record<Variant, string>> = {
  primary: `${PILL} bg-accent text-accent-contrast hover:brightness-110`,
  secondary: `${PILL} bg-field text-text hover:bg-chip`,
  danger: `${PILL} bg-danger text-danger-contrast hover:brightness-110`,
  link: 'text-sm font-medium text-accent-text hover:underline disabled:opacity-60',
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
