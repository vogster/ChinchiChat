import { useTranslation } from 'react-i18next'

/** Encryption has not been independently reviewed yet: said wherever it is offered or used. */
export const BetaBadge = () => {
  const { t } = useTranslation()
  return (
    <span
      title={t('e2ee.betaHint')}
      className="flex h-5 shrink-0 items-center rounded-[7px] bg-warning-soft px-[7px] text-[10.5px] font-semibold tracking-wide text-warning-text uppercase"
    >
      {t('e2ee.beta')}
    </span>
  )
}
