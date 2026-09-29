export type RiskLevel = 'VERY LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export function calculateMarketRisk(change24h: number, volume24h: number, rank: number) {
  const liquidityRisk = Math.max(0, Math.min(1, 1 - Math.log10(volume24h + 1) / 9))
  const volatilityRisk = Math.min(1, Math.abs(change24h) / 15)
  const concentrationProxy = rank > 8 ? 0.45 : rank > 5 ? 0.3 : 0.18
  const riskScore = Number((liquidityRisk * 0.45 + volatilityRisk * 0.4 + concentrationProxy * 0.15).toFixed(2))

  return {
    riskScore,
    riskLevel: classifyRisk(riskScore),
    isSafe: riskScore < 0.4,
  }
}

function classifyRisk(score: number): RiskLevel {
  if (score < 0.2) return 'VERY LOW'
  if (score < 0.4) return 'LOW'
  if (score < 0.6) return 'MEDIUM'
  if (score < 0.8) return 'HIGH'
  return 'CRITICAL'
}

export function riskLabel(level: RiskLevel) {
  return level === 'VERY LOW' ? 'Very low' : level.charAt(0) + level.slice(1).toLowerCase()
}

// These scores are market-risk proxies derived from public MEXC ticker data.
// They do not claim to measure on-chain ownership, audits, teams, or regulation.
export type { RiskLevel as MarketRiskLevel }
