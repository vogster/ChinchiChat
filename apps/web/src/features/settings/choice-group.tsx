import type { ReactNode } from 'react'

/** A labelled set of radio choices, titled like the other groups of the settings. */
export const ChoiceGroup = ({ legend, children }: { legend: string; children: ReactNode }) => (
  <fieldset className="flex flex-col">
    <legend className="px-1.5 pb-2 text-[12.5px] font-medium text-faint">{legend}</legend>
    {children}
  </fieldset>
)
