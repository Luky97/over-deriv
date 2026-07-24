import { z } from 'zod';

export const MarketSymbolSchema = z.enum(['R_10', 'R_25', 'R_50', 'R_75', 'R_100']);

export const PredictionTargetSchema = z.enum(['EVEN', 'ODD', 'OVER_3', 'UNDER_7']);

export const CompactCloudCheckpointSchema = z.object({
  version: z.number().int().positive(),
  symbol: MarketSymbolSchema,
  savedAt: z.string(),
  continuity: z.object({
    lastProcessedEpoch: z.number().int().nullable(),
    lastProcessedQuote: z.number().nullable(),
    lastProcessedDigit: z.number().int().nullable(),
    totalTicksProcessed: z.number().int().nonnegative(),
  }),
  modelParameters: z.record(z.string(), z.unknown()),
  normalizationState: z.record(z.string(), z.unknown()),
  transitionState: z.record(z.string(), z.unknown()),
  confidenceState: z.record(z.string(), z.unknown()),
  regimeState: z.record(z.string(), z.unknown()),
  strategyState: z.record(z.string(), z.unknown()),
  formulaState: z.record(z.string(), z.unknown()),
  aggregateMetrics: z.record(z.string(), z.unknown()),
  schedulerState: z.record(z.string(), z.unknown()),
  activeRound: z.record(z.string(), z.unknown()).nullable(),
  recentContextDigits: z.array(z.number().int()).max(100),
});

export const ResearchSettingsSchema = z.object({
  enabledMarkets: z.array(MarketSymbolSchema),
  triggerMode: z.enum(['DIGIT', 'AUTOMATIC']),
  triggerDigit: z.number().int().min(0).max(9),
  activeConfidenceThreshold: z.number().min(0).max(100),
  minimumShadowSamples: z.number().int().min(1),
  maximumContractsPerRound: z.number().int().min(1).max(10),
  requiredWins: z.number().int().min(1).max(10),
  consecutiveLossStop: z.number().int().min(1).max(10),
  enabledTargets: z.object({
    EVEN: z.boolean(), ODD: z.boolean(), OVER_3: z.boolean(), UNDER_7: z.boolean(),
  }),
  formulaExperimentsEnabled: z.boolean(),
  automaticChallengersEnabled: z.boolean(),
});

export type ValidatedCheckpoint = z.infer<typeof CompactCloudCheckpointSchema>;
export type ValidatedSettings = z.infer<typeof ResearchSettingsSchema>;
