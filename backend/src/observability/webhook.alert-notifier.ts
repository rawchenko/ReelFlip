import { MigrationAlertEvent } from './migration-alerts.js'

interface Logger {
  warn: (obj: unknown, msg?: string) => void
  info?: (obj: unknown, msg?: string) => void
}

export interface WebhookAlertNotifierOptions {
  url?: string
  timeoutMs: number
  retryCount: number
  cooldownSeconds: number
  logger: Logger
}

export class WebhookAlertNotifier {
  private readonly lastDeliveredAtMsByType = new Map<MigrationAlertEvent['type'], number>()

  constructor(private readonly options: WebhookAlertNotifierOptions) {}

  isEnabled(): boolean {
    return typeof this.options.url === 'string' && this.options.url.trim().length > 0
  }

  async notify(event: MigrationAlertEvent): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    const nowMs = Date.now()
    const cooldownMs = Math.max(0, this.options.cooldownSeconds) * 1000
    const lastDeliveredAtMs = this.lastDeliveredAtMsByType.get(event.type)
    if (lastDeliveredAtMs !== undefined && nowMs - lastDeliveredAtMs < cooldownMs) {
      return false
    }

    const maxAttempts = Math.max(0, this.options.retryCount) + 1
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.sendOnce(event)
        this.lastDeliveredAtMsByType.set(event.type, nowMs)
        this.options.logger.info?.({ type: event.type, attempt }, 'Migration alert webhook delivered')
        return true
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await delay(100 * attempt)
        }
      }
    }

    this.options.logger.warn(
      {
        type: event.type,
        retryCount: this.options.retryCount,
        error: toErrorMessage(lastError),
      },
      'Migration alert webhook delivery failed',
    )

    return false
  }

  private async sendOnce(event: MigrationAlertEvent): Promise<void> {
    const webhookUrl = this.options.url
    if (!webhookUrl) {
      throw new Error('webhook_url_missing')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, Math.max(200, this.options.timeoutMs))

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(event),
      })

      if (!response.ok) {
        throw new Error(`status_${response.status}`)
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

function toErrorMessage(input: unknown): string {
  if (input instanceof Error) {
    return input.message
  }

  return String(input)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
