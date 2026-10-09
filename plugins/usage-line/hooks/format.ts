import type { ModelUsage, SessionContextUsage, SessionRateLimit } from 'claude-code'

// Only the account-wide windows; model-specific ones (e.g. Fable) are skipped.
const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

export type Usage = {
  context: SessionContextUsage
  rateLimits: SessionRateLimit[]
  model?: string
  effort?: string | number
  // Tokens at which auto-compaction runs; the fill is measured against it when set.
  compactAt?: number
}

// The fill a response leaves, counted as the status line counts it: everything it was answered over.
export const fill = (usage: ModelUsage, window: number): SessionContextUsage => ({
  tokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
  window,
})

export const SEPARATOR = ' · '

const kilo = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

// `claude-opus-5-5[1m]` reads as `opus-5-5[1m]`.
const short = (model: string) => model.replace(/^claude-/, '')

export const until = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''

  const minutes = Math.max(0, Math.round((at - now) / 60000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60

  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`
}

export const format = ({ context, rateLimits, model, effort, compactAt }: Usage, now: number) => {
  const head = model === undefined ? [] : [effort === undefined ? short(model) : `${short(model)} ${effort}`]

  const limit = compactAt ?? context.window
  const ctx =
    context.tokens === undefined
      ? `ctx -/${kilo(limit)}`
      : `ctx ${Math.round((context.tokens / limit) * 100)}% ${kilo(context.tokens)}/${kilo(limit)}`

  const limits = rateLimits
    .filter(r => r.kind in WINDOWS)
    .map(r => {
      const reset = until(r.resetsAt, now)
      return `${WINDOWS[r.kind]} ${r.percentUsed}%${reset ? ` ↻${reset}` : ''}`
    })

  return [...head, ctx, ...limits].join(SEPARATOR)
}
