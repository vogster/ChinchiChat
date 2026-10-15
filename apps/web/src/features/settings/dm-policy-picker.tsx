import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from '../auth/queries'
import { useCurrentUser } from '../auth/use-auth-actions'

import type { DmPolicy } from '@chinchi/shared'

const POLICIES: readonly DmPolicy[] = ['servers', 'friends']

/** Who may send the user DMs; saved as soon as it is picked. */
export const DmPolicyPicker = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const save = useMutation({
    mutationFn: (dmPolicy: DmPolicy) => api.users.updateMe({ dmPolicy }),
    onSuccess: ({ user }) => queryClient.setQueryData(authKeys.me, user),
  })
  const current = save.isPending ? save.variables : me?.dmPolicy

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium">{t('settings.privacy.dmTitle')}</legend>
      {POLICIES.map((policy) => (
        <label
          key={policy}
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-sidebar px-4 py-3 hover:bg-hover has-[:checked]:outline-2 has-[:checked]:outline-accent"
        >
          <input
            type="radio"
            name="dm-policy"
            value={policy}
            checked={current === policy}
            onChange={() => save.mutate(policy)}
            className="size-4 accent-[var(--zl-accent)]"
          />
          {t(`settings.privacy.${policy}`)}
        </label>
      ))}
      <p className="text-sm text-muted">{t('settings.privacy.hint')}</p>
      {save.isError ? <Alert tone="error">{errorMessage(t, save.error)}</Alert> : null}
    </fieldset>
  )
}
