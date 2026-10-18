import { ALL_PERMISSIONS, has, Permission } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { Shield, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { useApi } from '../../../lib/api-context'
import { errorMessage } from '../../../lib/errors'
import { channelPermissionGroups } from '../../permissions/permission-groups'
import { sortRoles } from '../../permissions/permissions'
import { useGuildPermissions } from '../../permissions/use-guild-permissions'
import { membersQueryOptions } from '../queries'
import {
  draftOf,
  EMPTY_DRAFT,
  sameDraft,
  sameOverwrites,
  stateOf,
  withState,
} from './overwrite-draft'
import { TriStatePermission } from './tri-state-permission'
import { useOverwriteActions } from './use-overwrite-actions'

import type { OverwriteTarget } from './use-overwrite-actions'
import type { Channel, GuildDetail } from '@chinchi/shared'

export interface ChannelPermissionsTabProps {
  readonly guild: GuildDetail
  readonly channel: Channel
}

/** Per-role and per-member overwrites of one channel, edited one target at a time. */
export const ChannelPermissionsTab = ({ guild, channel }: ChannelPermissionsTabProps) => {
  const { t } = useTranslation()
  const api = useApi()
  const permissions = useGuildPermissions(guild)
  const { data: members = [] } = useQuery(membersQueryOptions(api, guild.id))
  const actions = useOverwriteActions(channel)

  const everyone: OverwriteTarget = { id: guild.id, type: 'role' }
  const [added, setAdded] = useState<readonly OverwriteTarget[]>([])
  const [selected, setSelected] = useState<OverwriteTarget>(everyone)
  const saved = channel.permissionOverwrites.find((o) => o.targetId === selected.id)
  const [draft, setDraft] = useState(() => draftOf(saved))

  const grantable =
    permissions.grantable === ALL_PERMISSIONS ? ALL_PERMISSIONS : permissions.inChannel(channel)
  const roleName = (id: string) => guild.roles.find((r) => r.id === id)?.name ?? id
  const memberName = (id: string) => {
    const user = members.find((m) => m.user.id === id)?.user
    return user ? (user.displayName ?? user.username) : id
  }
  const nameOf = (target: OverwriteTarget) =>
    target.type === 'role' ? roleName(target.id) : memberName(target.id)

  const listed: OverwriteTarget[] = [
    everyone,
    ...channel.permissionOverwrites
      .filter((o) => o.targetId !== guild.id)
      .map((o) => ({ id: o.targetId, type: o.targetType })),
    ...added.filter((a) => !channel.permissionOverwrites.some((o) => o.targetId === a.id)),
  ]
  const isListed = (id: string) => listed.some((target) => target.id === id)
  const roleOptions = sortRoles(guild.roles).filter((role) => !isListed(role.id))
  const memberOptions = members.filter((member) => !isListed(member.user.id))

  const select = (target: OverwriteTarget) => {
    setSelected(target)
    setDraft(draftOf(channel.permissionOverwrites.find((o) => o.targetId === target.id)))
    actions.save.reset()
  }
  const dirty = !sameDraft(draft, draftOf(saved))
  const error = actions.save.error ?? actions.reset.error ?? actions.sync.error
  const category = guild.channels.find((c) => c.id === channel.parentId)
  const synced = category
    ? sameOverwrites(category.permissionOverwrites, channel.permissionOverwrites)
    : true

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('channelPermissions.subtitle')}</p>
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      {category && channel.type !== 'thread' ? (
        <div className="flex items-center gap-3 rounded-md bg-side px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 text-muted">
            {t(synced ? 'channelPermissions.synced' : 'channelPermissions.notSynced', {
              name: category.name,
            })}
          </p>
          {synced ? null : (
            <Button
              variant="secondary"
              fullWidth={false}
              pending={actions.sync.isPending}
              onClick={() => actions.sync.mutate()}
            >
              {t('channelPermissions.sync')}
            </Button>
          )}
        </div>
      ) : null}
      {actions.save.isSuccess && !dirty ? (
        <Alert tone="success">{t('channelPermissions.saved')}</Alert>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-2 sm:w-48 sm:shrink-0">
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            {t('channelPermissions.targets')}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {listed.map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  aria-current={target.id === selected.id || undefined}
                  onClick={() => select(target)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-chip aria-[current]:bg-chip aria-[current]:font-medium"
                >
                  {target.type === 'role' ? (
                    <Shield aria-hidden className="size-4 shrink-0" />
                  ) : (
                    <User aria-hidden className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{nameOf(target)}</span>
                </button>
              </li>
            ))}
          </ul>
          {roleOptions.length + memberOptions.length > 0 ? (
            <select
              aria-label={t('channelPermissions.add')}
              value=""
              onChange={(event) => {
                const [type, id] = event.target.value.split(':') as ['role' | 'member', string]
                if (!id) return
                const target = { id, type }
                setAdded((current) => [...current, target])
                select(target)
              }}
              className="rounded-md border border-line bg-rail px-2 py-1.5 text-sm"
            >
              <option value="">{t('channelPermissions.add')}</option>
              {roleOptions.length > 0 ? (
                <optgroup label={t('channelPermissions.rolesGroup')}>
                  {roleOptions.map((role) => (
                    <option key={role.id} value={`role:${role.id}`}>
                      {role.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {memberOptions.length > 0 ? (
                <optgroup label={t('channelPermissions.membersGroup')}>
                  {memberOptions.map((member) => (
                    <option key={member.user.id} value={`member:${member.user.id}`}>
                      {member.user.displayName ?? member.user.username}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          ) : null}
        </div>

        <form
          aria-label={nameOf(selected)}
          className="flex min-w-0 flex-1 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            actions.save.mutate({ target: selected, draft })
          }}
        >
          {channelPermissionGroups(channel.type).map((group) => (
            <fieldset key={group.key} className="flex flex-col divide-y divide-line">
              <legend className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">
                {t(`permissions.groups.${group.key}`)}
              </legend>
              {group.permissions.map((name) => {
                const flag = Permission[name]
                return (
                  <TriStatePermission
                    key={name}
                    label={t(`permissions.${name}.name`)}
                    description={t(`permissions.${name}.description`)}
                    value={stateOf(draft, flag)}
                    disabled={!has(grantable, flag)}
                    onChange={(state) => setDraft((current) => withState(current, flag, state))}
                  />
                )
              })}
            </fieldset>
          ))}

          <div className="sticky bottom-0 flex flex-wrap gap-2 bg-main pt-3">
            <Button
              type="submit"
              fullWidth={false}
              pending={actions.save.isPending}
              disabled={!dirty}
            >
              {t('channelPermissions.save')}
            </Button>
            {saved ? (
              <Button
                variant="secondary"
                fullWidth={false}
                aria-label={t('channelPermissions.remove', { name: nameOf(selected) })}
                pending={actions.reset.isPending}
                onClick={() =>
                  actions.reset.mutate(selected, {
                    onSuccess: (_result, target) => {
                      setAdded((current) => current.filter((a) => a.id !== target.id))
                      setSelected(everyone)
                      setDraft(
                        target.id === guild.id
                          ? EMPTY_DRAFT
                          : draftOf(
                              channel.permissionOverwrites.find((o) => o.targetId === guild.id),
                            ),
                      )
                    },
                  })
                }
              >
                {t('channelPermissions.reset')}
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
