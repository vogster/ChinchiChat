import type { ReactNode } from 'react'

export interface AuthCardProps {
  readonly title: string
  readonly subtitle?: string
  readonly children: ReactNode
}

export const AuthCard = ({ title, subtitle, children }: AuthCardProps) => (
  <div className="flex min-h-full items-center justify-center bg-rail p-4">
    <section className="w-full max-w-md rounded-lg bg-main p-6 shadow-xl sm:p-8">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  </div>
)
