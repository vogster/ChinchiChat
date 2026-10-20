import type { ReactNode } from 'react'

export interface AuthCardProps {
  readonly title: string
  readonly subtitle?: string
  readonly children: ReactNode
  /** A second column to the right of the form (the sign-in QR), on wide screens. */
  readonly aside?: ReactNode
}

export const AuthCard = ({ title, subtitle, children, aside }: AuthCardProps) => (
  <div className="flex min-h-full items-center justify-center bg-rail p-4">
    <section
      className={`flex w-full gap-8 rounded-lg bg-main p-6 shadow-xl sm:p-8 ${aside ? 'max-w-3xl' : 'max-w-md'}`}
    >
      <div className="min-w-0 flex-1">
        <header className="mb-5 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
        </header>
        {children}
      </div>
      {aside ? <aside className="flex w-60 shrink-0 items-center">{aside}</aside> : null}
    </section>
  </div>
)
