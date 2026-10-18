import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { formatRelativeTime } from '../../lib/relative-time'
import { useAnyE2eeClient, useThisDeviceId } from '../e2ee/e2ee-context'

const devicesKey = ['e2eeDevices'] as const
const strictKey = ['e2eeStrict'] as const

/**
 * Strict mode, a setting of this browser: encrypt only for devices vouched for by their
 * owner's key, or accepted here after a warning. Off, every device the server lists is
 * included, and unapproved ones are only pointed out.
 */
const StrictModeSwitch = () => {
  const { t } = useTranslation()
  const client = useAnyE2eeClient()
  const queryClient = useQueryClient()
  const { data: enabled = false } = useQuery({
    queryKey: strictKey,
    queryFn: () => (client ? client.strict.enabled() : false),
    enabled: client !== null,
  })
  const toggle = useMutation({
    mutationFn: (on: boolean) => (client ? client.strict.set(on) : Promise.resolve()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: strictKey }),
  })
  return (
    <div className="rounded-lg bg-side px-4">
      <Switch
        checked={enabled}
        onCheckedChange={(on) => toggle.mutate(on)}
        disabled={client === null || toggle.isPending}
        label={t('settings.encryptionDevices.strict')}
        description={t('settings.encryptionDevices.strictHint')}
      />
    </div>
  )
}

/**
 * The browsers that hold my encryption keys. One I don't recognise is removed here: it is left
 * out of every encrypted conversation from the next message on.
 */
export const EncryptionDevices = () => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const { data: devices = [] } = useQuery({
    queryKey: devicesKey,
    queryFn: async () => (await api.e2ee.myDevices()).devices,
  })
  const thisDevice = useThisDeviceId()
  const remove = useMutation({
    mutationFn: (deviceId: string) => api.e2ee.deleteDevice(deviceId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKey, exact: true }),
  })
  const active = devices.filter((device) => !device.revokedAt)

  return (
    <div className="flex flex-col gap-4">
      {remove.error ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
      <StrictModeSwitch />
      <ul
        aria-label={t('settings.encryptionDevices.title')}
        className="divide-y divide-line rounded-lg bg-side px-4"
      >
        {active.map((device) => (
          <li key={device.id} aria-label={device.name} className="flex items-center gap-3 py-3">
            <KeyRound aria-hidden className="size-6 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{device.name}</span>
                {device.id === thisDevice ? (
                  <span className="rounded-full bg-secure-soft px-2 py-0.5 text-[11px] font-semibold text-secure-text">
                    {t('settings.sessions.current')}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted">
                {t('settings.encryptionDevices.added', {
                  time: formatRelativeTime(device.createdAt, i18n.language),
                })}
              </div>
            </div>
            {/* Not before this browser is known: removing its own keys by mistake is easy. */}
            {thisDevice === null || device.id === thisDevice ? null : (
              <Button
                variant="link"
                aria-label={t('settings.encryptionDevices.removeLabel', { name: device.name })}
                pending={remove.isPending && remove.variables === device.id}
                onClick={() => remove.mutate(device.id)}
              >
                {t('settings.encryptionDevices.remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
