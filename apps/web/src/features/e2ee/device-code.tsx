import { useTranslation } from 'react-i18next'

/** "48213901773526011849" → "48213 90177 35260 11849": groups of five, as people read them. */
const grouped = (code: string) => code.match(/\d{1,5}/g)?.join(' ') ?? code

/** A device's code, read aloud to its owner's contact before they let the device in. */
export const DeviceCodeText = ({ code, className = '' }: { code: string; className?: string }) => {
  const { t } = useTranslation()
  return (
    <span
      title={t('e2ee.device.codeHint')}
      className={`font-mono tabular-nums tracking-wide [word-spacing:0.25em] ${className}`}
    >
      {grouped(code)}
    </span>
  )
}
