import assert from 'node:assert/strict'
import test from 'node:test'
import { formatInFilter, SupabaseClient, SupabaseClientError, SupabaseRequestEvent } from './supabase.client.js'

test('formatInFilter escapes values for PostgREST in() filters', () => {
  const encoded = formatInFilter(['abc', 'with"quote', ''])
  assert.equal(encoded, '("abc","with\\"quote")')
})

test('retries transient HTTP errors and succeeds', async () => {
  const previousFetch = globalThis.fetch
  const events: SupabaseRequestEvent[] = []
  let callCount = 0

  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: 'temporary' }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    return new Response('[]', {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  try {
    const client = new SupabaseClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'srk',
      maxRetries: 2,
      retryBaseDelayMs: 1,
      onRequestComplete: (event) => events.push(event),
    })

    const rows = await client.selectRows<Record<string, unknown>>('tokens', { select: 'mint' })
    assert.deepEqual(rows, [])
    assert.equal(callCount, 2)
    assert.equal(events.length, 2)
    assert.equal(events[0]?.success, false)
    assert.equal(events[0]?.status, 503)
    assert.equal(events[1]?.success, true)
    assert.equal(events[1]?.retried, true)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('throws after retry budget is exhausted', async () => {
  const previousFetch = globalThis.fetch
  let callCount = 0

  globalThis.fetch = async () => {
    callCount += 1
    return new Response(JSON.stringify({ message: 'down' }), {
      status: 503,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  try {
    const client = new SupabaseClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'srk',
      maxRetries: 1,
      retryBaseDelayMs: 1,
    })

    await assert.rejects(
      () => client.selectRows<Record<string, unknown>>('tokens', { select: '*' }),
      (error: unknown) => {
        assert.ok(error instanceof SupabaseClientError)
        assert.equal(error.status, 503)
        return true
      },
    )
    assert.equal(callCount, 2)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('is disabled without URL or service role key', async () => {
  const client = new SupabaseClient({
    url: 'https://example.supabase.co',
  })

  assert.equal(client.isEnabled(), false)
  const rows = await client.selectRows<Record<string, unknown>>('tokens', { select: '*' })
  assert.deepEqual(rows, [])
})

test('invokeRpc posts to /rpc/<function> with payload', async () => {
  const previousFetch = globalThis.fetch
  const captured: { url?: URL; method?: string; body?: string } = {}

  globalThis.fetch = async (input, init) => {
    captured.url = new URL(String(input))
    captured.method = init?.method
    captured.body = typeof init?.body === 'string' ? init.body : undefined
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  try {
    const client = new SupabaseClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'srk',
    })
    const result = await client.invokeRpc<{ ok: boolean }>('upsert_tokens_diff', {
      rows: [{ mint: 'mint-a' }],
    })

    assert.equal(captured.url?.pathname, '/rest/v1/rpc/upsert_tokens_diff')
    assert.equal(captured.method, 'POST')
    assert.deepEqual(JSON.parse(captured.body ?? '{}'), { rows: [{ mint: 'mint-a' }] })
    assert.deepEqual(result, { ok: true })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('invokeRpc retries transient HTTP errors and succeeds', async () => {
  const previousFetch = globalThis.fetch
  const events: SupabaseRequestEvent[] = []
  let callCount = 0

  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: 'temporary' }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  try {
    const client = new SupabaseClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'srk',
      maxRetries: 2,
      retryBaseDelayMs: 1,
      onRequestComplete: (event) => events.push(event),
    })

    const payload = await client.invokeRpc<{ ok: boolean }>('upsert_token_market_latest_diff', {
      rows: [],
    })
    assert.deepEqual(payload, { ok: true })
    assert.equal(callCount, 2)
    assert.equal(events.length, 2)
    assert.equal(events[0]?.tableOrView, 'rpc/upsert_token_market_latest_diff')
    assert.equal(events[1]?.success, true)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('invokeRpc propagates non-retryable errors', async () => {
  const previousFetch = globalThis.fetch
  let callCount = 0

  globalThis.fetch = async () => {
    callCount += 1
    return new Response(JSON.stringify({ message: 'bad rpc input' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  try {
    const client = new SupabaseClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'srk',
      maxRetries: 2,
      retryBaseDelayMs: 1,
    })

    await assert.rejects(
      () => client.invokeRpc('upsert_token_labels_latest_diff', { rows: [] }),
      (error: unknown) => {
        assert.ok(error instanceof SupabaseClientError)
        assert.equal(error.status, 400)
        assert.match(error.message, /bad rpc input/)
        return true
      },
    )
    assert.equal(callCount, 1)
  } finally {
    globalThis.fetch = previousFetch
  }
})
