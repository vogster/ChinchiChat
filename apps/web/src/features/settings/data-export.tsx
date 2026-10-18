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
        className="inline-flex h-9 items-center gap-2 rounded-full bg-field px-4 text-[13px] font-medium transition-colors hover:bg-chip"
      >
        <Download aria-hidden className="size-4" />
        {t('settings.export.download')}
      </a>
    </SettingsCard>
  )
}
