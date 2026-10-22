import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EnterRecoveryKeyDialog, RecoveryKeyText } from '../e2ee/recovery-dialogs'
import { downloadRecoveryKey } from '../e2ee/recovery-file'
import { useRecovery } from '../e2ee/use-recovery'
import { useSaveFile } from '../shell/use-save-file'
import { ResetKeysDialog } from './reset-keys-dialog'

/** The recovery key: shown again on a device that holds it, typed in on one that doesn't. */
export const RecoveryKeySettings = () => {
  const { t } = useTranslation()
  const save = useSaveFile()
  const recovery = useRecovery()
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [entering, setEntering] = useState(false)
  const [resetting, setResetting] = useState(false)
  if (!recovery.loaded) return null

  if (!recovery.key) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted">{t('e2ee.recovery.notHere')}</p>
        <Button variant="secondary" fullWidth={false} onClick={() => setEntering(true)}>
          {t('e2ee.recovery.enter')}
        </Button>
        <p className="mt-2 text-sm text-muted">{t('e2ee.recovery.resetQuestion')}</p>
        <Button variant="danger" fullWidth={false} onClick={() => setResetting(true)}>
          {t('e2ee.recovery.reset')}
        </Button>
        {entering ? (
          <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} />
        ) : null}
        {resetting ? (
          <ResetKeysDialog reset={recovery.reset} onClose={() => setResetting(false)} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {recovery.saved ? null : <p className="text-sm text-muted">{t('e2ee.recovery.notSaved')}</p>}
      <div className="flex items-center gap-2">
        {/* Masked until asked for: anyone glancing at the screen shouldn't read it. */}
        <RecoveryKeyText value={shown ? recovery.key : recovery.key.replace(/[^-]/g, '•')} />
        <button
          type="button"
          aria-label={shown ? t('e2ee.recovery.hide') : t('e2ee.recovery.show')}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="rounded p-2 text-muted hover:bg-chip hover:text-text"
        >
          {shown ? (
            <EyeOff aria-hidden className="size-5" />
          ) : (
            <Eye aria-hidden className="size-5" />
          )}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          fullWidth={false}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(recovery.key as string)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? t('e2ee.recovery.copied') : t('e2ee.recovery.copy')}
        </Button>
        <Button
          variant="secondary"
          fullWidth={false}
          onClick={() => {
            void downloadRecoveryKey(save, recovery.key as string, t('e2ee.recovery.fileNote'))
            void recovery.markSaved()
          }}
        >
          {t('e2ee.recovery.download')}
        </Button>
      </div>
    </div>
  )
}
