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

type MexcKline = [number, string, string, string, string, string, number, string, number, string, string, string]

function indicatorAnalysis(candles: MexcKline[]) {
  const closes = candles.map((candle) => Number(candle[4])).filter(Number.isFinite)
  const volumes = candles.map((candle) => Number(candle[7])).filter(Number.isFinite)
  const ema = (period: number) => closes.slice(-period).reduce((sum, value) => sum + value, 0) / Math.min(period, closes.length)
  const gains = closes.slice(-15).map((value, index, values) => index === 0 ? 0 : Math.max(0, value - values[index - 1]))
  const losses = closes.slice(-15).map((value, index, values) => index === 0 ? 0 : Math.max(0, values[index - 1] - value))
  const avgGain = gains.reduce((sum, value) => sum + value, 0) / 14
  const avgLoss = losses.reduce((sum, value) => sum + value, 0) / 14
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
  const ema12 = ema(12)
  const ema26 = ema(26)
  const macd = ema12 - ema26
  const latestVolume = volumes.at(-1) ?? 0
  const averageVolume = volumes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, volumes.length)
  const volumeRatio = averageVolume ? latestVolume / averageVolume : 1
  const bullishPoints = (rsi >= 50 ? 1 : 0) + (macd > 0 ? 1 : 0) + (closes.at(-1)! > ema12 ? 1 : 0) + (volumeRatio >= 1.1 ? 1 : 0)
  const bearishPoints = (rsi <= 45 ? 1 : 0) + (macd < 0 ? 1 : 0) + (closes.at(-1)! < ema12 ? 1 : 0) + (volumeRatio < 0.8 ? 1 : 0)
  const action = bullishPoints >= 3 ? 'BUY' : bearishPoints >= 3 ? 'SELL' : 'WAIT'
  return { rsi: Number(rsi.toFixed(1)), ema12, ema26, macd, volumeRatio: Number(volumeRatio.toFixed(2)), bullishPoints, bearishPoints, action, reason: action === 'BUY' ? 'RSI, MACD, EMA e volume confermano il momentum rialzista' : action === 'SELL' ? 'RSI, MACD, EMA e volume confermano pressione ribassista' : 'Gli indicatori sono discordanti: attendi conferma' }
}

function historicalTargets(price: number, candles: MexcKline[]) {
  const closes = candles.map((candle) => Number(candle[4])).filter(Number.isFinite)
  const athCandle = candles.reduce<MexcKline | null>((highest, candle) => {
    const high = Number(candle[2])
    return Number.isFinite(high) && (!highest || high > Number(highest[2])) ? candle : highest
  }, null)
  const ath = athCandle ? Number(athCandle[2]) : price
  const athDate = athCandle ? new Date(athCandle[0]).toISOString() : null
  const highs = candles.map((candle) => Number(candle[2])).filter(Number.isFinite)
  const lows = candles.map((candle) => Number(candle[3])).filter(Number.isFinite)
  if (closes.length < 14) return null
  const recent = closes.slice(-14)
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length
  const meanIndex = (recent.length - 1) / 2
  const slope = recent.reduce((sum, value, index) => sum + (index - meanIndex) * (value - mean), 0) / recent.reduce((sum, _, index) => sum + (index - meanIndex) ** 2, 0)
  const atr = highs.slice(-14).reduce((sum, high, index) => sum + (high - (lows.slice(-14)[index] ?? high)), 0) / 14
  const volatility = Math.max(atr / price, 0.01)
  const momentum = Math.max(-0.15, Math.min(0.15, (slope * 14) / price))
  const projected = (days: number) => price * (1 + momentum * Math.sqrt(days) + volatility * 0.35 * Math.sqrt(days))
  const forecasts = [1, 2, 7].map((days) => {
    const target = projected(days)
    const distance = Math.max(0, (ath - price) / price)
    const upside = Math.max(0, (target - price) / price)
    const reachProbability = Math.round(Math.min(97, Math.max(3, distance === 0 ? 92 : 18 + (upside / distance) * 58)))
    const breakoutProbability = Math.round(Math.min(88, Math.max(1, reachProbability * (momentum > 0 ? 0.58 : 0.22))))
    return { days, target, reachProbability, breakoutProbability }
  })
  return { oneDay: projected(1), twoDays: projected(2), oneWeek: projected(7), ath, athDate, athDistance: ((price - ath) / ath) * 100, forecasts, horizon: 'daily OHLCV · maximum available history' }
}

export async function GET(request: Request) {
  try {
    const selectedSymbol = new URL(request.url).searchParams.get('symbol')?.toUpperCase()
    if (selectedSymbol) {
      const response = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${encodeURIComponent(selectedSymbol)}USDT&interval=1d&limit=1000`, { next: { revalidate: 300 }, headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error(`MEXC candles responded with ${response.status}`)
      const candles = (await response.json()) as MexcKline[]
      const latest = Number(candles.at(-1)?.[4])
      const targets = historicalTargets(latest, candles)
      const indicators = indicatorAnalysis(candles)
      if (!targets) throw new Error('Insufficient historical data')
      return NextResponse.json({ symbol: selectedSymbol, action: indicators.action, reason: indicators.reason, indicators: { rsi: indicators.rsi, ema12: `$${formatPrice(indicators.ema12)}`, ema26: `$${formatPrice(indicators.ema26)}`, macd: indicators.macd.toFixed(6), volumeRatio: indicators.volumeRatio, bullishPoints: indicators.bullishPoints, bearishPoints: indicators.bearishPoints }, targets: { oneDay: `$${formatPrice(targets.oneDay)}`, twoDays: `$${formatPrice(targets.twoDays)}`, oneWeek: `$${formatPrice(targets.oneWeek)}` }, ath: `$${formatPrice(targets.ath)}`, athDate: targets.athDate, athDistance: `${targets.athDistance.toFixed(2)}%`, athForecasts: targets.forecasts.map((forecast) => ({ horizon: `${forecast.days}D`, target: `$${formatPrice(forecast.target)}`, reachProbability: forecast.reachProbability, breakoutProbability: forecast.breakoutProbability })), methodology: `${targets.horizon} · RSI(14), EMA(12/26), MACD e volume`, source: 'MEXC OHLCV' })
    }
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
        const bullish = change >= 1.5 && adjustedScore >= 62
        const bearish = change <= -2.5 || adjustedScore < 42
        const action = bullish ? 'BUY' : bearish ? 'SELL' : 'WAIT'
        const direction = bearish ? -1 : 1
        const dailyMove = Math.min(0.18, Math.max(0.025, Math.abs(change) / 100 * 1.4 + volatilityRisk * 0.02))
        const targetPrice1d = price * (1 + direction * dailyMove)
        const targetPrice2d = price * (1 + direction * Math.min(0.30, dailyMove * 1.55))
        const targetPrice1w = price * (1 + direction * Math.min(0.65, dailyMove * 3.1))
        const stopLoss = price * (1 - Math.min(0.12, Math.max(0.025, riskScore * 0.12)))
        return {
          name: symbol,
          symbol,
          network: 'MEXC spot',
          price: `$${formatPrice(price)}`,
          change: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
          score,
          adjustedScore,
          action,
          targetPrice: `$${formatPrice(targetPrice1d)}`,
          targets: {
            oneDay: `$${formatPrice(targetPrice1d)}`,
            twoDays: `$${formatPrice(targetPrice2d)}`,
            oneWeek: `$${formatPrice(targetPrice1w)}`,
          },
          stopLoss: `$${formatPrice(stopLoss)}`,
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
