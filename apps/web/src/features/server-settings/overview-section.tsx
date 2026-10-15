import { useQuery } from '@tanstack/react-query'
import {
  GUILD_NAME_MAX_LENGTH,
  GUILD_NAME_MIN_LENGTH,
  GUILD_RULES_MAX_LENGTH,
} from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { membersQueryOptions } from '../guilds/queries'
import { GuildIcon } from '../guilds/guild-icon'
import {
  useDeleteGuild,
  useGuildIcon,
  useGuildRules,
  useRenameGuild,
  useTransferGuild,
} from '../guilds/use-guild-actions'
import { ImageUploadControl } from '../media/image-upload-control'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { GuildDetail } from '@chinchi/shared'

/** Server name for managers; ownership transfer and deletion for the owner only. */
export const OverviewSection = ({ guild }: { guild: GuildDetail }) => {
  const { t } = useTranslation()
  const api = useApi()
  const me = useCurrentUser()
  const [name, setName] = useState(guild.name)
  const [rulesText, setRulesText] = useState(guild.rules ?? '')
  const rules = useGuildRules(guild.id)
  const [newOwner, setNewOwner] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const rename = useRenameGuild(guild.id)
  const transfer = useTransferGuild(guild.id)
  const remove = useDeleteGuild(guild.id)
  const icon = useGuildIcon(guild.id)
  const isOwner = guild.ownerId === me?.id
  const { data: members = [] } = useQuery({
    ...membersQueryOptions(api, guild.id),
    enabled: isOwner,
  })

  const trimmed = name.trim()
  const nameValid =
    trimmed.length >= GUILD_NAME_MIN_LENGTH && trimmed.length <= GUILD_NAME_MAX_LENGTH
  const error = rename.error ?? rules.error ?? transfer.error ?? remove.error
  const candidates = members.filter((member) => member.user.id !== me?.id)

  return (
    <SettingsSection title={t('serverSettings.nav.overview')}>
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      {rename.isSuccess || rules.isSuccess ? (
        <Alert tone="success">{t('settings.saved')}</Alert>
      ) : null}

      <SettingsCard title={t('guildSettings.icon')}>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-elevated">
            <GuildIcon
              id={guild.id}
              name={guild.name}
              iconUrl={guild.iconUrl}
              className="text-2xl"
            />
          </div>
          <ImageUploadControl
            uploadLabel={t('guildSettings.uploadIcon')}
            removeLabel={t('guildSettings.removeIcon')}
            hasImage={guild.iconUrl !== null}
            pending={icon.isPending}
            error={icon.error}
            onSelect={(file) => icon.mutate(file)}
            onRemove={() => icon.mutate(null)}
          />
        </div>
      </SettingsCard>

      <SettingsCard>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (nameValid) rename.mutate(trimmed)
          }}
        >
          <TextField
            label={t('guildSettings.name')}
            value={name}
            maxLength={GUILD_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="submit"
            className="sm:w-auto sm:self-start"
            pending={rename.isPending}
            disabled={!nameValid || trimmed === guild.name}
          >
            {t('guildSettings.save')}
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard title={t('rules.title')}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            rules.mutate(rulesText)
          }}
        >
          <label htmlFor="guild-rules" className="sr-only">
            {t('rules.title')}
          </label>
          <textarea
            id="guild-rules"
            rows={6}
            maxLength={GUILD_RULES_MAX_LENGTH}
            value={rulesText}
            onChange={(event) => setRulesText(event.target.value)}
            className="resize-y rounded-md border border-border bg-rail px-3 py-2 text-text outline-none transition focus:border-accent"
          />
          <p className="text-xs text-muted">{t('rules.hint')}</p>
          <Button
            type="submit"
            className="sm:w-auto sm:self-start"
            pending={rules.isPending}
            disabled={rulesText.trim() === (guild.rules ?? '')}
          >
            {t('rules.save')}
          </Button>
        </form>
      </SettingsCard>

      {isOwner && candidates.length > 0 ? (
        <SettingsCard title={t('guildSettings.transferTitle')}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (newOwner) transfer.mutate(newOwner)
            }}
          >
            <p className="text-sm text-muted">{t('guildSettings.transferHint')}</p>
            <label className="sr-only" htmlFor="new-owner">
              {t('guildSettings.transferTo')}
            </label>
            <select
              id="new-owner"
              value={newOwner}
              onChange={(event) => setNewOwner(event.target.value)}
              className="rounded-md border border-border bg-rail px-3 py-2"
            >
              <option value="">{t('guildSettings.transferChoose')}</option>
              {candidates.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.displayName ?? member.user.username}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              variant="secondary"
              className="sm:w-auto sm:self-start"
              pending={transfer.isPending}
              disabled={!newOwner}
            >
              {t('guildSettings.transfer')}
            </Button>
          </form>
        </SettingsCard>
      ) : null}

      {isOwner ? (
        <SettingsCard title={t('guildSettings.deleteTitle')}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (confirmName === guild.name) remove.mutate()
            }}
          >
            <p className="text-sm text-muted">{t('guildSettings.deleteHint')}</p>
            <TextField
              label={t('guildSettings.deleteConfirmLabel')}
              value={confirmName}
              placeholder={guild.name}
              onChange={(event) => setConfirmName(event.target.value)}
            />
            <Button
              type="submit"
              variant="danger"
              className="sm:w-auto sm:self-start"
              pending={remove.isPending}
              disabled={confirmName !== guild.name}
            >
              {t('guildSettings.delete')}
            </Button>
          </form>
        </SettingsCard>
      ) : null}
    </SettingsSection>
  )
}
