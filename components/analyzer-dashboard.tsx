'use client';

import { useMemo, useRef, useState } from 'react';
import { Activity, Clock3, Database, RefreshCw, Search, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { ThemeToggle } from '@/components/custom/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TRACKED_DIGITS } from '@/lib/types';
import type { ActiveSymbol } from '@deriv/core';
import type {
  ConnectionState, DigitMovement, GroupMovement, GroupSnapshot,
  MarketAnalyzerState, MarketConnectionState, MarketTickState,
  MovementStatus, MultiScanState, RankGroup, TrackedDigit,
} from '@/lib/types';

interface AnalyzerDashboardProps {
  connectionState: ConnectionState;
  symbols: ActiveSymbol[];
  selectedSymbols: string[];
  focusedSymbol: string | null;
  markets: Record<string, MarketTickState>;
  analyses: MultiScanState;
  isLoadingSymbols: boolean;
  symbolsError: string | null;
  setSelectedSymbols: (symbols: string[]) => void;
  toggleSymbol: (symbol: string) => void;
  focusSymbol: (symbol: string) => void;
  restartMarket: (symbol: string) => void;
}

const STATUS_STYLE: Record<MovementStatus, string> = {
  increase: 'text-emerald-700 dark:text-emerald-400',
  decrease: 'text-rose-700 dark:text-rose-400',
  'no-change': 'text-muted-foreground',
};
const STATUS_ICON: Record<MovementStatus, string> = { increase: '↑', decrease: '↓', 'no-change': '—' };

const RANK_STYLES = [
  'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  'border-cyan-500 bg-cyan-500/15 text-cyan-800 dark:text-cyan-300',
  'border-rose-500 bg-rose-500/15 text-rose-800 dark:text-rose-300',
  'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300',
];

function formatTime(timestamp: number | null): string {
  if (!timestamp) return 'Pending';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(timestamp);
}

function formatCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function signed(value: number, decimals = 0): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function ConnectionBadge({ state }: { state: MarketConnectionState }) {
  const style = state === 'connected'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : state === 'offline' || state === 'error'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize', style)}>
      {state === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {state}
    </span>
  );
}

function RankCard({ rank, index }: { rank: RankGroup | undefined; index: number }) {
  const headings = ['Most Appear', '2nd Most Appear', 'Least Appear', '2nd Least Appear'];
  return (
    <Card className={cn('border-2 shadow-sm', RANK_STYLES[index])}>
      <CardContent className="p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wider">{headings[index]}</p>
        <p className="mt-2 font-mono text-xl font-black">{rank?.digits.length ? rank.digits.join(', ') : '—'}</p>
        <p className="mt-1 text-xs font-medium">
          {rank?.digits.length ? `${rank.count} ticks · ${rank.percentage.toFixed(1)}%` : 'Waiting for 1,000 ticks'}
        </p>
      </CardContent>
    </Card>
  );
}

function movementByDigit(movements: DigitMovement[] | null): Map<TrackedDigit, DigitMovement> {
  return new Map(movements?.map((movement) => [movement.digit, movement]) ?? []);
}

function rankDetails(digit: TrackedDigit, rankings: RankGroup[]): { labels: string[]; style: string } {
  const matching = rankings
    .map((rank, index) => ({ rank, index }))
    .filter(({ rank }) => rank.digits.includes(digit));
  return {
    labels: matching.map(({ rank }) => rank.label),
    style: matching.length > 0 ? RANK_STYLES[matching[0].index] : 'border-border bg-card text-card-foreground',
  };
}

function DigitTile({ digit, analysis }: { digit: TrackedDigit; analysis: MarketAnalyzerState }) {
  const movement = movementByDigit(analysis.digitMovements).get(digit);
  const rank = rankDetails(digit, analysis.rankings);
  const status = movement?.status ?? 'no-change';
  return (
    <div className={cn('min-w-0 rounded-xl border-2 p-3 shadow-sm', rank.style)}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-2xl font-black">{digit}</span>
        <div className="flex max-w-[75%] flex-wrap justify-end gap-1">
          {rank.labels.map((label) => <span key={label} className="rounded bg-background/70 px-1.5 py-0.5 text-[9px] font-bold uppercase">{label}</span>)}
        </div>
      </div>
      <p className="mt-2 font-mono text-sm font-bold">{analysis.digitCounts[digit] ?? 0} ticks</p>
      <p className="font-mono text-xs opacity-80">{(analysis.digitPercentages[digit] ?? 0).toFixed(1)}%</p>
      <div className={cn('mt-2 border-t border-current/15 pt-2 text-xs font-semibold', STATUS_STYLE[status])}>
        <p className="font-mono">{movement ? `${signed(movement.deltaCount)} / ${signed(movement.deltaPercentagePoints, 1)} pp` : '— / —'}</p>
        <p className="mt-1">{movement ? `${STATUS_ICON[status]} ${status === 'no-change' ? 'No change' : status === 'increase' ? 'Increase' : 'Decrease'}` : 'Comparison pending'}</p>
      </div>
    </div>
  );
}

function ConsensusLines({ movement }: { movement: GroupMovement }) {
  return (
    <div className="mt-2 space-y-0.5 text-[11px]">
      <p className="text-emerald-700 dark:text-emerald-400">Increase: {movement.consensus.increasing.join(', ') || 'None'}</p>
      <p className="text-rose-700 dark:text-rose-400">Decrease: {movement.consensus.decreasing.join(', ') || 'None'}</p>
      <p className="text-muted-foreground">No change: {movement.consensus.noChange.join(', ') || 'None'}</p>
    </div>
  );
}

function GroupCard({ title, digits, snapshot, movement }: {
  title: string; digits: string; snapshot: GroupSnapshot; movement: GroupMovement | null;
}) {
  const status = movement?.status ?? 'no-change';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold tracking-wide">{title}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{digits}</p></div>
          <span className={cn('text-xs font-bold', STATUS_STYLE[status])}>{movement ? `${STATUS_ICON[status]} ${status.replace('-', ' ')}` : 'Pending'}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><p className="text-[10px] uppercase text-muted-foreground">Current</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.groupCount}</p><p className="font-mono text-xs text-muted-foreground">{snapshot.groupPercentage.toFixed(1)}%</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">30-second change</p><p className={cn('mt-1 font-mono text-lg font-bold', STATUS_STYLE[status])}>{movement ? signed(movement.deltaCount) : '—'}</p><p className={cn('font-mono text-xs', STATUS_STYLE[status])}>{movement ? `${signed(movement.deltaPercentagePoints, 1)} pp` : '—'}</p></div>
        </div>
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-semibold">{movement?.consensus.label ?? 'First 30-second comparison is pending'}</p>
          {movement && <ConsensusLines movement={movement} />}
        </div>
      </CardContent>
    </Card>
  );
}

