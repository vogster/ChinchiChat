import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { usePublicOrigin } from '../media/media-base'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { InstanceSettings, RegistrationMode } from '@chinchi/shared'

const settingsKey = ['admin', 'settings'] as const
const invitesKey = ['admin', 'invites'] as const
const MODES: readonly RegistrationMode[] = ['open', 'invite', 'closed']

const inviteLink = (origin: string, code: string) =>
  `${origin}/register?invite=${encodeURIComponent(code)}`

const SettingsForm = ({ settings }: { settings: InstanceSettings }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState(settings.registrationMode)
  const [limit, setLimit] = useState(settings.maxGuildsPerUser?.toString() ?? '')
  const [verifiedEmail, setVerifiedEmail] = useState(settings.requireVerifiedEmail)
  const save = useMutation({
    mutationFn: () =>
      api.admin.updateSettings({
        registrationMode: mode,
        maxGuildsPerUser: limit.trim() ? Number(limit) : null,
        requireVerifiedEmail: verifiedEmail,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKey, data)
      void queryClient.invalidateQueries({ queryKey: ['instance'] })
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="registration-mode"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('admin.instance.registration')}
        </label>
        <select
          id="registration-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as RegistrationMode)}
          className="rounded-md border border-line bg-rail px-3 py-2"
        >
          {MODES.map((value) => (
            <option key={value} value={value}>
              {t(`admin.instance.modes.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="guild-limit"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('admin.instance.guildLimit')}
        </label>
        <input
          id="guild-limit"
          type="number"
          min={1}
          max={1000}
          value={limit}
          placeholder={t('admin.instance.noLimit')}
          onChange={(event) => setLimit(event.target.value)}
          className="rounded-md border border-line bg-rail px-3 py-2"
        />
      </div>
      <Switch
        checked={verifiedEmail}
        onCheckedChange={setVerifiedEmail}
        label={t('admin.instance.requireVerifiedEmail')}
        description={t('admin.instance.requireVerifiedEmailHint')}
      />
      {save.isError ? <Alert tone="error">{errorMessage(t, save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">{t('admin.instance.saved')}</Alert> : null}
      <Button type="submit" fullWidth={false} pending={save.isPending}>
        {t('admin.instance.save')}
      </Button>
    </form>
  )
}

const Invites = () => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const origin = usePublicOrigin()
  const queryClient = useQueryClient()
  const { data: invites = [] } = useQuery({
    queryKey: invitesKey,
    queryFn: async () => (await api.admin.invites()).invites,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: invitesKey })
  const create = useMutation({
    mutationFn: () => api.admin.createInvite(),
    onSuccess: ({ invite }) => queryClient.setQueryData(invitesKey, [invite, ...invites]),
  })
  const revoke = useMutation({ mutationFn: api.admin.revokeInvite, onSuccess: refresh })
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('admin.instance.invitesText')}</p>
      {create.isError || revoke.isError ? (
        <Alert tone="error">{errorMessage(t, create.error ?? revoke.error)}</Alert>
      ) : null}
      <Button fullWidth={false} pending={create.isPending} onClick={() => create.mutate()}>
        {t('admin.instance.createInvite')}
      </Button>
      <ul aria-label={t('admin.instance.invites')} className="flex flex-col divide-y divide-line">
        {invites.map((invite) => (
          <li key={invite.code} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm break-all">{inviteLink(origin, invite.code)}</p>
              <p className="text-xs text-muted">
                {t('admin.instance.uses', {
                  uses: invite.uses,
                  max: invite.maxUses ?? '∞',
                })}
                {invite.expiresAt
                  ? ` · ${t('admin.instance.expires', { date: date(invite.expiresAt) })}`
                  : ''}
              </p>
            </div>
            <Button
              variant="secondary"
              fullWidth={false}
              onClick={() => void navigator.clipboard?.writeText(inviteLink(origin, invite.code))}
            >
              {t('admin.instance.copy')}
            </Button>
            <Button
              variant="danger"
              fullWidth={false}
              aria-label={t('admin.instance.revoke', { code: invite.code })}
              onClick={() => revoke.mutate(invite.code)}
            >
              {t('admin.instance.revokeShort')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Registration, limits and instance invites. */
export const AdminInstanceSection = () => {
  const { t } = useTranslation()
  const api = useApi()
  const { data } = useQuery({ queryKey: settingsKey, queryFn: () => api.admin.settings() })

  return (
    <SettingsSection title={t('admin.instance.title')}>
      <SettingsCard>
        {data ? <SettingsForm settings={data.settings} /> : <p>{t('common.loading')}</p>}
      </SettingsCard>
      <SettingsCard title={t('admin.instance.invites')}>
        <Invites />
      </SettingsCard>
    </SettingsSection>
  )
}
