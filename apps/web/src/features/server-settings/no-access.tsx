import { useTranslation } from 'react-i18next'

/** Shown when a section is opened without the permission it needs (e.g. after losing a role). */
export const NoAccess = () => {
  const { t } = useTranslation()
  return <p className="text-muted">{t('serverSettings.noAccess')}</p>
}
