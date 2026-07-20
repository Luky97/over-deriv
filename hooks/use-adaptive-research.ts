import { useEffect, useRef, useState } from 'react';
import type { MarketTickState } from '../lib/types';
import type { ContractPrediction, VirtualRound, VirtualContractResult, TriggerMode } from '../lib/ml-types';
import { advanceSequence, type SkipSequenceState } from '../lib/simulation/skip-buy-scheduler';
import { evaluateRoundStatus, isTargetMet } from '../lib/simulation/round-engine';
import { db } from '../lib/storage/database';

export interface MarketResearchState {
  market: string;
  prediction: ContractPrediction | null;
  features: any | null;
  sequence: SkipSequenceState;
  currentRound: VirtualRound | null;
}

export function useAdaptiveResearch(markets: Record<string, MarketTickState>, triggerMode: TriggerMode, triggerDigit: number) {
  const [researchState, setResearchState] = useState<Record<string, MarketResearchState>>({});
  const workerRef = useRef<Worker | null>(null);
  
  // Keep track of internal state for sequence tracking
  const internalState = useRef<Record<string, {
    sequence: SkipSequenceState;
    currentRound: VirtualRound | null;
    pendingPrediction: ContractPrediction | null;
  }>>({});

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/learning.worker.ts', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'TICK_PROCESSED') {
        setResearchState(prev => ({
          ...prev,
          [payload.market]: {
            ...prev[payload.market],
            market: payload.market,
            prediction: payload.prediction,
            features: payload.features,
            sequence: internalState.current[payload.market]?.sequence || 'WAITING_FOR_TRIGGER',
            currentRound: internalState.current[payload.market]?.currentRound || null
          }
        }));
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Process ticks
  useEffect(() => {
    for (const [marketId, marketState] of Object.entries(markets)) {
      if (!marketState.currentTick || marketState.prices.length < 1000) continue;

      if (!internalState.current[marketId]) {
        internalState.current[marketId] = {
          sequence: 'WAITING_FOR_TRIGGER',
          currentRound: null,
          pendingPrediction: null
        };
      }

      const state = internalState.current[marketId];
      const tick = marketState.currentTick;
      const digit = marketState.lastDigit!;
      
      // Update ML worker
      workerRef.current?.postMessage({
        type: 'PROCESS_TICK',
        payload: { market: marketId, quotes: marketState.prices, pipSize: marketState.pipSize }
      });

      // Simulation Engine Loop
      const isTrigger = triggerMode === 'Digit' ? digit === triggerDigit : false; // Auto trigger logic goes here
      
      const prevSequence = state.sequence;
      state.sequence = advanceSequence({ sequence: state.sequence, contractsFinished: state.currentRound?.contracts.length || 0, results: [], lastTickEpoch: tick.epoch }, isTrigger);

      if (state.sequence === 'SKIP_1' && prevSequence === 'WAITING_FOR_TRIGGER') {
        // Create new round
        state.currentRound = {
          id: Math.random().toString(36).substring(7),
          market: marketId,
          triggerType: triggerMode,
          triggerDigit: triggerMode === 'Digit' ? triggerDigit : undefined,
          triggerEpoch: tick.epoch,
          contracts: [],
          status: 'IN_PROGRESS',
          regime: 'UNSTABLE',
          startTime: Date.now()
        };
      }

      if (state.sequence === 'WAITING_FOR_BUY_1' || state.sequence === 'WAITING_FOR_BUY_2' || state.sequence === 'WAITING_FOR_BUY_3' || state.sequence === 'WAITING_FOR_BUY_4' || state.sequence === 'WAITING_FOR_BUY_5') {
         // This is the buy resolution tick
         if (state.pendingPrediction && state.currentRound) {
            const isWin = isTargetMet(state.pendingPrediction.target, digit);
            const contractRes: VirtualContractResult = {
              prediction: state.pendingPrediction,
              actualDigit: digit,
              isWin,
              tickEpoch: tick.epoch
            };
            
            state.currentRound.contracts.push(contractRes);
            
            workerRef.current?.postMessage({
              type: 'SETTLE_CONTRACT',
              payload: { market: marketId, quotes: marketState.prices, pipSize: marketState.pipSize, actualDigit: digit, isWin }
            });

            // Check round status
            state.currentRound.status = evaluateRoundStatus(state.currentRound.contracts);
            if (state.currentRound.status !== 'IN_PROGRESS') {
               state.sequence = 'ROUND_COMPLETE';
               db.rounds.add({...state.currentRound});
               state.currentRound = null;
            }
         }
      }

      if (state.sequence === 'PREDICT_FROZEN' || state.sequence === 'SKIP_2' || state.sequence === 'SKIP_3' || state.sequence === 'SKIP_4' || state.sequence === 'SKIP_5') {
         // Freeze the prediction from current research state
         const rState = researchState[marketId];
         if (rState?.prediction) {
            state.pendingPrediction = rState.prediction;
         }
      }
      
      // Update UI state
      setResearchState(prev => ({
        ...prev,
        [marketId]: {
          ...(prev[marketId] || {}),
          sequence: state.sequence,
          currentRound: state.currentRound
        }
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets]);

  return researchState;
}
