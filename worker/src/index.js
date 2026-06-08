// Cloudflare Worker: secure proxy between the SPA and Koofr (WebDAV), plus the
// NotebookLM-style /api/ask endpoint (Workers AI, optional Gemini fallback).
// Koofr credentials live only here (as secrets) and never reach the browser.

const DEFAULT_DOC = {
  version: '1.1.0',
  last_updated: '1970-01-01T00:00:00.000Z',
  cards: [],
  campaigns: [],
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // Auth gate for every real call.
    if (!authorized(request, env)) {
      return json({ error: 'unauthorized' }, 401, cors)
    }

    try {
      if (url.pathname === '/api/sync' && request.method === 'GET') {
        return await handleSync(env, cors)
      }
      if (url.pathname === '/api/save' && request.method === 'POST') {
        return await handleSave(request, env, cors)
      }
      if (url.pathname === '/api/upload-snapshot' && request.method === 'POST') {
        return await handleUpload(request, env, cors)
      }
      if (url.pathname === '/api/ask' && request.method === 'POST') {
        return await handleAsk(request, env, cors)
      }
      return json({ error: 'not found' }, 404, cors)
    } catch (e) {
      return json({ error: e.message || 'server error' }, 500, cors)
    }
  },
}

// ---- Handlers ----

async function handleSync(env, cors) {
  const res = await koofr(env, env.STATE_PATH, { method: 'GET' })
  if (res.status === 404) return json(DEFAULT_DOC, 200, cors)
  if (!res.ok) return json({ error: `koofr ${res.status}` }, 502, cors)
  const text = await res.text()
  try {
    return new Response(text, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch {
    return json(DEFAULT_DOC, 200, cors)
  }
}

async function handleSave(request, env, cors) {
  const body = await request.text()
  const res = await koofr(env, env.STATE_PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) return json({ error: `koofr ${res.status}` }, 502, cors)
  return json({ ok: true }, 200, cors)
}

async function handleUpload(request, env, cors) {
  const form = await request.formData()
  const name = sanitize(form.get('name') || `upload_${Date.now()}.png`)
  const file = form.get('file')
  if (!file) return json({ error: 'missing file' }, 400, cors)
  const path = `${env.MEDIA_DIR}/${name}`
  const res = await koofr(env, path, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file.stream ? file.stream() : await file.arrayBuffer(),
  })
  if (!res.ok) return json({ error: `koofr ${res.status}` }, 502, cors)
  return json({ ok: true, url: `/media/${name}` }, 200, cors)
}

async function handleAsk(request, env, cors) {
  const { question, context } = await request.json()
  if (!question) return json({ error: 'missing question' }, 400, cors)

  const system =
    'You are a precise assistant for a credit-card cashback tracker. Answer ONLY from the ' +
    'provided JSON context and T&C text. Be concise. When you state a number, use the values ' +
    'in the context — never invent figures. Cite campaign titles you used. If the answer is ' +
    'not in the context, say so.'
  const user = `Context (JSON):\n${JSON.stringify(context).slice(0, 12000)}\n\nQuestion: ${question}`

  let answer
  try {
    const out = await env.AI.run(env.AI_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
    answer = out.response || out.result || ''
  } catch (e) {
    if (env.GEMINI_API_KEY) {
      answer = await askGemini(env, system, user)
    } else {
      throw e
    }
  }

  const citations = (context?.campaigns || [])
    .filter((c) => answer && answer.includes(c.title))
    .map((c) => c.title)
  return json({ answer, citations }, 200, cors)
}

async function askGemini(env, system, user) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    },
  )
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '(no answer)'
}

// ---- Helpers ----

function koofr(env, path, init) {
  const base = env.KOOFR_DAV_BASE.replace(/\/$/, '')
  return fetch(`${base}/${path}`, {
    ...init,
    headers: { Authorization: env.KOOFR_AUTH_HEADER, ...(init.headers || {}) },
  })
}

function authorized(request, env) {
  const sent = request.headers.get('X-App-Auth') || ''
  const expected = env.APP_API_KEY || ''
  if (!expected || sent.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= sent.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function corsHeaders(request, env) {
  // ALLOWED_ORIGIN may be "*" or a comma-separated allow-list. We echo the
  // request's Origin if it's on the list, so localhost and Pages both work.
  const allowed = (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const origin = request.headers.get('Origin') || ''
  let allow = '*'
  if (!allowed.includes('*')) {
    // Allow any localhost / 127.0.0.1 port during dev (Vite may shift ports).
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    allow = allowed.includes(origin) || isLocal ? origin : allowed[0] || ''
  }
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Auth',
    'Access-Control-Max-Age': '86400',
  }
}

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
