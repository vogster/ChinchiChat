import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'

/** Recovery codes, shown once: the user has to keep them somewhere. */
export const RecoveryCodes = ({ codes, onDone }: { codes: string[]; onDone: () => void }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{t('settings.mfa.codesText')}</p>
      <ul
        aria-label={t('settings.mfa.codes')}
        className="grid grid-cols-2 gap-1 rounded-md bg-rail p-3 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button
        variant="secondary"
        onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}
      >
        {t('settings.mfa.copyCodes')}
      </Button>
      <Button onClick={onDone}>{t('settings.mfa.saved')}</Button>
    </div>
  )
}
