import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { Snowflake } from '@chinchi/shared'

const bansKey = (guildId: Snowflake) => ['guilds', guildId, 'bans'] as const

/** Who is banned, why, and a way to let them back. */
export const BansSection = ({ guildId }: { guildId: Snowflake }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const {
    data: bans,
    isError,
    error,
  } = useQuery({
    queryKey: bansKey(guildId),
    queryFn: async () => (await api.moderation.bans(guildId)).bans,
  })
  const unban = useMutation({
    mutationFn: (userId: Snowflake) => api.moderation.unban(guildId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bansKey(guildId) }),
  })
  const failure = isError ? error : unban.error

  return (
    <SettingsSection
      title={t('serverSettings.bans.title')}
      subtitle={t('serverSettings.bans.subtitle')}
    >
      {failure ? <Alert tone="error">{errorMessage(t, failure)}</Alert> : null}
      <SettingsCard>
        {bans === undefined ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : bans.length === 0 ? (
          <p className="text-sm text-muted">{t('serverSettings.bans.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {bans.map((ban) => {
              const name = ban.user.displayName ?? ban.user.username
              return (
                <li key={ban.user.id} className="flex items-center gap-3 py-3">
                  <Avatar
                    name={name}
                    src={ban.user.avatarUrl}
                    id={ban.user.id}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-sm text-muted">
                      {ban.reason ?? t('serverSettings.bans.noReason')}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={t('serverSettings.bans.unbanUser', { name })}
                    fullWidth={false}
                    pending={unban.isPending && unban.variables === ban.user.id}
                    onClick={() => unban.mutate(ban.user.id)}
                  >
                    {t('serverSettings.bans.unban')}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
