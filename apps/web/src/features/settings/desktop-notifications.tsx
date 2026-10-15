import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Switch } from '../../components/ui/switch'
import {
  desktopPermission,
  readDesktopNotifications,
  setDesktopNotifications,
} from '../notifications/desktop-preference'

/** Turns desktop notifications on for this browser, asking for its permission first. */
export const DesktopNotifications = () => {
  const { t } = useTranslation()
  const [permission, setPermission] = useState(desktopPermission)
  const [enabled, setEnabled] = useState(readDesktopNotifications)

  const toggle = async (next: boolean) => {
    if (next && permission !== 'granted') {
      const answer = await Notification.requestPermission()
      setPermission(answer)
      if (answer !== 'granted') return
    }
    setDesktopNotifications(next)
    setEnabled(next)
  }

  if (permission === 'unsupported') {
    return <p className="text-sm text-muted">{t('notifications.desktop.unsupported')}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label={t('notifications.desktop.toggle')}
        description={t('notifications.desktop.hint')}
        checked={enabled && permission === 'granted'}
        disabled={permission === 'denied'}
        onCheckedChange={(next) => void toggle(next)}
      />
      {permission === 'denied' ? (
        <Alert tone="error">{t('notifications.desktop.denied')}</Alert>
      ) : null}
    </div>
  )
}
