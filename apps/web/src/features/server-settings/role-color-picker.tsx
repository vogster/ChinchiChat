import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toHexColor } from '../permissions/permissions'

/** Discord-like preset colors; 0 means "no color". */
const ROLE_COLORS: readonly number[] = [
  0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22, 0xe74c3c, 0x95a5a6,
  0x607d8b,
]

export interface RoleColorPickerProps {
  readonly value: number
  readonly onChange: (color: number) => void
  readonly disabled: boolean
}

const swatch =
  'flex size-8 items-center justify-center rounded-md border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed'

export const RoleColorPicker = ({ value, onChange, disabled }: RoleColorPickerProps) => {
  const { t } = useTranslation()
  const options = [0, ...ROLE_COLORS]

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {t('serverSettings.roles.color')}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((color) => (
          <button
            key={color}
            type="button"
            disabled={disabled}
            aria-pressed={value === color}
            aria-label={color === 0 ? t('serverSettings.roles.noColor') : toHexColor(color)}
            onClick={() => onChange(color)}
            className={swatch}
            style={color === 0 ? undefined : { backgroundColor: toHexColor(color) }}
          >
            {value === color ? <Check aria-hidden className="size-4 text-white" /> : null}
          </button>
        ))}
        <input
          type="color"
          disabled={disabled}
          aria-label={t('serverSettings.roles.customColor')}
          value={toHexColor(value)}
          onChange={(event) => onChange(Number.parseInt(event.target.value.slice(1), 16))}
          className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent disabled:cursor-not-allowed"
        />
      </div>
    </fieldset>
  )
}
