import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

const TONES: Readonly<Record<Tone, string>> = {
  error: 'bg-danger-soft text-danger',
  success: 'bg-secure-soft text-secure-text',
  info: 'bg-accent-soft text-text',
}

export const Alert = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`rounded-field px-3.5 py-2.5 text-sm ${TONES[tone]}`}
  >
    {children}
  </div>
)
