import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'

import type { SafetyControls } from './use-safety'

/** A new device appeared for someone here (or on my account): say so until acknowledged. */
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
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5 text-body">
        <div className="flex flex-col gap-1">
          {people.map((person) => (
            <div key={person.userId}>
              {person.keyChanged ? (
                <p>{t('e2ee.safety.keyChanged', { name: nameOf(person.userId) })}</p>
              ) : null}
              {person.newDevices.length > 0 ? (
                <p>
                  {t('e2ee.safety.newDevice', {
                    name: nameOf(person.userId),
                    devices: names(person.newDevices),
                  })}
                </p>
              ) : null}
            </div>
          ))}
          {status.mine.length > 0 ? (
            <p>{t('e2ee.safety.newOwnDevice', { devices: names(status.mine) })}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {people.length > 0 ? (
            <Button fullWidth={false} onClick={onCheck}>
              {t('e2ee.safety.check')}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={() =>
              void safety.acknowledge([
                ...people.map((person) => person.userId),
                ...(status.mine.length > 0 ? [myId] : []),
              ])
            }
          >
            {t('e2ee.safety.gotIt')}
          </Button>
        </div>
      </div>
    </div>
  )
}
