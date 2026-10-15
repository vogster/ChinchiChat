import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SettingsCard } from './settings-section'

/** The archive is built by the server as it downloads; the browser just saves it. */
const EXPORT_URL = '/api/v1/users/@me/export'

export const DataExport = () => {
  const { t } = useTranslation()
  return (
    <SettingsCard title={t('settings.export.title')}>
      <p className="mb-3 text-sm text-muted">{t('settings.export.description')}</p>
      <a
        href={EXPORT_URL}
        download
        className="inline-flex items-center gap-2 rounded-md bg-elevated px-3 py-2 text-sm font-medium hover:bg-hover"
      >
        <Download aria-hidden className="size-4" />
        {t('settings.export.download')}
      </a>
    </SettingsCard>
  )
}
