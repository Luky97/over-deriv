import type { ActiveSymbol, Tick } from '@deriv/core';

// Re-export shared trading types from @deriv/core
export type {
  ActiveSymbol,
  Tick,
  TicksHistoryResponse,
  ContractsForResponse,
  ContractInfo,
  DurationLimits,
  ProposalResponse,
  ProposalInfo,
  BuyResponse,
  BuyResult,
} from '@deriv/core';

// Re-export shared position types from shared hooks
export type { OpenPosition } from '@/hooks/use-open-positions';
export type { ClosedPosition } from '@/hooks/use-closed-positions';
export type { PositionFilter } from '@/components/custom/positions-table';

// ML and Engine types
export * from './ml-types';

// Digit-specific types

export type ContractMode =
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITEVEN'
  | 'DIGITODD';

export type TradeType = 'matches-differs' | 'over-under' | 'even-odd';

export interface DigitStats {
  /** Count of each digit 0-9 from tick history */
  counts: number[];
  /** Percentage of each digit 0-9 */
  percentages: number[];
  /** Total number of ticks analyzed */
  totalTicks: number;
}

/** Every displayed last digit. */
export const TRACKED_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type TrackedDigit = (typeof TRACKED_DIGITS)[number];

export const LOW_DIGITS = [0, 1, 2, 3] as const;
export const HIGH_DIGITS = [6, 7, 8, 9] as const;

export type MovementStatus = 'increase' | 'decrease' | 'no-change';

export type AnalyzerState = 'collecting' | 'baseline' | 'active';
export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';
export type MarketConnectionState = ConnectionState | 'error';

/** Frozen group totals for low or high digits. */
export interface GroupSnapshot {
  groupCount: number;
  groupPercentage: number;
}

/** Frozen analyzer sample at a point in time. */
export interface DigitSnapshot {
  /** Counts and percentages for digits 0–9. */
  counts: readonly number[];
  percentages: readonly number[];
  totalTicks: number;
  lowGroup: GroupSnapshot;
  highGroup: GroupSnapshot;
  timestamp: number;
}

/** Per-digit values frozen at the most recent completed comparison. */
export interface DigitMovement {
  digit: TrackedDigit;
  currentCount: number;
  currentPercentage: number;
  deltaCount: number;
  deltaPercentagePoints: number;
  status: MovementStatus;
}

/** Detailed consensus result for a tracked group. */
export interface ConsensusResult {
  label: string;
  increasing: TrackedDigit[];
  decreasing: TrackedDigit[];
  noChange: TrackedDigit[];
}

/** Group-level values frozen at the most recent completed comparison. */
export interface GroupMovement {
  digits: readonly TrackedDigit[];
  currentCount: number;
  currentPercentage: number;
  deltaCount: number;
  deltaPercentagePoints: number;
  status: MovementStatus;
  consensus: ConsensusResult;
}

/** Ranking card data; digits contains every tied member. */
export interface RankGroup {
  label: string;
  digits: TrackedDigit[];
  count: number;
  percentage: number;
}

/** A symbol's isolated rolling tick stream. */
export interface MarketTickState {
  symbol: ActiveSymbol;
  connectionState: MarketConnectionState;
  prices: number[];
  currentTick: Tick | null;
  currentQuote: number | null;
  lastDigit: number | null;
  pipSize: number;
  sessionKey: string;
  isLoading: boolean;
  error: string | null;
}

/** Current and frozen interval analysis for one market. */
export interface MarketAnalyzerState {
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

export type MultiScanState = Record<string, MarketAnalyzerState>;
