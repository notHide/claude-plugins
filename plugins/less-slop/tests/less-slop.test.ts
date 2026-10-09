import type { PromptComposeInput, PromptComposeSection } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { SECTION } from '../hooks/register.ts'

const ENGINE: PromptComposeSection[] = [
  { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
  { id: 'memory', text: 'Remember things.', scope: 'session' },
]

// The facts the engine composes for; the test fills them in as the engine would.
const facts = (traits: PromptComposeInput['traits']): PromptComposeInput => ({
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal'],
  tools: ['Bash', 'Read'],
  outputStyle: null,
  traits,
})

test('appends prompt.md after the engine sections', async ($, on) => {
  const read: string[] = []
  on('fs.read', (_, e) => {
    read.push(e.path)
    return { value: '## Rules\nRemove all mannered prose.\n' }
  })
  on('prompt.compose', () => ({ sections: ENGINE }))
  const { sections } = await $.prompt.compose(facts([]))
  expect(sections.slice(0, 2)).toEqual(ENGINE)
  const last = sections[2]
  expect(last?.id).toBe(SECTION)
  expect(last?.scope).toBe('session')
  expect(last?.text).toBe('## Rules\nRemove all mannered prose.')
  // Read once from the plugin's own prompt.md, not again on the next compose.
  await $.prompt.compose(facts([]))
  expect(read).toHaveLength(1)
  expect(read[0]).toEndWith('/prompt.md')
})

test('leaves the --bare prompt alone', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'bare', text: 'Bare.', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose(facts(['bare']))
  expect(sections.map(s => s.id)).toEqual(['bare'])
})