function comparisonStatus(analysis: MarketAnalyzerState): string {
  if (analysis.analyzerState === 'collecting') return 'Collecting sample';
  if (analysis.analyzerState === 'baseline') return 'Baseline · comparison pending';
  const movements = analysis.digitMovements ?? [];
  const up = movements.filter((item) => item.status === 'increase').length;
  const down = movements.filter((item) => item.status === 'decrease').length;
  return `${up} increased · ${down} decreased`;
}

function OverviewCard({ market, analysis, active, onClick }: {
  market: MarketTickState; analysis: MarketAnalyzerState; active: boolean; onClick: () => void;
}) {
  const rank = (index: number) => analysis.rankings[index]?.digits.join(', ') || '—';
  return (
    <button type="button" onClick={onClick} className={cn('w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md', active && 'border-primary ring-2 ring-primary/15')}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-semibold">{market.symbol.underlying_symbol_name}</p><p className="font-mono text-[11px] text-muted-foreground">{market.symbol.underlying_symbol}</p></div>
        <ConnectionBadge state={market.connectionState} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-y py-3 text-xs">
        <div><p className="text-muted-foreground">Quote</p><p className="mt-1 font-mono font-bold">{market.currentQuote === null ? '—' : market.currentQuote.toFixed(market.pipSize)}</p></div>
        <div><p className="text-muted-foreground">Last digit</p><p className="mt-1 font-mono font-bold text-primary">{market.lastDigit ?? '—'}</p></div>
        <div><p className="text-muted-foreground">Sample</p><p className="mt-1 font-mono font-bold">{analysis.tickCount} / 1,000</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <p>Most: <b>{rank(0)}</b></p><p>2nd Most: <b>{rank(1)}</b></p>
        <p>Least: <b>{rank(2)}</b></p><p>2nd Least: <b>{rank(3)}</b></p>
      </div>
      <p className="mt-3 text-[11px] font-medium text-muted-foreground">{comparisonStatus(analysis)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">Last comparison: {analysis.lastComparisonTime ? `${formatTime(analysis.lastComparisonTime)} Local time` : 'Pending'}</p>
    </button>
  );
}

function MovementTable({ analysis }: { analysis: MarketAnalyzerState }) {
  const movements = movementByDigit(analysis.digitMovements);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Digit</th><th className="p-3">Current</th><th className="p-3">Percentage</th><th className="p-3">30-sec count</th><th className="p-3">30-sec percentage</th><th className="p-3">Movement</th></tr></thead>
        <tbody>{TRACKED_DIGITS.map((digit) => {
          const movement = movements.get(digit); const status = movement?.status ?? 'no-change';
          return <tr key={digit} className="border-t"><td className="p-3 font-mono font-bold">{digit}</td><td className="p-3 font-mono">{analysis.digitCounts[digit]}</td><td className="p-3 font-mono">{analysis.digitPercentages[digit].toFixed(1)}%</td><td className={cn('p-3 font-mono', STATUS_STYLE[status])}>{movement ? signed(movement.deltaCount) : '—'}</td><td className={cn('p-3 font-mono', STATUS_STYLE[status])}>{movement ? `${signed(movement.deltaPercentagePoints, 1)} pp` : '—'}</td><td className={cn('p-3 font-semibold capitalize', STATUS_STYLE[status])}>{movement ? `${STATUS_ICON[status]} ${status.replace('-', ' ')}` : 'Pending'}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

export function AnalyzerDashboard(props: AnalyzerDashboardProps) {
  const [search, setSearch] = useState('');
  const detailRef = useRef<HTMLElement>(null);
  const visibleSymbols = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...props.symbols]
      .filter((symbol) => !query || symbol.underlying_symbol.toLowerCase().includes(query) || symbol.underlying_symbol_name.toLowerCase().includes(query))
      .sort((a, b) => a.underlying_symbol_name.localeCompare(b.underlying_symbol_name));
  }, [props.symbols, search]);
  const focusedMarket = props.focusedSymbol ? props.markets[props.focusedSymbol] : undefined;
  const focusedAnalysis = props.focusedSymbol ? props.analyses[props.focusedSymbol] : undefined;
  const openMarket = (symbol: string) => {
    props.focusSymbol(symbol);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <div className="min-h-dvh bg-muted/25">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Activity className="h-5 w-5" /></div><div><h1 className="text-sm font-bold sm:text-base">Deriv Multi-Symbol Digit Analyzer</h1><p className="text-[10px] text-muted-foreground">Live statistical monitor · analysis only</p></div></div>
          <div className="flex items-center gap-2"><ConnectionBadge state={props.connectionState} /><ThemeToggle /></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Markets</h2><p className="text-xs text-muted-foreground">{props.selectedSymbols.length} active scanned market{props.selectedSymbols.length === 1 ? '' : 's'}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => props.setSelectedSymbols([...new Set([...props.selectedSymbols, ...visibleSymbols.map((item) => item.underlying_symbol)])])}>Select all visible markets</Button><Button size="sm" variant="outline" onClick={() => props.setSelectedSymbols([])}>Clear all</Button></div></div>
            <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search markets" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>
            <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border p-2">
              {props.isLoadingSymbols ? <p className="p-2 text-sm text-muted-foreground">Loading available markets…</p> : visibleSymbols.map((symbol) => <label key={symbol.underlying_symbol} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={props.selectedSymbols.includes(symbol.underlying_symbol)} onChange={() => props.toggleSymbol(symbol.underlying_symbol)} className="h-4 w-4 accent-primary" /><span className="min-w-0 flex-1 truncate">{symbol.underlying_symbol_name}</span><span className="font-mono text-[10px] text-muted-foreground">{symbol.underlying_symbol}</span></label>)}
            </div>
            {props.symbolsError && <p className="mt-3 text-sm text-rose-600">{props.symbolsError}</p>}
          </CardContent>
        </Card>

        <section><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Live scanner</p><h2 className="mt-1 text-lg font-bold">Multi-Scan Overview</h2></div>
          {props.selectedSymbols.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Select one or more markets to start scanning.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.selectedSymbols.map((symbol) => {
            const market = props.markets[symbol]; const analysis = props.analyses[symbol];
            return market && analysis ? <OverviewCard key={symbol} market={market} analysis={analysis} active={symbol === props.focusedSymbol} onClick={() => openMarket(symbol)} /> : null;
          })}</div>}
        </section>

        {focusedMarket && focusedAnalysis && <section ref={detailRef} className="scroll-mt-20 space-y-5">
          <Card><CardContent className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{focusedMarket.symbol.underlying_symbol_name}</h2><ConnectionBadge state={focusedMarket.connectionState} /></div><p className="mt-1 font-mono text-xs text-muted-foreground">{focusedMarket.symbol.underlying_symbol}</p></div><Button size="sm" variant="outline" onClick={() => props.restartMarket(focusedMarket.symbol.underlying_symbol)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Restart history</Button></div>
            {focusedMarket.error && <p className="mt-3 text-sm text-rose-600">{focusedMarket.error}</p>}
            <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/60 p-3"><p className="text-[10px] uppercase text-muted-foreground">Live quote</p><p className="mt-1 font-mono text-xl font-bold">{focusedMarket.currentQuote === null ? '—' : focusedMarket.currentQuote.toFixed(focusedMarket.pipSize)}</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-[10px] uppercase text-muted-foreground">Current last digit</p><p className="mt-1 font-mono text-xl font-black text-primary">{focusedMarket.lastDigit ?? '—'}</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-[10px] uppercase text-muted-foreground">Rolling sample</p><p className="mt-1 font-mono text-xl font-bold">{focusedAnalysis.tickCount} / 1,000</p></div></div>
          </CardContent></Card>

          <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm shadow-sm sm:grid-cols-3"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Next comparison</p><p className="font-mono font-bold">{focusedAnalysis.analyzerState === 'collecting' ? 'Waiting for sample' : `in ${formatCountdown(focusedAnalysis.countdownSeconds)}`}</p></div></div><div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Monitor status</p><p className="font-semibold">{focusedAnalysis.analyzerState === 'baseline' ? 'Baseline captured. First 30-second comparison is pending.' : comparisonStatus(focusedAnalysis)}</p></div></div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><div><p className="text-xs text-muted-foreground">Last comparison</p><p className="font-semibold">{focusedAnalysis.lastComparisonTime ? `${formatTime(focusedAnalysis.lastComparisonTime)} Local time` : 'Pending'}</p></div></div></div>

          <div><h3 className="mb-3 font-bold">Ranking summary</h3><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((index) => <RankCard key={index} rank={focusedAnalysis.rankings[index]} index={index} />)}</div></div>
          <div><h3 className="mb-3 font-bold">Low & high group analysis</h3><div className="grid gap-3 md:grid-cols-2"><GroupCard title="LOW DIGITS" digits="0, 1, 2, 3" snapshot={focusedAnalysis.lowGroup} movement={focusedAnalysis.lowGroupMovement} /><GroupCard title="HIGH DIGITS" digits="6, 7, 8, 9" snapshot={focusedAnalysis.highGroup} movement={focusedAnalysis.highGroupMovement} /></div></div>
          <div><div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Digits 0–9</p><h3 className="mt-1 text-lg font-bold">Live Digit Distribution</h3></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold"><span className="text-emerald-600">● Green = Most</span><span className="text-cyan-600">● Blue = 2nd Most</span><span className="text-rose-600">● Red = Least</span><span className="text-amber-600">● Amber = 2nd Least</span><span className="text-muted-foreground">● Neutral = Other digits</span></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">{TRACKED_DIGITS.map((digit) => <DigitTile key={digit} digit={digit} analysis={focusedAnalysis} />)}</div></div>
          <div><h3 className="mb-3 font-bold">Full 30-second movement table</h3><MovementTable analysis={focusedAnalysis} /></div>
        </section>}
      </main>
      <footer className="mt-8 border-t bg-background px-4 py-5 text-center text-xs text-muted-foreground">Statistical monitor only. This is not a prediction or automatic trading signal.</footer>
    </div>
  );
}
