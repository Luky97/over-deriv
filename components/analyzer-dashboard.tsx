'use client';

import { useMemo } from 'react';
import {
  Activity,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CurrentTickDisplay } from '@/components/current-tick-display';
import { SymbolSelector } from '@/components/custom/symbol-selector';
import { ThemeToggle } from '@/components/custom/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TRACKED_DIGITS } from '@/lib/types';
import type { ActiveSymbol, Tick } from '@deriv/core';
import type {
  AnalyzerState,
  ConnectionState,
  DigitMovement,
  GroupMovement,
  GroupSnapshot,
  MovementStatus,
  RankGroup,
  TrackedDigit,
} from '@/lib/types';

export interface AnalyzerDashboardProps {
  connectionState: ConnectionState;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  lastDigit: number | null;
  pipSize: number;
  restartHistory: () => void;
  analyzerState: AnalyzerState;
  tickCount: number;
  digitCounts: number[];
  digitPercentages: number[];
  rankings: RankGroup[];
  lowGroup: GroupSnapshot;
  highGroup: GroupSnapshot;
  digitMovements: DigitMovement[] | null;
  lowGroupMovement: GroupMovement | null;
  highGroupMovement: GroupMovement | null;
  countdownSeconds: number;
  lastComparisonTime: number | null;
  baselineTime: number | null;
}

const STATUS_STYLES: Record<MovementStatus, string> = {
  increase: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  decrease: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'no-change': 'border-border bg-muted/60 text-muted-foreground',
};

const STATUS_TEXT_STYLES: Record<MovementStatus, string> = {
  increase: 'text-emerald-600 dark:text-emerald-400',
  decrease: 'text-rose-600 dark:text-rose-400',
  'no-change': 'text-muted-foreground',
};

