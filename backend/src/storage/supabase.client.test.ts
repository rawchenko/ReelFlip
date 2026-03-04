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
