'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Database,
  Gauge,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import { RiskMeter } from '@/components/ui/RiskMeter'
import type { MarketRiskLevel } from '@/lib/riskCalculator'

type TradeAction = 'BUY' | 'SELL' | 'ATTENDI'

type Signal = {
  name: string
  symbol: string
  network: string
  price: string
  change: string
  score: number
  adjustedScore?: number
  riskScore?: number
  risk: string
  volume: string
  reason: string
  action?: TradeAction
  targetPrice?: string
  targets?: {
    oneDay: string
    twoDays: string
    oneWeek: string
  }
  ath?: string
  athDate?: string
  athDistance?: string
  athForecasts?: { horizon: string; target: string; reachProbability: number; breakoutProbability: number }[]
  stopLoss?: string
  trend: number[]
}

const signals: Signal[] = [
  { name: 'Aether Protocol', symbol: 'AETH', network: 'Ethereum', price: '$0.0842', change: '+18.42%', score: 92, adjustedScore: 76, riskScore: 0.38, risk: 'Low', volume: '$4.8M', reason: 'Accumulation + audit pass', trend: [31, 35, 33, 42, 45, 51, 63, 67, 74, 86] },
  { name: 'Nexus Compute', symbol: 'NXS', network: 'Base', price: '$1.284', change: '+12.08%', score: 86, risk: 'Moderate', volume: '$2.1M', reason: 'Whale inflow detected', trend: [24, 29, 28, 35, 39, 37, 48, 52, 62, 71] },
  { name: 'Mori Finance', symbol: 'MORI', network: 'Solana', price: '$0.0176', change: '+9.74%', score: 81, risk: 'Moderate', volume: '$890K', reason: 'Strong social momentum', trend: [32, 28, 34, 30, 38, 43, 39, 51, 55, 64] },
  { name: 'Helix Layer', symbol: 'HLX', network: 'Arbitrum', price: '$0.226', change: '+7.31%', score: 74, risk: 'High', volume: '$612K', reason: 'Volume breakout', trend: [37, 39, 36, 41, 40, 46, 44, 51, 56, 60] },
  { name: 'Orbit Markets', symbol: 'ORB', network: 'Polygon', price: '$0.0418', change: '+5.62%', score: 69, risk: 'High', volume: '$381K', reason: 'New liquidity added', trend: [40, 35, 37, 42, 43, 41, 47, 49, 53, 57] },
]

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Signals', icon: Sparkles, count: '12' },
  { label: 'Watchlist', icon: TrendingUp },
  { label: 'Risk monitor', icon: ShieldCheck },
]

function Sparkline({ points, tone = 'emerald' }: { points: number[]; tone?: 'emerald' | 'amber' }) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const path = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100
    const y = 96 - ((point - min) / (max - min || 1)) * 78
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <svg className="h-12 w-24 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Trend chart">
      <path d={`${path} L 100 100 L 0 100 Z`} className={tone === 'amber' ? 'fill-amber-400/8' : 'fill-emerald-400/8'} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className={tone === 'amber' ? 'text-amber-400' : 'text-emerald-400'} />
    </svg>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  return (
    <div className="relative flex size-12 items-center justify-center">
      <svg className="absolute inset-0 size-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="text-emerald-400" />
      </svg>
      <span className="font-mono text-xs font-bold text-foreground">{score}</span>
    </div>
  )
}

