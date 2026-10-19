import { KeyRound, Lock, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { BetaBadge } from './beta-badge'
import { useEncryptionGuideSeen } from './use-encryption-guide'

import type { ReactNode } from 'react'

/** A miniature of the real interface, so the step shows what the user will meet. */
const Picture = ({ children }: { children: ReactNode }) => (
  <div
    aria-hidden
    className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-card bg-stage p-5"
  >
    {children}
  </div>
)

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-secure-soft px-3 py-1 text-xs font-semibold text-secure-text">
    {children}
  </span>
)

const KeysPicture = () => {
  const { t } = useTranslation()
  return (
    <Picture>
      <Chip>
        <Lock className="size-3.5" />
        {t('e2ee.guide.chip')}
      </Chip>
      <div className="flex w-full max-w-60 flex-col gap-1.5">
        <span className="self-start rounded-[18px] rounded-bl-md bg-field px-3.5 py-2 text-sm">
          {t('e2ee.guide.sampleMessage')}
        </span>
        <span className="self-end rounded-[18px] rounded-br-md bg-rail px-3.5 py-2 font-mono text-xs text-faint">
          a9f3·c71e·04bd…
        </span>
      </div>
    </Picture>
  )
}

const DevicePicture = () => (
  <Picture>
    <Smartphone className="size-7 text-muted" />
    <div className="flex gap-3 text-3xl">
      {['🦊', '🌵', '🎈', '🐙', '🍋', '🚲'].map((emoji) => (
        <span key={emoji}>{emoji}</span>
      ))}
    </div>
  </Picture>
)

const RecoveryPicture = () => (
  <Picture>
    <span className="grid size-[42px] place-items-center rounded-[15px] bg-warning-soft text-warning-text">
      <KeyRound className="size-5" />
    </span>
    <span className="rounded-md bg-rail px-3 py-2 font-mono text-sm tracking-wider">
      EsTb-9xQ2-Lm4P-…
    </span>
  </Picture>
)

const SafetyPicture = () => (
  <Picture>
    <ShieldCheck className="size-8 text-secure-text" />
    <div className="grid grid-cols-4 gap-x-3 gap-y-1 rounded-field bg-field px-4 py-2 font-mono text-sm">
      {[
        '04821',
        '93310',
        '17206',
        '55841',
        '20937',
        '66104',
        '38412',
        '71059',
        '12873',
        '90264',
        '47718',
        '30595',
      ].map((group) => (
        <span key={group}>{group}</span>
      ))}
    </div>
  </Picture>
)

const MarksPicture = () => {
  const { t } = useTranslation()
  return (
    <Picture>
      <span className="text-sm text-faint italic">{t('e2ee.decrypting')}</span>
      <span className="text-sm text-faint italic">{t('e2ee.unreadable', { count: 3 })}</span>
      <BetaBadge />
    </Picture>
  )
}

const STEPS = [
  { key: 'keys', picture: KeysPicture },
  { key: 'devices', picture: DevicePicture },
  { key: 'recovery', picture: RecoveryPicture },
  { key: 'safety', picture: SafetyPicture },
  { key: 'marks', picture: MarksPicture },
] as const

/** How encrypted conversations work, step by step. */
export const EncryptionGuideDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const step = STEPS[index] ?? STEPS[0]
  const last = index === STEPS.length - 1
  const Shown = step.picture

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('e2ee.guide.title')}>
      <div className="flex flex-col gap-4">
        <Shown />
        <p className="text-xs font-medium text-faint">
          {t('e2ee.guide.progress', { step: index + 1, count: STEPS.length })}
        </p>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-semibold">{t(`e2ee.guide.${step.key}.title`)}</h3>
          <p className="text-pretty text-muted">{t(`e2ee.guide.${step.key}.text`)}</p>
        </div>
        <div className="flex justify-end gap-2">
          {index > 0 ? (
            <Button variant="secondary" fullWidth={false} onClick={() => setIndex(index - 1)}>
              {t('e2ee.guide.back')}
            </Button>
          ) : null}
          <Button fullWidth={false} onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? t('e2ee.guide.done') : t('e2ee.guide.next')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Opens by itself the first time an encrypted conversation is opened in this browser. */
export const EncryptionGuideOnce = () => {
  const [seen, setSeen] = useEncryptionGuideSeen()
  return seen ? null : <EncryptionGuideDialog onClose={() => setSeen(true)} />
}

/** Opens the guide again, from the start of an encrypted conversation. */
export const EncryptionGuideButton = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="link" onClick={() => setOpen(true)} className="mt-2">
        {t('e2ee.guide.open')}
      </Button>
      {open ? <EncryptionGuideDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}
