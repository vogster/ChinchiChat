import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { downloadRecoveryKey } from './recovery-file'

import type { RecoveryControls } from './use-recovery'

export const RecoveryKeyText = ({ value }: { value: string }) => (
  <p className="rounded-md bg-rail px-3 py-2 text-center font-mono text-sm tracking-wider break-all select-all">
    {value}
  </p>
)

/** Shown once (until saved): the one thing the user has to do for encryption. */
export const SaveRecoveryKeyDialog = ({
  recoveryKey,
  onSaved,
  onLater,
}: {
  recoveryKey: string
  onSaved: () => void
  onLater: () => void
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onLater()}
      title={t('e2ee.recovery.saveTitle')}
      description={t('e2ee.recovery.saveHint')}
    >
      <div className="flex flex-col gap-4">
        <RecoveryKeyText value={recoveryKey} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => downloadRecoveryKey(recoveryKey, t('e2ee.recovery.fileNote'))}
          >
            {t('e2ee.recovery.download')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(recoveryKey)
                .then(() => setCopied(true))
                .catch(() => undefined)
            }
          >
            {copied ? t('e2ee.recovery.copied') : t('e2ee.recovery.copy')}
          </Button>
        </div>
        <p className="text-sm text-muted">{t('e2ee.recovery.lossWarning')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onLater}>
            {t('e2ee.recovery.later')}
          </Button>
          <Button onClick={onSaved}>{t('e2ee.recovery.saved')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Typing the key on a device that lacks it: history and trust come back. */
export const EnterRecoveryKeyDialog = ({
  recovery,
  onOpenChange,
}: {
  recovery: RecoveryControls
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await recovery.useKey(text)
      if (result === 'ok') onOpenChange(false)
      else setError(t(result === 'invalid' ? 'e2ee.recovery.invalid' : 'e2ee.recovery.wrong'))
    } catch {
      setError(t('e2ee.recovery.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('e2ee.recovery.enterTitle')}
      description={t('e2ee.recovery.enterHint')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <TextField
          label={t('e2ee.recovery.enterTitle')}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" pending={pending} disabled={text.trim().length === 0}>
            {t('e2ee.recovery.restore')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
