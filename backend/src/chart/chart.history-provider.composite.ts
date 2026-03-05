import { HistoricalCandleProvider, HistoricalCandleProviderFetchParams } from './chart.history-provider.js'
import { OhlcCandle } from './chart.types.js'

interface Logger {
  info?: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

export class FallbackHistoricalCandleProvider implements HistoricalCandleProvider {
  readonly name: string

  constructor(
    private readonly primary: HistoricalCandleProvider,
    private readonly fallback: HistoricalCandleProvider,
    private readonly logger: Logger,
  ) {
    this.name = `${primary.name}_with_fallback_${fallback.name}`
  }

  async fetch1mCandles(params: HistoricalCandleProviderFetchParams): Promise<OhlcCandle[]> {
    try {
      const primaryCandles = await this.primary.fetch1mCandles(params)
      if (primaryCandles.length > 0) {
        return primaryCandles
      }
    } catch (error) {
      this.logger.warn({ error, provider: this.primary.name }, 'Primary historical provider failed')
    }

    const fallbackCandles = await this.fallback.fetch1mCandles(params)
    if (fallbackCandles.length > 0) {
      this.logger.info?.(
        {
          pairAddress: params.pairAddress,
          primaryProvider: this.primary.name,
          fallbackProvider: this.fallback.name,
          candleCount: fallbackCandles.length,
        },
        'Historical provider fallback used',
      )
    }
    return fallbackCandles
  }
}
