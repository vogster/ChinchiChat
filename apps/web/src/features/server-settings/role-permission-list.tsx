import { has, Permission } from '@chinchi/shared'
import { useTranslation } from 'react-i18next'

import { Switch } from '../../components/ui/switch'
import { PERMISSION_GROUPS } from '../permissions/permission-groups'

export interface RolePermissionListProps {
  readonly value: bigint
  readonly onChange: (value: bigint) => void
  /** Bits the editor may turn on; bits already set can always be turned off. */
  readonly grantable: bigint
  readonly disabled: boolean
}

/** Every permission as a switch, grouped like Discord's role editor. */
export const RolePermissionList = ({
  value,
  onChange,
  grantable,
  disabled,
}: RolePermissionListProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.key} className="flex flex-col divide-y divide-line">
          <legend className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">
            {t(`permissions.groups.${group.key}`)}
          </legend>
          {group.permissions.map((name) => {
            const flag = Permission[name]
            const checked = has(value, flag)
            return (
              <Switch
                key={name}
                checked={checked}
                label={t(`permissions.${name}.name`)}
                description={t(`permissions.${name}.description`)}
                disabled={disabled || (!checked && !has(grantable, flag))}
                onCheckedChange={(on) => onChange(on ? value | flag : value & ~flag)}
              />
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}
