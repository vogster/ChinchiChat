import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DENSITIES,
  PALETTES,
  readDensity,
  readPalette,
  readTheme,
  setDensity,
  setPalette,
  setTheme,
  THEMES,
} from '../../lib/theme'
import { ChoiceGroup } from './choice-group'
import { ThemePreview } from './theme-preview'

import type { DensityChoice, PaletteChoice, ThemeChoice } from '../../lib/theme'

const focusRing = 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent'

export const ThemePicker = () => {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(readTheme)

  return (
    <ChoiceGroup legend={t('settings.appearance.theme')}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {THEMES.map((choice: ThemeChoice) => (
          <label
            key={choice}
            className={`group flex cursor-pointer flex-col gap-2.5 rounded-card bg-stage p-2.5 has-[:checked]:ring-2 has-[:checked]:ring-accent ${focusRing}`}
          >
            <input
              type="radio"
              name="theme"
              value={choice}
              checked={current === choice}
              onChange={() => {
                setTheme(choice)
                setCurrent(choice)
              }}
              className="sr-only"
            />
            <ThemePreview theme={choice} />
            <span className="flex items-center gap-2 px-1 pb-0.5 font-medium">
              <span
                aria-hidden
                className="size-[18px] shrink-0 rounded-full ring-2 ring-faint ring-inset group-has-[:checked]:ring-[5px] group-has-[:checked]:ring-accent"
              />
              {t(`settings.appearance.${choice}`)}
            </span>
          </label>
        ))}
      </div>
    </ChoiceGroup>
  )
}

export const PalettePicker = () => {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(readPalette)

  return (
    <ChoiceGroup legend={t('settings.appearance.palette')}>
      <div className="flex flex-wrap gap-2.5">
        {PALETTES.map((choice: PaletteChoice) => (
          <label
            key={choice}
            data-palette={choice}
            className={`flex h-12 cursor-pointer items-center gap-2.5 rounded-full bg-stage pr-4 pl-2 has-[:checked]:ring-2 has-[:checked]:ring-accent ${focusRing}`}
          >
            <input
              type="radio"
              name="palette"
              value={choice}
              checked={current === choice}
              onChange={() => {
                setPalette(choice)
                setCurrent(choice)
              }}
              className="sr-only"
            />
            <PaletteSwatch palette={choice} />
            <span className="font-medium">{t(`settings.appearance.palettes.${choice}`)}</span>
          </label>
        ))}
      </div>
    </ChoiceGroup>
  )
}

/** Two dots — the neutral and the accent — drawn in the palette they stand for. */
const PaletteSwatch = ({ palette }: { palette: PaletteChoice }) => (
  <span aria-hidden data-swatch={palette} className="flex">
    <span className="size-[30px] rounded-full border-2 border-stage bg-(--swatch-neutral)" />
    <span className="-ml-2.5 size-[30px] rounded-full border-2 border-stage bg-(--swatch-accent)" />
  </span>
)

export const DensityPicker = () => {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(readDensity)

  return (
    <ChoiceGroup legend={t('settings.appearance.density')}>
      <div className="inline-flex gap-1 self-start rounded-card bg-stage p-1">
        {DENSITIES.map((choice: DensityChoice) => (
          <label
            key={choice}
            className={`flex h-[38px] cursor-pointer items-center rounded-full px-[18px] font-medium text-muted has-[:checked]:bg-accent has-[:checked]:text-accent-contrast ${focusRing}`}
          >
            <input
              type="radio"
              name="density"
              value={choice}
              checked={current === choice}
              onChange={() => {
                setDensity(choice)
                setCurrent(choice)
              }}
              className="sr-only"
            />
            {t(`settings.appearance.densities.${choice}`)}
          </label>
        ))}
      </div>
    </ChoiceGroup>
  )
}
