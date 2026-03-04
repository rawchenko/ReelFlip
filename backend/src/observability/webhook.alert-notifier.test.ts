import assert from 'node:assert/strict'
import test from 'node:test'
import { MigrationAlertEvent } from './migration-alerts.js'
import { WebhookAlertNotifier } from './webhook.alert-notifier.js'

const baseEvent: MigrationAlertEvent = {
  type: 'feed_seed_rate_high',
  severity: 'warning',
  detectedAt: '2026-03-04T00:00:00.000Z',
  service: 'reelflip-backend',
  environment: 'test',
  metrics: {
    seedRate: 0.5,
    totalRequests: 100,
  },
  message: 'seed rate high',
}

test('webhook notifier posts alert successfully', async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: string; body: string | null }> = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: (init?.body as string | null) ?? null,
    })
    return new Response('', { status: 202 })
  }) as typeof fetch

  const warnings: string[] = []
  const notifier = new WebhookAlertNotifier({
    url: 'https://alerts.example.test/webhook',
    timeoutMs: 500,
    retryCount: 1,
    cooldownSeconds: 60,
    logger: {
      warn: (_obj, msg) => warnings.push(msg ?? ''),
    },
  })

  const delivered = await notifier.notify(baseEvent)

  globalThis.fetch = originalFetch

  assert.equal(delivered, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0]?.url, 'https://alerts.example.test/webhook')
  assert.match(requests[0]?.body ?? '', /"type":"feed_seed_rate_high"/)
  assert.equal(warnings.length, 0)
})

test('webhook notifier retries and logs on failure', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response('boom', { status: 500 })
  }) as typeof fetch

  const warnings: string[] = []
  const notifier = new WebhookAlertNotifier({
    url: 'https://alerts.example.test/webhook',
    timeoutMs: 500,
    retryCount: 2,
    cooldownSeconds: 60,
    logger: {
      warn: (_obj, msg) => warnings.push(msg ?? ''),
    },
  })

  const delivered = await notifier.notify(baseEvent)

  globalThis.fetch = originalFetch

  assert.equal(delivered, false)
  assert.equal(calls, 3)
  assert.ok(warnings.some((msg) => msg === 'Migration alert webhook delivery failed'))
})

test('webhook notifier handles timeout failures', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'))
          },
          { once: true },
        )
      }
    })
  }) as typeof fetch

  const notifier = new WebhookAlertNotifier({
    url: 'https://alerts.example.test/webhook',
    timeoutMs: 50,
    retryCount: 1,
    cooldownSeconds: 60,
    logger: {
      warn: () => undefined,
    },
  })

  const delivered = await notifier.notify(baseEvent)

  globalThis.fetch = originalFetch

  assert.equal(delivered, false)
  assert.equal(calls, 2)
})

test('webhook notifier dedupes by cooldown per alert type', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0

  globalThis.fetch = (async () => {
    calls += 1
    return new Response('', { status: 200 })
  }) as typeof fetch

  const notifier = new WebhookAlertNotifier({
    url: 'https://alerts.example.test/webhook',
    timeoutMs: 500,
    retryCount: 0,
    cooldownSeconds: 120,
    logger: {
      warn: () => undefined,
    },
  })

  const first = await notifier.notify(baseEvent)
  const second = await notifier.notify(baseEvent)

  globalThis.fetch = originalFetch

  assert.equal(first, true)
  assert.equal(second, false)
  assert.equal(calls, 1)
})
