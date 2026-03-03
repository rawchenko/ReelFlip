import { FastifyInstance } from 'fastify'
import { errorEnvelope } from '../lib/error-envelope.js'

interface ImageProxyQuerystring {
  url?: string
}

const DEFAULT_TIMEOUT_MS = 8_000
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export async function registerImageProxyRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ImageProxyQuerystring }>('/v1/image/proxy', async (request, reply) => {
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const upstream = await fetch(parsedUrl, {
        signal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId)
    }
  })
}
