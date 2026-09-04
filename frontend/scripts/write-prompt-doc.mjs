// Regenerate docs/tnc-to-json-prompt.md from the prompt the app actually ships,
// so the copy you paste into an AI and the copy in the docs never drift.
// Run: npm run prompt:doc
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { TNC_EXTRACTION_PROMPT } from '../src/lib/importPrompt.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../docs/tnc-to-json-prompt.md')

const page = `# T&C → JSON extraction prompt

Generated from \`frontend/src/lib/importPrompt.js\` — run \`npm run prompt:doc\` after editing it.
The same text sits behind **Manage → Import JSON → Copy prompt** in the app.

## How to use it

1. Copy everything in the block below.
2. Paste it into any AI (Claude, ChatGPT, Gemini — anything that reads a document).
3. Replace the last line with the campaign's T&C text, or attach the T&C PDF and leave a note
   saying the terms are attached.
4. Copy the JSON it returns.
5. In the tracker: **Manage → Import JSON**, paste, check the preview, hit **Register**.

The dashboard is tolerant about what comes back — a fenced code block, a bare array, a single
object, "5%" instead of 0.05, \`31/12/2026\` instead of \`2026-12-31\` all parse. What it will not
do is invent a value the model left \`null\`: those show amber in the preview for you to fill.

## The prompt

Copy everything between the outer fences (the inner \`\`\`json block is part of the prompt).

~~~~text
${TNC_EXTRACTION_PROMPT}
~~~~
`

writeFileSync(out, page, 'utf8')
console.log(`wrote ${out}`)
