'use client'

import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { riskLabel, type MarketRiskLevel } from '@/lib/riskCalculator'

export function RiskMeter({ riskScore, riskLevel, isSafe }: { riskScore: number; riskLevel: MarketRiskLevel; isSafe: boolean }) {
  const color = riskScore < 0.4 ? 'text-emerald-400' : riskScore < 0.7 ? 'text-amber-400' : 'text-rose-400'
  const bar = riskScore < 0.4 ? 'bg-emerald-400' : riskScore < 0.7 ? 'bg-amber-400' : 'bg-rose-400'
  const Icon = isSafe ? ShieldCheck : ShieldAlert

  return (
    <div className="min-w-36 rounded-lg border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><Icon className={`size-3.5 ${color}`} />Risk meter</span>
        <span className={`font-mono text-xs font-semibold ${color}`}>{riskScore.toFixed(2)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(4, riskScore * 100)}%` }} /></div>
      <p className={`mt-1 text-[10px] ${color}`}>{riskLabel(riskLevel)} · MEXC market proxy</p>
    </div>
  )
}
