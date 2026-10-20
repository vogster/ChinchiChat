import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { formatRelativeTime } from '../../lib/relative-time'
import { DeviceCodeText } from './device-code'
import { useDeviceCode } from './use-device-code'

import type { SafetyControls } from './use-safety'
import type { Device } from '@chinchi/shared'

/** One device of someone waiting to be let in: what it is, its code, and the button. */
const WaitingDevice = ({
  device,
  name,
  onLetIn,
}: {
  device: Device
  name: string
  onLetIn: () => void
}) => {
  const { t, i18n } = useTranslation()
  const code = useDeviceCode(device.signaturePublicKey)
  return (
    <div className="flex flex-col gap-1.5">
      <p>
        {t('e2ee.safety.waitingDevice', {
          name,
          device: device.name,
          time: formatRelativeTime(device.createdAt, i18n.language),
        })}
      </p>
      {code ? (
        <p className="text-muted">
          {t('e2ee.device.code')} <DeviceCodeText code={code} className="text-body" />
        </p>
      ) : null}
      <p className="text-xs text-faint">{t('e2ee.safety.compareDeviceCode', { name })}</p>
      <div>
        <Button
          fullWidth={false}
          aria-label={t('e2ee.safety.letInLabel', { device: device.name, name })}
          onClick={onLetIn}
        >
          {t('e2ee.safety.letIn')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Someone here has a device nobody let in yet, or a new user key; or my own account has a
 * device I did not approve. Others' devices wait for this person's consent; mine are only
 * pointed out (I approve them myself, from a device that holds the key).
 */
export const SafetyWarning = ({
  safety,
  myId,
  nameOf,
  onCheck,
}: {
  safety: SafetyControls
  myId: string
  nameOf: (userId: string) => string
  onCheck: () => void
}) => {
  const { t } = useTranslation()
  const { status } = safety
  if (!status) return null
  const people = status.people.filter((person) => person.newDevices.length > 0 || person.keyChanged)
  if (people.length === 0 && status.mine.length === 0) return null
  const names = (devices: readonly { name: string }[]) => devices.map((d) => d.name).join(', ')

  return (
    <div
      role="alert"
      aria-label={t('e2ee.safety.newDevicesLabel')}
      className="mx-4 mt-2 flex items-start gap-3.5 rounded-[24px] bg-stage p-4 text-sm"
    >
      <span
        aria-hidden
        className="grid size-[42px] shrink-0 place-items-center rounded-[15px] bg-danger-soft text-danger"
      >
        <ShieldAlert className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-0.5 text-body">
        {people.map((person) => {
          const name = nameOf(person.userId)
          return (
            <div key={person.userId} className="flex flex-col gap-3">
              {person.keyChanged ? (
                <div className="flex flex-col gap-2">
                  <p>{t('e2ee.safety.keyChanged', { name })}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button fullWidth={false} onClick={onCheck}>
                      {t('e2ee.safety.check')}
                    </Button>
                    <Button
                      variant="secondary"
                      fullWidth={false}
                      aria-label={t('e2ee.safety.acceptKeyLabel', { name })}
                      onClick={() => void safety.acceptKey(person.userId)}
                    >
                      {t('e2ee.safety.acceptKey')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {person.newDevices.map((device) => (
                <WaitingDevice
                  key={device.id}
                  device={device}
                  name={name}
                  onLetIn={() => void safety.acceptDevice(person.userId, device.id)}
                />
              ))}
            </div>
          )
        })}
        {status.mine.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p>{t('e2ee.safety.newOwnDevice', { devices: names(status.mine) })}</p>
            <div>
              <Button
                variant="secondary"
                fullWidth={false}
                onClick={() => void safety.acknowledge([myId])}
              >
                {t('e2ee.safety.gotIt')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
