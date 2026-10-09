import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { fill, format, SEPARATOR, type Usage } from './format.ts'

const line = atom({ plugin: 'usage-line', key: 'line' } as const, null)

async function draw($: EngineInterface, usage: Usage | undefined) {
  if (usage === undefined) return
  const text = format(usage, await $.clock.now())
  await update($, line, () => text)
}

// The auto-compaction threshold, as /context reads it (a local estimate, no API call).
async function compactAt($: EngineInterface) {
  const { breakdown } = (await $.session.usage({ breakdown: 'summary' })).context
  return breakdown?.isAutoCompactEnabled ? breakdown.autoCompactThreshold : undefined
}

export const register: Register = on => {
  let last: Usage | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Clears the pinned line an earlier version of this mod left.
    $.ui.status(undefined)
    const [usage, model, threshold] = await Promise.all([$.session.usage(), $.session.model(), compactAt($)])
    last = { ...usage, model, compactAt: threshold }
    await draw($, last)
    // Keep the reset countdowns current while the session sits idle.
    $.clock.every(60_000, () => void draw($, last))

    return result
  })

  // Every model request of a turn, so the line moves while the turn is still running.
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)

    try {
      const now = await $.session.usage()
      const isMain = e.agentId === undefined
      // A subagent's request fills its own window, not this session's; the limits are the account's.
      const context =
        isMain && step.usage !== null ? fill(step.usage, now.context.window) : (last?.context ?? now.context)
      // The request's own model and effort: what /model and /effort resolved to, fallbacks included.
      const model = isMain ? e.model : last?.model
      const effort = isMain ? e.effort : last?.effort
      last = { ...last, context, rateLimits: now.rateLimits, model, effort }
      await draw($, last)
    } catch {
      // The line is a convenience; never let it break the turn.
    }

    return step
  })

  on('session.measure', async ($, e, next) => {
    // Once a turn: picks up an /autocompact change.
    last = { ...last, context: e.context, rateLimits: e.rateLimits, compactAt: await compactAt($) }
    await draw($, last)

    return next(e)
  })

  // A row of its own under the engine's hint line below the prompt, with no plugin label; a
  // narrow terminal wraps it between segments rather than cutting it off. (The band above the
  // prompt sits over the prompt's top margin, which leaves a blank row between them.)
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = await read($, line)
    const hint = await next(e)
    if (text === null) return hint

    const { Box, Text } = $.ui.resolve(e)
    const [first, ...rest] = text.split(SEPARATOR)

    return (
      <Box flexDirection="column">
        {hint}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text dimColor>{first}</Text>
          {rest.map(segment => (
            <Text dimColor>{`· ${segment}`}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
