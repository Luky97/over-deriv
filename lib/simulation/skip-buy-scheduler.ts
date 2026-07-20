import type { VirtualContractResult } from '../ml-types';

export type SkipSequenceState = 
  | 'WAITING_FOR_TRIGGER' 
  | 'SKIP_1' 
  | 'PREDICT_FROZEN' 
  | 'WAITING_FOR_BUY_1' 
  | 'SKIP_2' 
  | 'WAITING_FOR_BUY_2'
  | 'SKIP_3'
  | 'WAITING_FOR_BUY_3'
  | 'SKIP_4'
  | 'WAITING_FOR_BUY_4'
  | 'SKIP_5'
  | 'WAITING_FOR_BUY_5'
  | 'ROUND_COMPLETE';

export interface SchedulerState {
  sequence: SkipSequenceState;
  contractsFinished: number;
  results: VirtualContractResult[];
  lastTickEpoch: number | null;
}

export function advanceSequence(state: SchedulerState, isTrigger: boolean): SkipSequenceState {
  switch (state.sequence) {
    case 'WAITING_FOR_TRIGGER':
      return isTrigger ? 'SKIP_1' : 'WAITING_FOR_TRIGGER';
      
    case 'SKIP_1': return 'PREDICT_FROZEN';
    case 'PREDICT_FROZEN': return 'WAITING_FOR_BUY_1';
    case 'WAITING_FOR_BUY_1': return 'SKIP_2';
    case 'SKIP_2': return 'WAITING_FOR_BUY_2';
    case 'WAITING_FOR_BUY_2': return 'SKIP_3';
    case 'SKIP_3': return 'WAITING_FOR_BUY_3';
    case 'WAITING_FOR_BUY_3': return 'SKIP_4';
    case 'SKIP_4': return 'WAITING_FOR_BUY_4';
    case 'WAITING_FOR_BUY_4': return 'SKIP_5';
    case 'SKIP_5': return 'WAITING_FOR_BUY_5';
    case 'WAITING_FOR_BUY_5': return 'ROUND_COMPLETE';
    case 'ROUND_COMPLETE': return 'WAITING_FOR_TRIGGER';
    
    default:
      return 'WAITING_FOR_TRIGGER';
  }
}
