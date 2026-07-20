import { clamp } from '@/lib/features/statistics';

export interface TradeContext {
  probability: number;
  standardizedEdge: number;
  agreement: number;
  recentWinRate: number;
  regimeStability: number;
  similarContextSuccess: number;
  sampleSizeCap: number;
  calibrationScore: number;
  driftScore: number;
  consecutiveLosses: number;
  automaticTrigger: boolean;
  baseRate: number;
}

export interface NoTradeState {
  weights: number[];
  bias: number;
  updates: number;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function vector(context: TradeContext): number[] {
  return [
    context.probability,
    context.standardizedEdge,
    context.agreement,
    context.recentWinRate,
    context.regimeStability,
    context.similarContextSuccess,
    context.sampleSizeCap,
    context.calibrationScore,
    context.driftScore,
    Math.min(1, context.consecutiveLosses / 3),
    context.automaticTrigger ? 1 : 0,
    context.baseRate,
  ];
}

export class NoTradeMetaModel {
  private state: NoTradeState = {
    weights: [0.4, 0.8, 0.5, 0.7, 0.6, 0.5, 0.6, 0.5, -1, -1.2, -0.1, -0.4],
    bias: -2.2,
    updates: 0,
  };

  predict(context: TradeContext): number {
    const values = vector(context);
    const score = values.reduce((sum, value, index) => sum + value * (this.state.weights[index] ?? 0), this.state.bias);
    return clamp(sigmoid(score));
  }

  update(context: TradeContext, won: boolean): void {
    const values = vector(context);
    const probability = this.predict(context);
    const error = Number(won) - probability;
    const learningRate = 0.04 / Math.sqrt(1 + this.state.updates / 100);
    this.state.weights = values.map((value, index) =>
      (this.state.weights[index] ?? 0) * (1 - learningRate * 0.001) + learningRate * error * value);
    this.state.bias += learningRate * error;
    this.state.updates += 1;
  }

  serialize(): NoTradeState { return structuredClone(this.state); }
  restore(state: NoTradeState | undefined): void {
    if (state?.weights?.length === 12 && Number.isFinite(state.bias)) this.state = state;
  }
}
