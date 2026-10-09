import type { On, RenderElement, RenderNode, SessionContextBreakdown, SessionUsage } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

import { format, until } from '../hooks/format.ts'

const NOW = Date.parse('2026-10-09T10:00:00Z')

const HINT: RenderElement = { type: 'Text', props: {}, children: ['esc to interrupt'] }

// Stands for the engine's hint line.
const drawHint = (on: On) => on('ui.render', () => HINT)

const textOf = (node: RenderNode | undefined): string =>
  node === undefined || typeof node === 'string'
    ? (node ?? '')
    : 'children' in node && Array.isArray(node.children)
      ? node.children.map(textOf).join('')
      : ''

const draw = ($: Engine) =>
  $.ui.render({
    surface: 'terminal',
    component: 'PromptHint',
    requestId: 'hint',
    props: { isDraft: false, isWorking: false, hint: 'esc to interrupt' },
  })

// The row under the hint, its segments read back as one line; '' when the hint stands alone.
const lineOf = async ($: Engine) => {
  const tree = await draw($)
  if (tree === HINT) return ''
  const [hint, row] = 'children' in tree && Array.isArray(tree.children) ? tree.children : []
  expect(textOf(hint)).toBe('esc to interrupt')
  const segments = row !== undefined && typeof row !== 'string' && 'children' in row && Array.isArray(row.children) ? row.children : []
  return segments.map(textOf).join(' ')
}

// What session.usage answers: the breakdown, only when asked, carries the autocompact threshold.
const answer = (usage: SessionUsage, threshold: number | undefined, detail: unknown) => ({
  value:
    detail === undefined
      ? usage
      : {
          ...usage,
          context: {
            ...usage.context,
            breakdown: {
              isAutoCompactEnabled: threshold !== undefined,
              autoCompactThreshold: threshold,
            } as unknown as SessionContextBreakdown,
          },
        },
})

test('formats context and the two account windows, skipping others', async () => {
  const line = format(
    {
      context: { tokens: 90_000, window: 200_000, percent: 45 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-09T12:13:00Z' },
        { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-12T14:00:00Z' },
        { kind: 'seven_day_fable', percentUsed: 80 },
        { kind: 'spend_limit', percentUsed: 10 },
      ],
    },
    NOW,
  )
  expect(line).toBe('ctx 45% 90k/200k · 5h 23.5% ↻2h13m · 7d 41% ↻3d4h')
})

test('the fill is measured against the autocompact threshold when there is one', async () => {
  const usage = { context: { tokens: 250_000, window: 1_000_000 }, rateLimits: [] }
  expect(format({ ...usage, compactAt: 500_000 }, NOW)).toBe('ctx 50% 250k/500k')
  expect(format(usage, NOW)).toBe('ctx 25% 250k/1000k')
})

test('before the first response there is no fill and no limits', async () => {
  expect(format({ context: { window: 1_000_000 }, rateLimits: [], compactAt: 500_000 }, NOW)).toBe('ctx -/500k')
})

test('model leads the line, with effort when the model takes one', async () => {
  const usage = { context: { tokens: 1_000, window: 200_000 }, rateLimits: [] }
  expect(format({ ...usage, model: 'claude-sonnet-5-5', effort: 'xhigh' }, NOW)).toBe('sonnet-5-5 xhigh · ctx 1% 1k/200k')
  expect(format({ ...usage, model: 'claude-haiku-5-5' }, NOW)).toBe('haiku-5-5 · ctx 1% 1k/200k')
})

test('a reset in the past or missing shows no countdown', async () => {
  expect(until('2026-10-09T09:00:00Z', NOW)).toBe('0m')
  expect(until(undefined, NOW)).toBe('')
})

test('session.start draws from usage(), and the countdown ticks each minute', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  drawHint(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', ($, e) =>
    answer(
      {
        startedAt: NOW,
        context: { tokens: 50_000, window: 1_000_000, percent: 5 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 1, resetsAt: '2026-10-09T10:05:00Z' }],
      },
      500_000,
      e.breakdown,
    ),
  )

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await lineOf($)).toBe('opus-5-5[1m] · ctx 10% 50k/500k · 5h 1% ↻5m')

  await clock.advance(60_000)
  expect(await lineOf($)).toBe('opus-5-5[1m] · ctx 10% 50k/500k · 5h 1% ↻4m')
})

test('each model request redraws the line; subagents leave model, effort and context alone', async ($, on) => {
  mock.clock(on, { now: NOW })
  drawHint(on)
  let percentUsed = 10
  let threshold: number | undefined = 200_000
  on('session.usage', ($, e) =>
    answer(
      {
        startedAt: NOW,
        context: { tokens: 1, window: 200_000, percent: 0 },
        rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt: '2026-10-09T11:00:00Z' }],
      },
      threshold,
      e.breakdown,
    ),
  )
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: e.model,
        input_tokens: 2_000,
        cache_read_input_tokens: 60_000,
        cache_creation_input_tokens: 8_000,
        output_tokens: 500,
      },
    }
  })
  const drain = async (agentId?: string) => {
    const model = agentId ? 'claude-haiku-5-5' : 'claude-opus-5-5'
    const effort = agentId ? 'low' : 'high'
    const stream = $.turn.step({ turnId: 't', index: 0, model, effort, messageCount: 3, ...(agentId ? { agentId } : {}) })
    for await (const _ of stream) {
    }
    return stream.result
  }

  // No measurement yet: the threshold is unknown, so the model's window stands in.
  await drain()
  expect(await lineOf($)).toBe('opus-5-5 high · ctx 35% 70k/200k · 5h 10% ↻1h0m')

  percentUsed = 12
  await drain('sub-1')
  expect(await lineOf($)).toBe('opus-5-5 high · ctx 35% 70k/200k · 5h 12% ↻1h0m')

  // The end-of-turn measurement reads the threshold again: /autocompact moved it.
  threshold = 100_000
  await $.session.measure({
    context: { tokens: 80_000, window: 200_000, percent: 40 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 13, resetsAt: '2026-10-09T11:00:00Z' }],
    changed: ['context'],
  })
  expect(await lineOf($)).toBe('opus-5-5 high · ctx 80% 80k/100k · 5h 13% ↻1h0m')
})

test('the line is its own row under the engine hint, one Text per segment so it wraps between them', async ($, on) => {
  mock.clock(on, { now: NOW })
  drawHint(on)
  on('session.usage', ($, e) =>
    answer({ startedAt: NOW, context: { tokens: 5_000, window: 200_000 }, rateLimits: [] }, undefined, e.breakdown),
  )
  on('session.measure', ($, e) => ({ changed: e.changed }))

  // Nothing measured yet: the hint stands alone.
  expect(await lineOf($)).toBe('')

  await $.session.measure({
    context: { tokens: 5_000, window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-09T10:10:00Z' }],
    changed: ['context'],
  })
  expect(await lineOf($)).toBe('ctx 3% 5k/200k · 5h 2% ↻10m')

  const tree = await draw($)
  const row = 'children' in tree && Array.isArray(tree.children) ? tree.children[1] : undefined
  expect(row).toMatchObject({ type: 'Box', props: { flexDirection: 'row', flexWrap: 'wrap' } })
  expect(row !== undefined && typeof row !== 'string' && 'children' in row ? row.children?.length : 0).toBe(2)
})
