import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

const TONES: Readonly<Record<Tone, string>> = {
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
  success: 'border-green-500/40 bg-green-500/10 text-green-300',
  info: 'border-accent/40 bg-accent/10 text-text',
}

export const Alert = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`rounded-md border px-3 py-2 text-sm ${TONES[tone]}`}
  >
    {children}
  </div>
)
