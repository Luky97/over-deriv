export type PredictionTarget = 'EVEN' | 'ODD' | 'OVER_3' | 'UNDER_7';

export type TriggerMode = 'Digit' | 'Automatic';

export type LearningMode = 
  | 'COLLECTING' 
  | 'SILENT_LEARNING' 
  | 'QUALIFYING' 
  | 'ACTIVE_VIRTUAL' 
  | 'COOLDOWN' 
  | 'RECOVERY';

export type RegimeLabel = 
  | 'EVEN_DOMINANT' 
  | 'ODD_DOMINANT' 
  | 'OVER3_DOMINANT' 
  | 'UNDER7_DOMINANT' 
  | 'MIXED' 
  | 'HIGH_ENTROPY' 
  | 'LOW_ENTROPY' 
  | 'TRANSITION' 
  | 'UNSTABLE';

export type VirtualAction = 'TRADE' | 'NO_TRADE';

export interface ContractPrediction {
  target: PredictionTarget;
  probability: number;
  confidence: number;
  virtualAction: VirtualAction;
  modelVotes: Record<string, number>;
  rejectionReason?: string;
  featuresSnapshotId: string;
}

export interface VirtualContractResult {
  prediction: ContractPrediction;
  actualDigit: number;
  isWin: boolean;
  tickEpoch: number;
}

export interface VirtualRound {
  id: string;
  market: string;
  triggerType: TriggerMode;
  triggerDigit?: number;
  triggerEpoch: number;
  contracts: VirtualContractResult[];
  status: 'IN_PROGRESS' | 'WIN' | 'LOSS' | 'INVALIDATED';
  regime: RegimeLabel;
  startTime: number;
}

export interface ModelMetrics {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}
