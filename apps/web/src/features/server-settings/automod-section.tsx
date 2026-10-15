import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { AutomodSettings, Snowflake } from '@chinchi/shared'

const automodKey = (guildId: Snowflake) => ['guilds', guildId, 'automod'] as const

const AutomodForm = ({ guildId, settings }: { guildId: Snowflake; settings: AutomodSettings }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [words, setWords] = useState(settings.blockedWords.join('\n'))
  const [antiSpam, setAntiSpam] = useState(settings.antiSpam)
  const [maxMentions, setMaxMentions] = useState(settings.maxMentions?.toString() ?? '')
  const save = useMutation({
    mutationFn: () =>
      api.automod.update(guildId, {
        blockedWords: words
          .split('\n')
          .map((word) => word.trim())
          .filter(Boolean),
        antiSpam,
        maxMentions: maxMentions.trim() ? Number(maxMentions) : null,
      }),
    onSuccess: (data) => queryClient.setQueryData(automodKey(guildId), data),
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
          htmlFor="automod-words"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('automod.words')}
        </label>
        <textarea
          id="automod-words"
          rows={6}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          className="resize-y rounded-md border border-border bg-rail px-3 py-2 outline-none focus:border-accent"
        />
        <p className="text-xs text-muted">{t('automod.wordsHint')}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={antiSpam}
          onChange={(event) => setAntiSpam(event.target.checked)}
          className="mt-0.5 accent-[var(--zl-accent)]"
        />
        <span>
          {t('automod.antiSpam')}
          <span className="block text-xs text-muted">{t('automod.antiSpamHint')}</span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="automod-mentions"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('automod.maxMentions')}
        </label>
        <input
          id="automod-mentions"
          type="number"
          min={1}
          max={50}
          value={maxMentions}
          placeholder={t('automod.noLimit')}
          onChange={(event) => setMaxMentions(event.target.value)}
          className="w-40 rounded-md border border-border bg-rail px-3 py-2"
        />
      </div>
      <p className="text-xs text-muted">{t('automod.moderatorsExempt')}</p>
      {save.isError ? <Alert tone="error">{errorMessage(t, save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">{t('automod.saved')}</Alert> : null}
      <Button type="submit" fullWidth={false} pending={save.isPending}>
        {t('automod.save')}
      </Button>
    </form>
  )
}

/** Word filter, anti-spam and mention limit of a server. */
export const AutomodSection = ({ guildId }: { guildId: Snowflake }) => {
  const { t } = useTranslation()
  const api = useApi()
  const { data } = useQuery({
    queryKey: automodKey(guildId),
    queryFn: () => api.automod.get(guildId),
  })

  return (
    <SettingsSection title={t('automod.title')} subtitle={t('automod.subtitle')}>
      <SettingsCard>
        {data ? (
          <AutomodForm guildId={guildId} settings={data.automod} />
        ) : (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
