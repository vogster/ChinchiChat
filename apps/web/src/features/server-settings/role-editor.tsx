import { parsePermissions, ROLE_NAME_MAX_LENGTH, serializePermissions } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { SettingsCard } from '../settings/settings-section'
import { RoleColorPicker } from './role-color-picker'
import { RolePermissionList } from './role-permission-list'
import { useRoleActions } from './use-role-actions'

import type { GuildPermissions } from '../permissions/use-guild-permissions'
import type { Role, UpdateRoleRequest } from '@chinchi/shared'

export interface RoleEditorProps {
  readonly role: Role
  readonly permissions: GuildPermissions
  readonly onDeleted: () => void
}

interface Draft {
  readonly name: string
  readonly color: number
  readonly hoist: boolean
  readonly mentionable: boolean
  readonly permissions: bigint
}

const draftOf = (role: Role): Draft => ({
  name: role.name,
  color: role.color,
  hoist: role.hoist,
  mentionable: role.mentionable,
  permissions: parsePermissions(role.permissions),
})

/** Only the fields that differ from the saved role. */
const changesOf = (role: Role, draft: Draft): Partial<UpdateRoleRequest> => {
  const saved = draftOf(role)
  return {
    ...(draft.name.trim() !== saved.name ? { name: draft.name.trim() } : {}),
    ...(draft.color !== saved.color ? { color: draft.color } : {}),
    ...(draft.hoist !== saved.hoist ? { hoist: draft.hoist } : {}),
    ...(draft.mentionable !== saved.mentionable ? { mentionable: draft.mentionable } : {}),
    ...(draft.permissions !== saved.permissions
      ? { permissions: serializePermissions(draft.permissions) }
      : {}),
  }
}

/** Edits one role; the parent remounts it (key) when another role is selected. */
export const RoleEditor = ({ role, permissions, onDeleted }: RoleEditorProps) => {
  const { t } = useTranslation()
  const actions = useRoleActions(role.guildId)
  const [draft, setDraft] = useState(() => draftOf(role))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const isEveryone = role.id === role.guildId
  const locked = !permissions.canManageRole(role)
  const changes = changesOf(role, draft)
  const dirty = Object.keys(changes).length > 0
  const error = actions.update.error ?? actions.remove.error
  const edit = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <form
      aria-label={t('serverSettings.roles.edit', { name: role.name })}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (dirty && draft.name.trim()) actions.update.mutate({ roleId: role.id, body: changes })
      }}
    >
      {locked ? <Alert tone="error">{t('serverSettings.roles.locked')}</Alert> : null}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      {actions.update.isSuccess && !dirty ? (
        <Alert tone="success">{t('serverSettings.roles.saved')}</Alert>
      ) : null}

      <SettingsCard>
        <div className="flex flex-col gap-4">
          {isEveryone ? (
            <p className="text-sm text-muted">{t('serverSettings.roles.everyoneHint')}</p>
          ) : (
            <>
              <TextField
                label={t('serverSettings.roles.name')}
                value={draft.name}
                maxLength={ROLE_NAME_MAX_LENGTH}
                disabled={locked}
                onChange={(event) => edit({ name: event.target.value })}
              />
              <RoleColorPicker
                value={draft.color}
                disabled={locked}
                onChange={(color) => edit({ color })}
              />
              <div className="flex flex-col divide-y divide-line">
                <Switch
                  checked={draft.hoist}
                  disabled={locked}
                  label={t('serverSettings.roles.hoist')}
                  onCheckedChange={(hoist) => edit({ hoist })}
                />
                <Switch
                  checked={draft.mentionable}
                  disabled={locked}
                  label={t('serverSettings.roles.mentionable')}
                  onCheckedChange={(mentionable) => edit({ mentionable })}
                />
              </div>
            </>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title={t('serverSettings.roles.permissions')}>
        <RolePermissionList
          value={draft.permissions}
          grantable={permissions.grantable}
          disabled={locked}
          onChange={(value) => edit({ permissions: value })}
        />
      </SettingsCard>

      <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-lg border border-line bg-side p-3 shadow-lg">
        <Button
          type="submit"
          fullWidth={false}
          pending={actions.update.isPending}
          disabled={locked || !dirty || !draft.name.trim()}
        >
          {t('serverSettings.roles.save')}
        </Button>
        {dirty ? (
          <Button variant="secondary" fullWidth={false} onClick={() => setDraft(draftOf(role))}>
            {t('serverSettings.roles.reset')}
          </Button>
        ) : null}
        {isEveryone || locked ? null : confirmingDelete ? (
          <div className="flex w-full flex-col gap-2">
            <p className="text-sm">
              {t('serverSettings.roles.confirmDelete', { name: role.name })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth={false}
                onClick={() => setConfirmingDelete(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                fullWidth={false}
                pending={actions.remove.isPending}
                onClick={() => actions.remove.mutate(role.id, { onSuccess: onDeleted })}
              >
                {t('serverSettings.roles.delete')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="danger"
            fullWidth={false}
            className="sm:ml-auto"
            onClick={() => setConfirmingDelete(true)}
          >
            {t('serverSettings.roles.delete')}
          </Button>
        )}
      </div>
    </form>
  )
}
