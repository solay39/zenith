import { NextResponse } from 'next/server'

export const revalidate = 60

type MexcTicker = {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  quoteVolume: string
  highPrice: string
  lowPrice: string
}

function formatPrice(value: number) {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return value.toLocaleString('en-US', { maximumSignificantDigits: 5 })
}

function formatVolume(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${Math.round(value)}`
}

export async function GET() {
  try {
    const response = await fetch('https://api.mexc.com/api/v3/ticker/24hr', {
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) throw new Error(`MEXC responded with ${response.status}`)
    const tickers = (await response.json()) as MexcTicker[]
    const markets = tickers
      .filter((ticker) => ticker.symbol.endsWith('USDT') && Number(ticker.quoteVolume) > 0)
      .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
      .slice(0, 100)
      .map((ticker, index) => {
        const symbol = ticker.symbol.replace('USDT', '')
        const change = Number(ticker.priceChangePercent) || 0
        const volume = Number(ticker.quoteVolume) || 0
        const score = Math.max(20, Math.min(99, Math.round(62 + change * 1.8 + Math.log10(volume + 1) * 2)))
        // Public MEXC data supports a market-risk proxy, not on-chain security claims.
        const liquidityRisk = Math.max(0, Math.min(1, 1 - Math.log10(volume + 1) / 9))
        const volatilityRisk = Math.min(1, Math.abs(change) / 15)
        const concentrationProxy = index > 3 ? 0.42 : index > 1 ? 0.28 : 0.16
        const riskScore = Number((liquidityRisk * 0.35 + volatilityRisk * 0.5 + concentrationProxy * 0.15).toFixed(2))
        const risk = riskScore < 0.24 ? 'Low' : riskScore < 0.48 ? 'Moderate' : 'High'
        const adjustedScore = Math.round(score * (1 - riskScore * 0.45))
        const price = Number(ticker.lastPrice)
        return {
          name: symbol,
          symbol,
          network: 'MEXC spot',
          price: `$${formatPrice(price)}`,
          change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
          score,
          adjustedScore,
          riskScore,
          risk,
          volume: formatVolume(volume),
          reason: change >= 0 ? '24h momentum' : 'Downside pressure',
          trend: [Number(ticker.lowPrice), price * 0.98, price * 0.99, price * 1.01, Number(ticker.highPrice)].map((point) => Number.isFinite(point) ? point : price),
        }
      })

    return NextResponse.json({ markets, source: 'MEXC', updatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('[v0] MEXC market fetch failed', error)
    return NextResponse.json({ error: 'MEXC market data unavailable' }, { status: 502 })
  }
}
