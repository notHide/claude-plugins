import type { EngineInterface, Register } from 'claude-code'

export const SECTION = 'less-slop:rules'

let rules: Promise<string> | undefined

// prompt.md ships with the plugin; read once per load, so the text stays stable for the prompt cache.
async function load($: EngineInterface): Promise<string> {
  rules ??= $.fs.read(`${$.plugin.root}/prompt.md`).then((text: string) => text.trim())
  return rules
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    // --bare asks for the one-line prompt; leave it alone.
    if (e.traits.includes('bare')) return composed
    const text = await load($)
    if (text === '') return composed
    return { sections: [...composed.sections, { id: SECTION, text, scope: 'session' }] }
  })
}