export default function Page() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [riskFilter, setRiskFilter] = useState('All risk levels')
  const [search, setSearch] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [liveSignals, setLiveSignals] = useState(signals)
  const [marketStatus, setMarketStatus] = useState<'loading' | 'live' | 'offline'>('loading')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [historicalTargets, setHistoricalTargets] = useState<Signal['targets'] | null>(null)
  const [targetMethodology, setTargetMethodology] = useState<string | null>(null)
  const [historicalAth, setHistoricalAth] = useState<Pick<Signal, 'ath' | 'athDate' | 'athDistance' | 'athForecasts'> | null>(null)

  useEffect(() => {
    let active = true
    const loadMarkets = async () => {
      try {
        const response = await fetch('/api/mexc', { cache: 'no-store' })
        if (!response.ok) throw new Error('MEXC unavailable')
        const data = await response.json()
        if (active && data.markets?.length) {
          setLiveSignals(data.markets)
          setSelectedSymbol((current) => current ?? data.markets[0]?.symbol ?? null)
          setMarketStatus('live')
          setLastUpdated(data.updatedAt)
        }
      } catch {
        if (active) setMarketStatus('offline')
      }
    }
    loadMarkets()
    const interval = window.setInterval(loadMarkets, 60_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!selectedSymbol) {
      setHistoricalTargets(null)
      setHistoricalAth(null)
      setTargetMethodology(null)
      return
    }
    let active = true
    fetch(`/api/mexc?symbol=${encodeURIComponent(selectedSymbol)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Historical data unavailable')))
      .then((data) => {
        if (active) {
          setHistoricalTargets(data.targets ?? null)
          setHistoricalAth({ ath: data.ath, athDate: data.athDate, athDistance: data.athDistance, athForecasts: data.athForecasts ?? [] })
          setTargetMethodology(data.methodology ?? null)
        }
      })
      .catch(() => {
        if (active) {
          setHistoricalTargets(null)
          setHistoricalAth(null)
          setTargetMethodology(null)
        }
      })
    return () => { active = false }
  }, [selectedSymbol])

  const filteredSignals = useMemo(() => liveSignals.filter((signal) => {
    const matchesRisk = riskFilter === 'All risk levels' || signal.risk === riskFilter
    const query = search.toLowerCase()
    return matchesRisk && (!query || signal.name.toLowerCase().includes(query) || signal.symbol.toLowerCase().includes(query))
  }), [liveSignals, riskFilter, search])

  const selectedSignalBase = liveSignals.find((signal) => signal.symbol === selectedSymbol) ?? filteredSignals[0] ?? liveSignals[0]
  const selectedSignal = selectedSignalBase ? { ...selectedSignalBase, targets: historicalTargets ?? selectedSignalBase.targets, ...historicalAth } : undefined

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className={`${mobileNav ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar transition-transform lg:relative lg:translate-x-0`}>
          <div className="flex h-20 items-center justify-between border-b border-border px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950"><Activity className="size-5" /></div>
              <div><p className="font-mono text-sm font-bold tracking-tight">VECTOR<span className="text-emerald-400">/</span>100</p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Risk intelligence</p></div>
            </div>
            <button className="lg:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X className="size-5" /></button>
          </div>
          <div className="flex-1 px-4 py-6">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
            <nav className="space-y-1" aria-label="Primary navigation">
              {navItems.map(({ label, icon: Icon, count }) => <button key={label} onClick={() => { setActiveNav(label); setMobileNav(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${activeNav === label ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><span className="flex items-center gap-3"><Icon className="size-4" />{label}</span>{count && <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">{count}</span>}</button>)}
            </nav>
            <p className="mb-3 mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Data layers</p>
            <nav className="space-y-1"><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"><Database className="size-4" />On-chain activity</button><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"><BarChart3 className="size-4" />Market structure</button><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"><ShieldCheck className="size-4" />Security audits</button></nav>
          </div>
          <div className="border-t border-border p-4"><div className="flex items-center gap-3 rounded-lg bg-accent/50 p-3"><div className="flex size-8 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-300">JD</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">Jordan Davis</p><p className="truncate text-[11px] text-muted-foreground">Pro workspace</p></div><Settings2 className="size-4 text-muted-foreground" /></div></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-20 items-center justify-between border-b border-border px-5 md:px-8"><div className="flex items-center gap-3"><button className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu className="size-5" /></button><div><p className="text-xs text-muted-foreground">Monday, September 29, 2026</p><h1 className="text-lg font-semibold tracking-tight">Good morning, Jordan</h1></div></div><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 md:flex"><Search className="size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground" placeholder="Search assets" /><kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">⌘ K</kbd></div><button className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent" aria-label="Notifications"><Bell className="size-4" /></button><button className="hidden rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent sm:block" aria-label="Help"><CircleHelp className="size-4" /></button></div></header>

          <div className="mx-auto max-w-[1500px] space-y-8 p-5 md:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-emerald-400"><span className={`size-1.5 rounded-full ${marketStatus === 'live' ? 'bg-emerald-400' : marketStatus === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />{marketStatus === 'live' ? `Live MEXC scan · all USDT markets (${liveSignals.length})` : marketStatus === 'loading' ? 'Connecting to MEXC · all USDT markets' : 'MEXC unavailable'} <span className="text-muted-foreground">{lastUpdated ? `updated ${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'public spot data'}</span></div><h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Market overview</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">A clearer view of upside potential, with risk signals surfaced before momentum.</p>{liveSignals[0] && <div className="mt-4 max-w-xs"><RiskMeter riskScore={liveSignals[0]?.riskScore ?? 0} riskLevel={(liveSignals[0]?.risk === 'Low' ? 'LOW' : liveSignals[0]?.risk === 'Moderate' ? 'MEDIUM' : 'HIGH') as MarketRiskLevel} isSafe={(liveSignals[0]?.riskScore ?? 1) < 0.4} /></div>}</div><button className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"><Sparkles className="size-4" />Run new scan</button></div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Market health</p><Gauge className="size-4 text-emerald-400" /></div><div className="mt-4 flex items-end gap-3"><p className="font-mono text-3xl font-semibold">78<span className="text-lg text-muted-foreground">/100</span></p><span className="mb-1 flex items-center gap-1 text-xs text-emerald-400"><ArrowUpRight className="size-3" />4.8%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full w-[78%] rounded-full bg-emerald-400" /></div></div><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">High-conviction signals</p><Sparkles className="size-4 text-cyan-300" /></div><div className="mt-4 flex items-end gap-3"><p className="font-mono text-3xl font-semibold">12</p><span className="mb-1 flex items-center gap-1 text-xs text-emerald-400"><ArrowUpRight className="size-3" />3 new</span></div><p className="mt-4 text-xs text-muted-foreground">Across 4 networks</p></div><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Risk exposure</p><ShieldCheck className="size-4 text-amber-400" /></div><div className="mt-4 flex items-end gap-3"><p className="font-mono text-3xl font-semibold">34<span className="text-lg text-muted-foreground">%</span></p><span className="mb-1 flex items-center gap-1 text-xs text-amber-400"><ArrowDownRight className="size-3" />2.1%</span></div><p className="mt-4 text-xs text-muted-foreground">Below your 40% threshold</p></div><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Assets monitored</p><WalletCards className="size-4 text-muted-foreground" /></div><div className="mt-4 flex items-end gap-3"><p className="font-mono text-3xl font-semibold">2,481</p><span className="mb-1 text-xs text-muted-foreground">24h universe</span></div><p className="mt-4 text-xs text-muted-foreground">Last full scan 08:42 UTC</p></div></div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><section className="min-w-0 rounded-xl border border-border bg-card"><div className="flex flex-col justify-between gap-4 border-b border-border p-5 sm:flex-row sm:items-center"><div><h3 className="font-semibold">Top signals</h3><p className="mt-1 text-xs text-muted-foreground">Assets ranked by risk-adjusted growth potential · select a row to inspect the decision context</p></div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-muted-foreground" /><select value={selectedSignal?.symbol ?? ''} onChange={(event) => setSelectedSymbol(event.target.value || null)} aria-label="Analyze token" className="max-w-36 rounded-lg border border-emerald-400/30 bg-background px-3 py-2 text-xs text-foreground outline-none"><option value="">Analyze token</option>{liveSignals.map((signal) => <option key={signal.symbol} value={signal.symbol}>{signal.symbol}</option>)}</select><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"><option>All risk levels</option><option>Low</option><option>Moderate</option><option>High</option></select></div></div>{selectedSignal && <div className="grid gap-3 border-b border-border bg-background/50 p-5 sm:grid-cols-3"><div><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Historical ATH</p><p className="mt-1 font-mono text-lg font-bold text-cyan-300">{selectedSignal.ath ?? 'Loading...'}</p><p className="text-[11px] text-muted-foreground">{selectedSignal.athDistance ? `${selectedSignal.athDistance} from current price` : 'MEXC history loading'}</p>{selectedSignal.athDate && <p className="mt-1 text-[10px] text-muted-foreground">Recorded {new Date(selectedSignal.athDate).toLocaleDateString()}</p>}</div><div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">ATH forecast · probability model</p><div className="mt-2 grid grid-cols-3 gap-2">{(selectedSignal.athForecasts ?? []).map((forecast) => <div key={forecast.horizon} className="rounded-lg border border-border bg-card p-2"><p className="font-mono text-[10px] text-muted-foreground">{forecast.horizon}</p><p className="mt-1 font-mono text-sm font-bold text-cyan-300">{forecast.target}</p><p className="mt-1 text-[10px] text-emerald-400">{forecast.reachProbability}% reach</p><p className="text-[10px] text-amber-400">{forecast.breakoutProbability}% breakout</p></div>)}</div><p className="mt-2 text-[10px] text-muted-foreground">Stima della probabilità di raggiungere o superare l&apos;ATH storico.</p></div><div><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Decision</p><p className={`mt-1 font-mono text-lg font-bold ${selectedSignal.action === 'BUY' ? 'text-emerald-400' : selectedSignal.action === 'SELL' ? 'text-rose-400' : 'text-amber-400'}`}>{selectedSignal.action ?? 'ATTENDI'}</p><p className="text-[11px] text-muted-foreground">Based on momentum and risk</p></div><div><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Target price</p><div className="mt-2 grid grid-cols-3 gap-2"><div className="rounded-md border border-border bg-card px-2 py-2"><p className="text-[9px] text-muted-foreground">1D</p><p className="mt-1 font-mono text-sm font-semibold text-emerald-400">{selectedSignal.targets?.oneDay ?? selectedSignal.targetPrice ?? '—'}</p></div><div className="rounded-md border border-border bg-card px-2 py-2"><p className="text-[9px] text-muted-foreground">2D</p><p className="mt-1 font-mono text-sm font-semibold text-emerald-400">{selectedSignal.targets?.twoDays ?? '—'}</p></div><div className="rounded-md border border-border bg-card px-2 py-2"><p className="text-[9px] text-muted-foreground">1W</p><p className="mt-1 font-mono text-sm font-semibold text-emerald-400">{selectedSignal.targets?.oneWeek ?? '—'}</p></div></div><p className="mt-2 text-[11px] text-muted-foreground">Estimated upside objective</p></div><div><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Stop loss</p><p className="mt-1 font-mono text-lg font-semibold text-rose-300">{selectedSignal.stopLoss ?? '—'}</p><p className="text-[11px] text-muted-foreground">Risk limit reference</p></div></div>}<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-border text-[10px] uppercase tracking-[0.15em] text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Asset</th><th className="px-4 py-3 font-medium">Price</th><th className="px-4 py-3 font-medium">24h</th><th className="px-4 py-3 font-medium">Signal score</th><th className="px-4 py-3 font-medium">Risk</th><th className="px-4 py-3 font-medium">Trend</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-border">{filteredSignals.map((signal) => <tr key={signal.symbol} className="group transition-colors hover:bg-accent/30"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 font-mono text-xs font-bold text-cyan-300">{signal.symbol.slice(0, 2)}</div><div><p className="text-sm font-medium">{signal.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{signal.symbol} <span className="mx-1 text-border">•</span> {signal.network}</p></div></div></td><td className="px-4 py-4 font-mono text-xs">{signal.price}</td><td className="px-4 py-4 font-mono text-xs text-emerald-400">{signal.change}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><ScoreRing score={signal.score} /><span className="hidden text-[11px] text-muted-foreground xl:block">{signal.reason}</span></div></td><td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-[10px] font-medium ${signal.risk === 'Low' ? 'bg-emerald-400/10 text-emerald-400' : signal.risk === 'Moderate' ? 'bg-amber-400/10 text-amber-300' : 'bg-rose-400/10 text-rose-300'}`}>{signal.risk}</span></td><td className="px-4 py-4"><Sparkline points={signal.trend} tone={signal.risk === 'High' ? 'amber' : 'emerald'} /></td><td className="px-5 py-4"><button className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100" aria-label={`Open ${signal.name}`}><ChevronDown className="size-4 -rotate-90" /></button></td></tr>)}</tbody></table>{filteredSignals.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No assets match these filters.</div>}</div><div className="flex items-center justify-between border-t border-border px-5 py-4"><p className="text-xs text-muted-foreground">Showing {filteredSignals.length} of 2,481 monitored assets</p><button className="text-xs font-medium text-emerald-400 hover:text-emerald-300">View all signals <span aria-hidden="true">→</span></button></div></section>

              <aside className="space-y-6"><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Market pulse</h3><p className="mt-1 text-xs text-muted-foreground">Signal distribution</p></div><Clock3 className="size-4 text-muted-foreground" /></div><div className="mt-6 flex items-center gap-5"><div className="relative flex size-28 items-center justify-center rounded-full" style={{ background: 'conic-gradient(#34d399 0 42%, #fbbf24 42% 70%, #fb7185 70% 100%)' }}><div className="flex size-20 flex-col items-center justify-center rounded-full bg-card"><span className="font-mono text-xl font-semibold">42%</span><span className="text-[10px] text-muted-foreground">bullish</span></div></div><div className="space-y-3 text-xs"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-400" />Bullish <span className="ml-auto font-mono text-muted-foreground">42%</span></div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-400" />Neutral <span className="ml-auto font-mono text-muted-foreground">28%</span></div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-400" />Bearish <span className="ml-auto font-mono text-muted-foreground">30%</span></div></div></div></div><div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Risk watch</h3><p className="mt-1 text-xs text-muted-foreground">Events worth reviewing</p></div><Bell className="size-4 text-amber-400" /></div><div className="mt-5 space-y-4"><div className="flex gap-3"><div className="mt-1 size-2 shrink-0 rounded-full bg-amber-400" /><div><p className="text-xs leading-5">Whale concentration increased for <span className="font-medium">HLX</span></p><p className="mt-1 text-[10px] text-muted-foreground">14 min ago · concentration risk</p></div></div><div className="flex gap-3"><div className="mt-1 size-2 shrink-0 rounded-full bg-cyan-300" /><div><p className="text-xs leading-5">New audit published for <span className="font-medium">AETH</span></p><p className="mt-1 text-[10px] text-muted-foreground">42 min ago · security layer</p></div></div></div><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs font-medium hover:bg-accent">Open risk monitor <ArrowUpRight className="size-3" /></button></div></aside></div>

            <footer className="flex flex-col justify-between gap-2 border-t border-border pt-5 text-[10px] text-muted-foreground sm:flex-row"><p className="flex items-center gap-2"><Command className="size-3" />Vector/100 uses probabilistic models. No signal is financial advice.</p><p>MEXC refreshes every 60 seconds <span className="mx-2 text-border">•</span> API status <span className={marketStatus === 'live' ? 'text-emerald-400' : 'text-amber-400'}>{marketStatus === 'live' ? 'operational' : marketStatus}</span></p></footer>
          </div>
        </section>
      </div>
    </main>
  )
}
