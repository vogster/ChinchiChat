import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '../../components/ui/switch'
import { setVoicePreferences, useVoicePreferences } from '../voice/voice-preferences'

import type { VoicePreferences } from '../voice/voice-preferences'

type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'

const KINDS: readonly {
  readonly kind: DeviceKind
  readonly key: 'audioInput' | 'audioOutput' | 'videoInput'
  readonly label: 'microphone' | 'speakers' | 'camera'
}[] = [
  { kind: 'audioinput', key: 'audioInput', label: 'microphone' },
  { kind: 'audiooutput', key: 'audioOutput', label: 'speakers' },
  { kind: 'videoinput', key: 'videoInput', label: 'camera' },
]

/** The browser's devices, refreshed when something is plugged in or out. */
const useDevices = () => {
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[] | null>(null)
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices)

  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!media) return
    let active = true
    const load = () =>
      media.enumerateDevices().then(
        (list) => active && setDevices(list),
        () => active && setDevices([]),
      )
    void load()
    media.addEventListener('devicechange', load)
    return () => {
      active = false
      media.removeEventListener('devicechange', load)
    }
  }, [])

  return { supported, devices: devices ?? [] }
}

export const VoiceDevices = () => {
  const { t } = useTranslation()
  const preferences = useVoicePreferences()
  const { supported, devices } = useDevices()

  const set = (change: Partial<VoicePreferences>) => setVoicePreferences(change)

  return (
    <div className="flex flex-col gap-4">
      {supported ? (
        KINDS.map(({ kind, key, label }) => {
          const options = devices.filter((device) => device.kind === kind && device.deviceId)
          const id = `voice-${kind}`
          return (
            <div key={kind} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-sm font-medium">
                {t(`settings.voice.${label}`)}
              </label>
              <select
                id={id}
                value={preferences[key] ?? ''}
                onChange={(event) => set({ [key]: event.target.value || null })}
                className="rounded-md border border-line bg-rail px-3 py-2"
              >
                <option value="">{t('settings.voice.default')}</option>
                {options.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {/* Labels stay empty until the site has been allowed the device once. */}
                    {device.label || t(`settings.voice.${label}Numbered`, { number: index + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )
        })
      ) : (
        <p className="text-sm text-muted">{t('settings.voice.noDevices')}</p>
      )}
      <Switch
        checked={preferences.noiseSuppression}
        onCheckedChange={(noiseSuppression) => set({ noiseSuppression })}
        label={t('settings.voice.noiseSuppression')}
        description={t('settings.voice.noiseSuppressionHint')}
      />
    </div>
  )
}
