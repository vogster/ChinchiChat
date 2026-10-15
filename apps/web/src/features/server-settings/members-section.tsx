import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { membersQueryOptions } from '../guilds/queries'
import { memberColor, sortRoles, toHexColor } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { SettingsCard, SettingsSection } from '../settings/settings-section'
import { useRoleActions } from './use-role-actions'

import type { GuildDetail, Member, Role } from '@chinchi/shared'

interface MemberRowProps {
  readonly member: Member
  readonly roles: readonly Role[]
  readonly canManage: (role: Role) => boolean
  readonly onAdd: (roleId: string) => void
  readonly onRemove: (roleId: string) => void
}

const MemberRow = ({ member, roles, canManage, onAdd, onRemove }: MemberRowProps) => {
  const { t } = useTranslation()
  const name = member.user.displayName ?? member.user.username
  const held = roles.filter((role) => member.roleIds.includes(role.id))
  const addable = roles.filter((role) => !member.roleIds.includes(role.id) && canManage(role))
  const color = memberColor(roles, member.roleIds)

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p
          className="truncate font-medium"
          style={color ? { color: toHexColor(color) } : undefined}
        >
          {name}
        </p>
        <p className="truncate text-sm text-muted">@{member.user.username}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ul aria-label={t('serverSettings.members.roles', { name })} className="contents">
          {held.length === 0 ? (
            <li className="text-sm text-muted">{t('serverSettings.members.noRoles')}</li>
          ) : null}
          {held.map((role) => (
            <li
              key={role.id}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm"
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-muted"
                style={role.color ? { backgroundColor: toHexColor(role.color) } : undefined}
              />
              {role.name}
              {canManage(role) ? (
                <button
                  type="button"
                  aria-label={t('serverSettings.members.removeRole', { role: role.name, name })}
                  onClick={() => onRemove(role.id)}
                  className="rounded-full text-muted hover:text-text"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {addable.length > 0 ? (
          <select
            aria-label={t('serverSettings.members.addRoleFor', { name })}
            value=""
            onChange={(event) => event.target.value && onAdd(event.target.value)}
            className="rounded-md border border-border bg-rail px-2 py-1 text-sm"
          >
            <option value="">{t('serverSettings.members.addRole')}</option>
            {addable.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </li>
  )
}

/** Every member with their roles; roles below the user's highest can be added or removed. */
export const MembersSection = ({ guild }: { guild: GuildDetail }) => {
  const { t } = useTranslation()
  const api = useApi()
  const permissions = useGuildPermissions(guild)
  const actions = useRoleActions(guild.id)
  const { data: members = [] } = useQuery(membersQueryOptions(api, guild.id))
  // @everyone belongs to everybody implicitly and is never assigned.
  const roles = sortRoles(guild.roles.filter((role) => role.id !== guild.id))
  const error = actions.assign.error ?? actions.unassign.error

  return (
    <SettingsSection title={t('serverSettings.members.title')}>
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <SettingsCard>
        <ul className="flex flex-col divide-y divide-border">
          {members.map((member) => (
            <MemberRow
              key={member.user.id}
              member={member}
              roles={roles}
              canManage={permissions.canManageRole}
              onAdd={(roleId) => actions.assign.mutate({ userId: member.user.id, roleId })}
              onRemove={(roleId) => actions.unassign.mutate({ userId: member.user.id, roleId })}
            />
          ))}
        </ul>
      </SettingsCard>
    </SettingsSection>
  )
}
