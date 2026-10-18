import { useId } from 'react'

import type { ReactNode } from 'react'

export interface SettingsSectionProps {
  readonly title: string
  readonly subtitle?: string
  readonly children: ReactNode
}

export const SettingsSection = ({ title, subtitle, children }: SettingsSectionProps) => {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <header>
        <h1 id={id} className="text-[21px] font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  )
}

/** A group of settings: its title above, the rows in a soft card. `danger` rings it in red. */
export const SettingsCard = ({
  title,
  danger = false,
  children,
}: {
  title?: string
  danger?: boolean
  children: ReactNode
}) => (
  <div className="flex flex-col gap-2">
    {title ? <h2 className="px-1.5 text-[12.5px] font-medium text-faint">{title}</h2> : null}
    <div
      className={`rounded-card bg-stage p-4 ${danger ? 'shadow-[inset_0_0_0_1.5px_var(--zl-danger-soft)]' : ''}`}
    >
      {children}
    </div>
  </div>
)
