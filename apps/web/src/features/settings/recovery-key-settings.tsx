import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EnterRecoveryKeyDialog, RecoveryKeyText } from '../e2ee/recovery-dialogs'
import { downloadRecoveryKey } from '../e2ee/recovery-file'
import { useRecovery } from '../e2ee/use-recovery'

/** The recovery key: shown again on a device that holds it, typed in on one that doesn't. */
export const RecoveryKeySettings = () => {
  const { t } = useTranslation()
  const recovery = useRecovery()
  const [shown, setShown] = useState(false)
  const [entering, setEntering] = useState(false)
  if (!recovery.loaded) return null

  if (!recovery.key) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted">{t('e2ee.recovery.notHere')}</p>
        <Button variant="secondary" onClick={() => setEntering(true)}>
          {t('e2ee.recovery.enter')}
        </Button>
        {entering ? (
          <EnterRecoveryKeyDialog recovery={recovery} onOpenChange={setEntering} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {recovery.saved ? null : <p className="text-sm text-muted">{t('e2ee.recovery.notSaved')}</p>}
      {shown ? <RecoveryKeyText value={recovery.key} /> : null}
      <div className="flex flex-wrap gap-2">
        {shown ? null : (
          <Button variant="secondary" onClick={() => setShown(true)}>
            {t('e2ee.recovery.show')}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            downloadRecoveryKey(recovery.key as string, t('e2ee.recovery.fileNote'))
            void recovery.markSaved()
          }}
        >
          {t('e2ee.recovery.download')}
        </Button>
      </div>
    </div>
  )
}
