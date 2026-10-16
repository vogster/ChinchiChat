import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { TextField } from '../../components/ui/text-field'
import { useShellPreferences } from '../shell/use-shell-preferences'
import { SettingsCard } from './settings-section'

import type { Shell } from '../shell/shell'
import type { FormEvent } from 'react'

const Autostart = ({ shell }: { shell: Shell }) => {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void shell.autostart.isEnabled().then(
      (value) => alive && setEnabled(value),
      () => alive && setEnabled(false),
    )
    return () => {
      alive = false
    }
  }, [shell])

  const toggle = async (next: boolean) => {
    setEnabled(next)
    await shell.autostart.set(next).catch(() => setEnabled(!next))
  }

  return (
    <Switch
      label={t('settings.app.startup.autostart')}
      description={t('settings.app.startup.autostartHint')}
      checked={enabled ?? false}
      disabled={enabled === null}
      onCheckedChange={(next) => void toggle(next)}
    />
  )
}

const PushToTalkForm = ({
  shell,
  initial,
  onSave,
}: {
  shell: Shell
  initial: string | null
  onSave: (shortcut: string | null) => Promise<void>
}) => {
  const { t } = useTranslation()
  const [shortcut, setShortcut] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = shortcut.trim()
    setError(null)
    setSaved(false)
    if (value) {
      // Taken for a moment to prove it can be: a shortcut another app holds is refused here.
      try {
        const release = await shell.bindPushToTalk(value, () => undefined)
        await release()
      } catch {
        setError(t('settings.app.pushToTalk.invalid'))
        return
      }
    }
    await onSave(value || null)
    setSaved(true)
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
      <p className="text-sm text-muted">{t('settings.app.pushToTalk.hint')}</p>
      <TextField
        label={t('settings.app.pushToTalk.shortcut')}
        placeholder={shell.platform === 'macos' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V'}
        value={shortcut}
        spellCheck={false}
        onChange={(event) => setShortcut(event.target.value)}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">{t('settings.app.pushToTalk.saved')}</Alert> : null}
      <Button type="submit" fullWidth={false}>
        {t('settings.app.pushToTalk.save')}
      </Button>
    </form>
  )
}

/** Settings of the desktop app itself: autostart, the tray, push-to-talk, the instance. */
export const AppSettings = () => {
  const { t } = useTranslation()
  const { shell, preferences, save } = useShellPreferences()

  if (!shell || !preferences) return <p>{t('common.loading')}</p>

  return (
    <>
      <SettingsCard title={t('settings.app.startup.title')}>
        <Autostart shell={shell} />
        <Switch
          label={t('settings.app.startup.closeToTray')}
          description={t('settings.app.startup.closeToTrayHint')}
          checked={preferences.closeToTray}
          onCheckedChange={(next) => void save({ closeToTray: next })}
        />
      </SettingsCard>
      <SettingsCard title={t('settings.app.pushToTalk.title')}>
        <PushToTalkForm
          shell={shell}
          initial={preferences.pushToTalk}
          onSave={(pushToTalk) => save({ pushToTalk })}
        />
      </SettingsCard>
      <SettingsCard title={t('settings.app.instance.title')}>
        <p className="text-sm text-muted">{t('settings.app.instance.hint')}</p>
        <Button variant="secondary" fullWidth={false} onClick={() => void shell.changeInstance()}>
          {t('settings.app.instance.change')}
        </Button>
        <p className="text-xs text-muted">
          {t('settings.app.version', { version: shell.version })}
        </p>
      </SettingsCard>
    </>
  )
}
