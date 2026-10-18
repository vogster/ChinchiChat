import { ChevronDown, ChevronUp, Plus, Shield } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { dropTargetClass, useDragSort } from '../../lib/use-drag-sort'
import { sortRoles, toHexColor } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { SettingsSection } from '../settings/settings-section'
import { RoleEditor } from './role-editor'
import { planRoleMove } from './role-order'
import { useRoleActions } from './use-role-actions'

import type { GuildDetail, Role } from '@chinchi/shared'

const iconButton =
  'rounded p-1 text-muted hover:bg-chip hover:text-text disabled:pointer-events-none disabled:opacity-30'

/** Role list (highest first) next to the editor of the selected role. */
export const RolesSection = ({ guild }: { guild: GuildDetail }) => {
  const { t } = useTranslation()
  const permissions = useGuildPermissions(guild)
  const actions = useRoleActions(guild.id)
  const roles = sortRoles(guild.roles)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = roles.find((role) => role.id === selectedId)
  const error = actions.create.error ?? actions.reorder.error

  // Neighbours below @everyone (position 0) or outside the user's reach cannot be swapped.
  const movable = (role: Role | undefined): role is Role =>
    role !== undefined && role.id !== guild.id && permissions.canManageRole(role)
  const move = (draggedId: string, targetId: string) => {
    const items = planRoleMove(roles, draggedId, targetId, movable)
    if (items.length > 0) actions.reorder.mutate(items)
  }
  const sort = useDragSort({
    onDrop: move,
    onStep: (id, step) => {
      const neighbour = roles[roles.findIndex((role) => role.id === id) + step]
      if (neighbour) move(id, neighbour.id)
    },
  })

  return (
    <SettingsSection
      title={t('serverSettings.roles.title')}
      subtitle={t('serverSettings.roles.subtitle')}
    >
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}

      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-start">
        <div className="flex flex-col gap-3 @3xl:w-64 @3xl:shrink-0">
          <Button
            pending={actions.create.isPending}
            onClick={() =>
              actions.create.mutate(undefined, { onSuccess: ({ role }) => setSelectedId(role.id) })
            }
          >
            <span className="inline-flex items-center gap-2">
              <Plus aria-hidden className="size-4" />
              {t('serverSettings.roles.create')}
            </span>
          </Button>

          <ul aria-label={t('serverSettings.roles.title')} className="flex flex-col gap-0.5">
            {roles.map((role, index) => {
              const above = roles[index - 1]
              const below = roles[index + 1]
              const canMove = movable(role)
              return (
                <li
                  key={role.id}
                  {...sort.itemProps(role.id, { draggable: canMove })}
                  className={`group flex items-center gap-1 ${dropTargetClass}`}
                >
                  <button
                    type="button"
                    aria-current={role.id === selectedId || undefined}
                    onClick={() => setSelectedId(role.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-chip aria-[current]:bg-chip aria-[current]:font-medium"
                  >
                    <Shield
                      aria-hidden
                      className="size-4 shrink-0"
                      style={{ color: role.color ? toHexColor(role.color) : undefined }}
                    />
                    <span className="truncate">{role.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('serverSettings.roles.moveUp', { name: role.name })}
                    disabled={!canMove || !movable(above) || actions.reorder.isPending}
                    onClick={() => above && move(role.id, above.id)}
                    className={iconButton}
                  >
                    <ChevronUp aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('serverSettings.roles.moveDown', { name: role.name })}
                    disabled={!canMove || !movable(below) || actions.reorder.isPending}
                    onClick={() => below && move(role.id, below.id)}
                    className={iconButton}
                  >
                    <ChevronDown aria-hidden className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <RoleEditor
              key={selected.id}
              role={selected}
              permissions={permissions}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className="text-muted">{t('serverSettings.roles.selectHint')}</p>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
