import { useTranslation } from 'react-i18next'

/** Encryption has not been independently reviewed yet: said wherever it is offered or used. */
export const BetaBadge = () => {
  const { t } = useTranslation()
  return (
    <span
      title={t('e2ee.betaHint')}
      className="shrink-0 rounded bg-mention/15 px-1 py-px text-[10px] leading-tight font-semibold tracking-wide text-mention uppercase"
    >
      {t('e2ee.beta')}
    </span>
  )
}
