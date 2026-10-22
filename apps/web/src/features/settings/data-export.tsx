import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useCurrentUser } from '../auth/use-auth-actions'
import { ExportDataDialog } from './export-data-dialog'
import { SettingsCard } from './settings-section'

/** All my data as a ZIP, after the password (see ExportDataDialog). */
export const DataExport = () => {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const [asking, setAsking] = useState(false)
  return (
    <SettingsCard title={t('settings.export.title')}>
      <p className="mb-3 text-sm text-muted">{t('settings.export.description')}</p>
      <Button variant="secondary" fullWidth={false} onClick={() => setAsking(true)}>
        <Download aria-hidden className="size-4" />
        {t('settings.export.download')}
      </Button>
      {asking && me ? (
        <ExportDataDialog
          username={me.username}
          mfaEnabled={me.mfaEnabled}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </SettingsCard>
  )
}
