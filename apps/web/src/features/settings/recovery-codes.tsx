import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { saveTextFile } from '../../lib/save-text-file'
import { instanceQueryOptions } from '../auth/queries'
import { useCurrentUser } from '../auth/use-auth-actions'

/** Recovery codes, shown once: the user has to keep them somewhere. */
export const RecoveryCodes = ({ codes, onDone }: { codes: string[]; onDone: () => void }) => {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const { data: instance } = useQuery(instanceQueryOptions(useApi()))
  const username = me?.username ?? ''

  // Which account and server the codes are for: a file found months later must say so.
  const download = () =>
    saveTextFile(
      `chinchi-recovery-codes-${username}.txt`,
      `${t('settings.mfa.codesFile', { instance: instance?.name ?? 'Chinchi', username })}\n\n${codes.join('\n')}\n`,
    )

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
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={download}>
          {t('settings.mfa.downloadCodes')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}
        >
          {t('settings.mfa.copyCodes')}
        </Button>
      </div>
      <Button onClick={onDone}>{t('settings.mfa.saved')}</Button>
    </div>
  )
}
