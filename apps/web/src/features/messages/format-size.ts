/** "117 КБ", "2,4 МБ": binary units, one decimal at most, in the interface language. */
export const formatFileSize = (bytes: number, locale: string): string => {
  const [value, unit] =
    bytes >= 1024 * 1024
      ? [bytes / (1024 * 1024), 'megabyte']
      : bytes >= 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes, 'byte']
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value)
}
