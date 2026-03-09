const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(value: number): string {
  return `$${usdFormatter.format(value)}`
}

export function formatChange(usdChange: number, changePercent: number): string {
  const sign = usdChange >= 0 ? '+' : ''
  return `${sign}$${Math.abs(usdChange).toFixed(2)} (${Math.abs(changePercent).toFixed(2)}%)`
}
