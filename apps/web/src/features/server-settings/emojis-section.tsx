import { EMOJI_IMAGE_MAX_BYTES, emojiNameSchema, MAX_GUILD_EMOJIS } from '@chinchi/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { CustomEmoji } from '../emoji/custom-emoji'
import { updateGuild } from '../guilds/guild-cache'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { GuildDetail, GuildEmoji } from '@chinchi/shared'

/** The server's own emoji: upload with a name, delete. */
export const EmojisSection = ({ guild }: { guild: GuildDetail }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [tooBig, setTooBig] = useState(false)
  const setEmojis = (change: (emojis: readonly GuildEmoji[]) => GuildEmoji[]) =>
    updateGuild(queryClient, guild.id, (current) => ({
      ...current,
      emojis: change(current.emojis),
    }))
  const upload = useMutation({
    mutationFn: (file: File) => api.emojis.create(guild.id, name.trim(), file),
    onSuccess: ({ emoji }) => {
      setName('')
      setEmojis((emojis) => [...emojis.filter((e) => e.id !== emoji.id), emoji])
    },
  })
  const remove = useMutation({
    mutationFn: (emojiId: string) => api.emojis.delete(guild.id, emojiId),
    onSuccess: (_, emojiId) => setEmojis((emojis) => emojis.filter((e) => e.id !== emojiId)),
  })
  const nameOk = emojiNameSchema.safeParse(name).success
  const full = guild.emojis.length >= MAX_GUILD_EMOJIS
  const error = upload.error ?? remove.error

  return (
    <SettingsSection
      title={t('emojis.title')}
      subtitle={t('emojis.subtitle', { count: MAX_GUILD_EMOJIS })}
    >
      <SettingsCard>
        <div className="flex flex-col gap-3">
          <TextField
            label={t('emojis.name')}
            value={name}
            placeholder="party_cat"
            error={name && !nameOk ? t('emojis.nameRule') : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <label
            className={`w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast focus-within:outline-2 focus-within:outline-accent ${nameOk && !full ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-60'}`}
          >
            {upload.isPending ? t('common.loading') : t('emojis.upload')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              aria-label={t('emojis.upload')}
              disabled={!nameOk || full || upload.isPending}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setTooBig(file.size > EMOJI_IMAGE_MAX_BYTES)
                if (file.size <= EMOJI_IMAGE_MAX_BYTES) upload.mutate(file)
              }}
            />
          </label>
          <p className="text-xs text-muted">{t('emojis.hint')}</p>
          {tooBig ? <Alert tone="error">{t('emojis.tooBig')}</Alert> : null}
          {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
        </div>
      </SettingsCard>
      <SettingsCard>
        {guild.emojis.length === 0 ? (
          <p className="text-sm text-muted">{t('emojis.empty')}</p>
        ) : null}
        <ul aria-label={t('emojis.list')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {guild.emojis.map((emoji) => (
            <li key={emoji.id} className="flex items-center gap-3 rounded-md bg-main p-2">
              <CustomEmoji id={emoji.id} name={emoji.name} className="size-8" />
              <span className="flex-1 truncate font-mono text-sm">:{emoji.name}:</span>
              {emoji.animated ? (
                <span
                  title={t('emojis.animated')}
                  className="rounded bg-field px-1.5 py-0.5 text-xs font-semibold text-muted"
                >
                  GIF
                </span>
              ) : null}
              <Button
                variant="secondary"
                fullWidth={false}
                aria-label={t('emojis.delete', { name: `:${emoji.name}:` })}
                onClick={() => remove.mutate(emoji.id)}
              >
                {t('emojis.deleteShort')}
              </Button>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SettingsSection>
  )
}
