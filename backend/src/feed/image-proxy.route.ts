import { FastifyInstance } from 'fastify'
import { CircuitBreaker } from '../lib/circuit-breaker.js'
import { errorEnvelope } from '../lib/error-envelope.js'
import { ResilientHttpClient } from '../lib/http-client.js'

interface ImageProxyQuerystring {
  url?: string
}

interface ImageProxyRouteDependencies {
  rateLimitImageProxyPerMinute: number
}

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export async function registerImageProxyRoute(
  app: FastifyInstance,
  dependencies: ImageProxyRouteDependencies,
): Promise<void> {
  const httpClient = new ResilientHttpClient({
    upstream: 'image_proxy',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: 2,
    retryBaseDelayMs: 200,
    circuitBreaker: new CircuitBreaker({
      windowMs: 30_000,
      minSamples: 10,
      failureThreshold: 0.5,
      openDurationMs: 15_000,
      halfOpenProbeCount: 1,
    }),
    logger: app.log,
  })

  app.get<{ Querystring: ImageProxyQuerystring }>(
    '/v1/image/proxy',
    {
      config: {
        rateLimit: {
          max: dependencies.rateLimitImageProxyPerMinute,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
    const rawUrl = request.query.url
    if (!rawUrl || rawUrl.trim().length === 0) {
      return reply.code(400).send(errorEnvelope('BAD_REQUEST', 'url query param is required'))
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl)
    } catch {
      return reply.code(400).send(errorEnvelope('BAD_REQUEST', 'url must be an absolute URL'))
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return reply.code(400).send(errorEnvelope('BAD_REQUEST', 'url protocol must be http or https'))
    }

    try {
      const upstream = await httpClient.request(parsedUrl, {
        headers: {
          accept: 'image/*,*/*;q=0.8',
          'user-agent': 'ReelFlipImageProxy/1.0',
        },
      })

      if (!upstream.ok) {
        return reply.code(502).send(errorEnvelope('UPSTREAM_ERROR', `Image upstream failed with status ${upstream.status}`))
      }

      const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
      if (!contentType.toLowerCase().startsWith('image/')) {
        return reply.code(415).send(errorEnvelope('UNSUPPORTED_MEDIA', 'Upstream response is not an image'))
      }

      const declaredLength = Number.parseInt(upstream.headers.get('content-length') ?? '', 10)
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        return reply.code(413).send(errorEnvelope('PAYLOAD_TOO_LARGE', 'Image is too large'))
      }

      const body = await upstream.arrayBuffer()
      if (body.byteLength > MAX_IMAGE_BYTES) {
        return reply.code(413).send(errorEnvelope('PAYLOAD_TOO_LARGE', 'Image is too large'))
      }

      reply.header('Content-Type', contentType)
      reply.header('Cache-Control', 'public, max-age=300')
      const etag = upstream.headers.get('etag')
      if (etag) {
        reply.header('ETag', etag)
      }

      return reply.send(Buffer.from(body))
    } catch (error) {
      request.log.warn({ error, url: parsedUrl.toString() }, 'Image proxy request failed')
      return reply.code(502).send(errorEnvelope('UPSTREAM_ERROR', 'Unable to fetch image'))
    }
    },
  )
}
