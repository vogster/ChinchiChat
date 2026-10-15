import type { ReactNode } from 'react'

export interface SettingsSectionProps {
  readonly title: string
  readonly subtitle?: string
  readonly children: ReactNode
}

export const SettingsSection = ({ title, subtitle, children }: SettingsSectionProps) => (
  <section className="flex flex-col gap-5">
    <header>
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </header>
    {children}
  </section>
)

export const SettingsCard = ({ title, children }: { title?: string; children: ReactNode }) => (
  <div className="rounded-lg bg-sidebar p-4">
    {title ? (
      <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">{title}</h2>
    ) : null}
    {children}
  </div>
)