const STATUS_ARROWS: Record<MovementStatus, string> = {
  increase: '↑',
  decrease: '↓',
  'no-change': '—',
};

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function formatPercentagePointDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pp`;
}

function movementLabel(status: MovementStatus): string {
  if (status === 'increase') return 'Increase';
  if (status === 'decrease') return 'Decrease';
  return 'No change';
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const settings: Record<ConnectionState, { label: string; style: string; pulse: boolean }> = {
    connected: {
      label: 'Connected',
      style: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      pulse: false,
    },
    connecting: {
      label: 'Connecting',
      style: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      pulse: true,
    },
    reconnecting: {
      label: 'Reconnecting',
      style: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      pulse: true,
    },
    offline: {
      label: 'Offline',
      style: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
      pulse: false,
    },
  };
  const setting = settings[state];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${setting.style}`}>
      {state === 'offline' ? (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Wifi className={`h-3.5 w-3.5 ${setting.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
      )}
      {setting.label}
    </span>
  );
}

function RankingCard({ rank, index }: { rank: RankGroup; index: number }) {
  const accentBars = [
    'from-violet-500/70 to-violet-500/0',
    'from-sky-500/70 to-sky-500/0',
    'from-rose-500/70 to-rose-500/0',
    'from-amber-500/70 to-amber-500/0',
  ];
  const accentText = [
    'text-violet-600 dark:text-violet-400',
    'text-sky-600 dark:text-sky-400',
    'text-rose-600 dark:text-rose-400',
    'text-amber-600 dark:text-amber-400',
  ];
  const hasRank = rank.digits.length > 0;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className={`h-1 bg-gradient-to-r ${accentBars[index]}`} />
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {rank.label}
        </p>
        {hasRank ? (
          <>
            <p className={`mt-3 font-mono text-2xl font-bold tracking-tight ${accentText[index]}`}>
              {rank.digits.join(', ')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{rank.count}</span> ticks
              <span className="mx-1.5">·</span>
              <span className="font-mono font-semibold text-foreground">{rank.percentage.toFixed(1)}%</span>
            </p>
          </>
        ) : (
          <p className="mt-3 text-2xl font-semibold text-muted-foreground">—</p>
        )}
      </CardContent>
    </Card>
  );
}

function ConsensusDetails({ movement }: { movement: GroupMovement }) {
  if (!movement.consensus.label.startsWith('Mixed')) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {movement.consensus.increasing.length > 0 && (
        <span className="text-emerald-600 dark:text-emerald-400">
          Increase: {movement.consensus.increasing.join(', ')}
        </span>
      )}
      {movement.consensus.decreasing.length > 0 && (
        <span className="text-rose-600 dark:text-rose-400">
          Decrease: {movement.consensus.decreasing.join(', ')}
        </span>
      )}
      {movement.consensus.noChange.length > 0 && (
        <span className="text-muted-foreground">
          No change: {movement.consensus.noChange.join(', ')}
        </span>
      )}
    </div>
  );
}

function GroupCard({
  name,
  digits,
  group,
  movement,
}: {
  name: 'Low' | 'High';
  digits: string;
  group: GroupSnapshot;
  movement: GroupMovement | null;
}) {
  const statusText = movement
    ? movement.status === 'increase'
      ? `${name} group increased`
      : movement.status === 'decrease'
        ? `${name} group decreased`
        : `No ${name.toLowerCase()} group change`
    : 'Comparison pending';

  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {name.toUpperCase()} DIGITS
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{digits}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${movement ? STATUS_STYLES[movement.status] : STATUS_STYLES['no-change']}`}>
            {movement ? STATUS_ARROWS[movement.status] : '•'} {statusText}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground sm:text-2xl">
              {group.groupCount} <span className="text-sm font-medium text-muted-foreground">ticks</span>
            </p>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {group.groupPercentage.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">5-minute change</p>
            {movement ? (
              <>
                <p className={`mt-1 font-mono text-xl font-bold sm:text-2xl ${STATUS_TEXT_STYLES[movement.status]}`}>
                  {formatDelta(movement.deltaCount)}
                </p>
                <p className={`mt-1 font-mono text-sm ${STATUS_TEXT_STYLES[movement.status]}`}>
                  {formatPercentagePointDelta(movement.deltaPercentagePoints)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xl font-semibold text-muted-foreground">—</p>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-border/70 pt-4">
          <p className="text-xs font-medium text-muted-foreground">Group consensus</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {movement?.consensus.label ?? 'First 5-minute comparison is pending'}
          </p>
          {movement && <ConsensusDetails movement={movement} />}
        </div>
      </CardContent>
    </Card>
  );
}

function MovementStatusBadge({ movement }: { movement: DigitMovement | null }) {
  if (!movement) {
    return (
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES['no-change']}`}>
        Pending
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[movement.status]}`}>
      {STATUS_ARROWS[movement.status]} {movementLabel(movement.status)}
    </span>
  );
}

interface DigitRowProps {
  digit: TrackedDigit;
  count: number;
  percentage: number;
  movement: DigitMovement | null;
}

function MobileDigitRow({ digit, count, percentage, movement }: DigitRowProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 font-mono text-base font-bold text-primary">
            {digit}
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Current sample</p>
            <p className="font-mono text-sm font-semibold">
              {count} ticks · {percentage.toFixed(1)}%
            </p>
          </div>
        </div>
        <MovementStatusBadge movement={movement} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">5-min count</p>
          <p className={`mt-1 font-mono font-semibold ${movement ? STATUS_TEXT_STYLES[movement.status] : 'text-muted-foreground'}`}>
            {movement ? formatDelta(movement.deltaCount) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">5-min percentage</p>
          <p className={`mt-1 font-mono font-semibold ${movement ? STATUS_TEXT_STYLES[movement.status] : 'text-muted-foreground'}`}>
            {movement ? formatPercentagePointDelta(movement.deltaPercentagePoints) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function DigitMovementTable({
  counts,
  percentages,
  movements,
}: {
  counts: number[];
  percentages: number[];
  movements: DigitMovement[] | null;
}) {
  const movementByDigit = useMemo(
    () => new Map(movements?.map((movement) => [movement.digit, movement]) ?? []),
    [movements]
  );

  return (
    <>
      <div className="space-y-3 md:hidden">
        {TRACKED_DIGITS.map((digit) => (
          <MobileDigitRow
            key={digit}
            digit={digit}
            count={counts[digit] ?? 0}
            percentage={percentages[digit] ?? 0}
            movement={movementByDigit.get(digit) ?? null}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border/70 md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Digit</th>
              <th className="px-4 py-3 text-right font-semibold">Count</th>
              <th className="px-4 py-3 text-right font-semibold">Current %</th>
              <th className="px-4 py-3 text-right font-semibold">5-min count</th>
              <th className="px-4 py-3 text-right font-semibold">5-min pp</th>
              <th className="px-4 py-3 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 bg-card">
            {TRACKED_DIGITS.map((digit) => {
              const movement = movementByDigit.get(digit) ?? null;
              return (
                <tr key={digit} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 font-mono font-bold text-primary">
                      {digit}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-semibold">
                    {counts[digit] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono">
                    {(percentages[digit] ?? 0).toFixed(1)}%
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-semibold ${movement ? STATUS_TEXT_STYLES[movement.status] : 'text-muted-foreground'}`}>
                    {movement ? formatDelta(movement.deltaCount) : '—'}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono ${movement ? STATUS_TEXT_STYLES[movement.status] : 'text-muted-foreground'}`}>
                    {movement ? formatPercentagePointDelta(movement.deltaPercentagePoints) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <MovementStatusBadge movement={movement} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AnalyzerDashboard({
  connectionState,
  isLoading,
  error,
  symbols,
  activeSymbol,
  selectSymbol,
  currentTick,
  lastDigit,
  pipSize,
  restartHistory,
  analyzerState,
  tickCount,
  digitCounts,
  digitPercentages,
  rankings,
  lowGroup,
  highGroup,
  digitMovements,
  lowGroupMovement,
  highGroupMovement,
  countdownSeconds,
  lastComparisonTime,
  baselineTime,
}: AnalyzerDashboardProps) {
  const isFullSample = tickCount === 1_000;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgb(var(--primary)/0.08),transparent_28rem)]">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight sm:text-lg">
                Deriv Digit Movement Analyzer
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Public live ticks · Rolling 1,000-tick sample
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConnectionBadge state={connectionState} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={restartHistory} className="shrink-0 bg-background/70">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry sample
            </Button>
          </div>
        )}

        <section aria-labelledby="live-market-heading">
          <SectionHeading eyebrow="Live market" title="Quote and sample" />
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardContent className="p-0">
              <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
                <div className="p-5 sm:p-6 lg:border-r lg:border-border/70">
                  <div className="flex items-center justify-between gap-3">
                    <label id="live-market-heading" className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Selected market / symbol
                    </label>
                    <Button variant="ghost" size="sm" onClick={restartHistory} disabled={!activeSymbol}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" /> Restart sample
                    </Button>
                  </div>
                  <div className="mt-3">
                    <SymbolSelector
                      symbols={symbols}
                      activeSymbol={activeSymbol}
                      onSymbolChange={selectSymbol}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono font-semibold text-foreground">
                      {activeSymbol?.underlying_symbol ?? '—'}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 font-semibold ${isFullSample ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                      {isFullSample
                        ? '1,000 / 1,000 ticks'
                        : `Collecting ticks: ${tickCount.toLocaleString()} / 1,000`}
                    </span>
                  </div>
                </div>

                <div className="flex min-h-44 items-center justify-center bg-muted/20 p-5 sm:p-6">
                  {isLoading && !currentTick && tickCount === 0 ? (
                    <div className="text-center">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" />
                      <p className="mt-3 text-sm text-muted-foreground">Loading public tick history…</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                        Current live quote
                      </p>
                      <CurrentTickDisplay
                        tick={currentTick}
                        lastDigit={lastDigit}
                        activeSymbol={activeSymbol}
                        pipSize={pipSize}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {!isFullSample ? (
          <Card className="border-dashed border-amber-500/35 bg-amber-500/[0.04] shadow-none">
            <CardContent className="flex flex-col items-center px-5 py-10 text-center">
              <Database className="h-7 w-7 text-amber-500" aria-hidden="true" />
              <p className="mt-3 font-semibold text-foreground">
                Collecting ticks: {tickCount.toLocaleString()} / 1,000
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Rankings and movement comparisons stay hidden until the full sample is ready.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section aria-labelledby="rankings-heading">
              <SectionHeading eyebrow="Distribution" title="Tracked digit rankings" />
              <div id="rankings-heading" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {rankings.map((rank, index) => (
                  <RankingCard key={rank.label} rank={rank} index={index} />
                ))}
              </div>
            </section>

            <section aria-labelledby="groups-heading">
              <SectionHeading eyebrow="Grouped movement" title="Low and high digits" />
              <div id="groups-heading" className="grid gap-4 lg:grid-cols-2">
                <GroupCard
                  name="Low"
                  digits="0, 1, 2, 3"
                  group={lowGroup}
                  movement={lowGroupMovement}
                />
                <GroupCard
                  name="High"
                  digits="6, 7, 8, 9"
                  group={highGroup}
                  movement={highGroupMovement}
                />
              </div>
            </section>

            <section aria-labelledby="monitor-heading">
              <SectionHeading eyebrow="Timed snapshot" title="Five-minute monitor" />
              <Card id="monitor-heading" className="border-border/80 shadow-sm">
                <CardContent className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Monitor status</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {analyzerState === 'baseline'
                          ? 'Baseline captured. First 5-minute comparison is pending.'
                          : 'Active — comparisons running'}
                      </p>
                      {baselineTime && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          Baseline: {formatTime(baselineTime)} Local time
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 sm:border-l sm:border-border/70 sm:pl-5">
                    <Activity className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Last snapshot</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                        Last comparison: {lastComparisonTime ? `${formatTime(lastComparisonTime)} Local time` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:border-l sm:border-border/70 sm:pl-5">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Next snapshot</p>
                      <p className="mt-1 font-mono text-lg font-bold text-primary">
                        Next comparison in {formatCountdown(countdownSeconds)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="movement-heading">
              <SectionHeading eyebrow="Individual movement" title="Tracked digit detail" />
              <Card id="movement-heading" className="border-border/80 shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <DigitMovementTable
                    counts={digitCounts}
                    percentages={digitPercentages}
                    movements={digitMovements}
                  />
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>

      <footer className="mt-4 border-t border-border/80 bg-background/85 px-4 py-5 text-center backdrop-blur">
        <p className="text-xs text-muted-foreground">
          Statistical monitor only. This is not a prediction or automatic trading signal.
        </p>
      </footer>
    </main>
  );
}
