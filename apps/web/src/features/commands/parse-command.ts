import type { Command } from '@chinchi/shared'

export interface ParsedCommand {
  readonly command: Command
  readonly options: Record<string, string>
  /** Required options the text leaves out. */
  readonly missing: readonly string[]
}

/** Commands whose name starts with what is typed after `/` (before any space). */
export const suggestCommands = (value: string, commands: readonly Command[]): Command[] => {
  const typed = /^\/([a-z0-9_-]*)$/.exec(value)?.[1]
  if (typed === undefined) return []
  return commands.filter((command) => command.name.startsWith(typed))
}

/**
 * `/name a b c`: option values in order, the last option taking the rest of the text.
 * Null when the text isn't one of the commands, so it goes out as an ordinary message.
 */
export const parseCommand = (value: string, commands: readonly Command[]): ParsedCommand | null => {
  const match = /^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(value.trim())
  const command = match && commands.find((c) => c.name === match[1])
  if (!command) return null
  let rest = match[2]?.trim() ?? ''
  const options: Record<string, string> = {}
  command.options.forEach((option, index) => {
    if (!rest) return
    if (index === command.options.length - 1) {
      options[option.name] = rest
      rest = ''
      return
    }
    const [word = '', tail = ''] = rest.split(/\s+([\s\S]*)/)
    options[option.name] = word
    rest = tail
  })
  const missing = command.options.filter((o) => o.required && !options[o.name]).map((o) => o.name)
  return { command, options, missing }
}
