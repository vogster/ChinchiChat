import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'

import type { SafetyControls } from './use-safety'

/** Twelve groups of five digits, four to a line, as both people read them to each other. */
const lines = (code: string) => {
  const groups = code.match(/\d{5}/g) ?? []
  return [0, 4, 8].map((start) => groups.slice(start, start + 4).join(' '))
}

const PersonCode = ({
  userId,
  name,
  verified,
  safety,
}: {
  userId: string
  name: string
  verified: boolean
  safety: SafetyControls
}) => {
  const { t } = useTranslation()
  const [code, setCode] = useState<string | null>(null)
  const { codeWith } = safety

  useEffect(() => {
    let current = true
    codeWith(userId)
      .then((next) => current && setCode(next))
      .catch(() => undefined)
    return () => {
      current = false
    }
    // The code changes with devices, which change the status (and so `verified`) too.
  }, [userId, verified, codeWith])

  return (
    <section
      role="group"
      aria-label={name}
      className="flex flex-col gap-3 rounded-card bg-stage p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold">{name}</span>
        <span
          className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${verified ? 'bg-secure-soft text-secure-text' : 'bg-field text-muted'}`}
        >
          {verified ? <ShieldCheck aria-hidden className="size-3.5" /> : null}
          {verified ? t('e2ee.safety.verified') : t('e2ee.safety.notVerified')}
        </span>
      </div>
      {code ? (
        <div
          role="group"
          aria-label={t('e2ee.safety.codeLabel')}
          className="flex flex-col gap-1.5 rounded-tile bg-field p-3 font-mono text-base font-medium"
        >
          {lines(code).map((line, index) => (
            // Lines may repeat; their place is what tells them apart.
            <p key={index} className="text-center [word-spacing:0.9em]">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {!verified && code ? (
        <Button onClick={() => void safety.verify(userId)}>{t('e2ee.safety.codesMatch')}</Button>
      ) : null}
    </section>
  )
}

/** Safety codes of everyone else here, to compare in person or over another channel. */
export const SafetyDialog = ({
  safety,
  nameOf,
  onOpenChange,
}: {
  safety: SafetyControls
  nameOf: (userId: string) => string
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('e2ee.safety.title')}
      description={t('e2ee.safety.hint')}
    >
      <div className="flex flex-col gap-3">
        {(safety.status?.people ?? []).map((person) => (
          <PersonCode
            key={person.userId}
            userId={person.userId}
            name={nameOf(person.userId)}
            verified={person.verified}
            safety={safety}
          />
        ))}
      </div>
    </Dialog>
  )
}
