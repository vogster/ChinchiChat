import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { guildsQueryOptions } from '../guilds/queries'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { Bot } from '@chinchi/shared'

const botsKey = ['bots'] as const

/** A token shown once, with a way to copy it. */
const TokenBox = ({ token }: { token: string }) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/10 p-3">
      <TextField
        label={t('bots.token')}
        value={token}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <p className="text-xs text-muted">{t('bots.tokenOnce')}</p>
      <Button
        variant="secondary"
        fullWidth={false}
        onClick={() => void navigator.clipboard?.writeText(token)}
      >
        {t('bots.copy')}
      </Button>
    </div>
  )
}

/** The user's servers; the server answers whether they may add bots there (MANAGE_GUILD). */
const useGuilds = () => useQuery(guildsQueryOptions(useApi())).data ?? []

const BotRow = ({ bot, onToken }: { bot: Bot; onToken: (token: string) => void }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const guilds = useGuilds()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: botsKey })
  const update = useMutation({
    mutationFn: (isPublic: boolean) => api.bots.update(bot.user.id, { public: isPublic }),
    onSuccess: refresh,
  })
  const renew = useMutation({
    mutationFn: () => api.bots.renewToken(bot.user.id),
    onSuccess: ({ token }) => onToken(token),
  })
  const remove = useMutation({ mutationFn: () => api.bots.delete(bot.user.id), onSuccess: refresh })
  const add = useMutation({
    mutationFn: (guildId: string) => api.bots.addToGuild(guildId, bot.user.id),
  })
  const error = update.error ?? renew.error ?? remove.error ?? add.error
  const name = bot.user.username

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <Avatar
          name={bot.user.displayName ?? name}
          src={bot.user.avatarUrl}
          id={bot.user.id}
          className="size-9"
        />
        <span className="flex-1 truncate font-medium">{name}</span>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={bot.public}
            onChange={(event) => update.mutate(event.target.checked)}
            className="accent-[var(--zl-accent)]"
          />
          {t('bots.public')}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('bots.addTo', { name })}
          value=""
          onChange={(event) => event.target.value && add.mutate(event.target.value)}
          className="rounded-md border border-line bg-rail px-2 py-1 text-sm"
        >
          <option value="">{t('bots.addToPlaceholder')}</option>
          {guilds.map((guild) => (
            <option key={guild.id} value={guild.id}>
              {guild.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" fullWidth={false} onClick={() => renew.mutate()}>
          {t('bots.renew')}
        </Button>
        <Button
          variant="danger"
          fullWidth={false}
          aria-label={t('bots.delete', { name })}
          onClick={() => remove.mutate()}
        >
          {t('bots.deleteShort')}
        </Button>
      </div>
      {add.isSuccess ? <Alert tone="success">{t('bots.added')}</Alert> : null}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
    </li>
  )
}

/** The user's bots: create one (its token is shown once), renew, share, add to servers. */
export const BotsSection = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const { data: bots = [] } = useQuery({
    queryKey: botsKey,
    queryFn: async () => (await api.bots.list()).bots,
  })
  const create = useMutation({
    mutationFn: () => api.bots.create(username.trim()),
    onSuccess: (created) => {
      setUsername('')
      setToken(created.token)
      queryClient.setQueryData(botsKey, [...bots, created.bot])
    },
  })

  return (
    <SettingsSection title={t('bots.title')} subtitle={t('bots.subtitle')}>
      <SettingsCard>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (username.trim()) create.mutate()
          }}
        >
          <TextField
            label={t('bots.username')}
            value={username}
            placeholder="helper_bot"
            onChange={(event) => setUsername(event.target.value)}
          />
          {create.isError ? <Alert tone="error">{errorMessage(t, create.error)}</Alert> : null}
          <Button
            type="submit"
            fullWidth={false}
            pending={create.isPending}
            disabled={!username.trim()}
          >
            {t('bots.create')}
          </Button>
        </form>
      </SettingsCard>
      {token ? <TokenBox token={token} /> : null}
      <SettingsCard>
        {bots.length === 0 ? <p className="text-sm text-muted">{t('bots.empty')}</p> : null}
        <ul aria-label={t('bots.list')} className="flex flex-col divide-y divide-line">
          {bots.map((bot) => (
            <BotRow key={bot.user.id} bot={bot} onToken={setToken} />
          ))}
        </ul>
      </SettingsCard>
    </SettingsSection>
  )
}
