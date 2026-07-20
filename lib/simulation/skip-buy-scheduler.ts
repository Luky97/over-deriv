import type { SchedulerPhase } from '@/lib/types';

export type SchedulerAction = 'NONE' | 'TRIGGER' | 'SKIP_AND_FREEZE' | 'SETTLE';

export interface SchedulerStep {
  action: SchedulerAction;
  nextPhase: SchedulerPhase;
}

/**
 * One call represents exactly one newly observed live tick.
 * WAITING(trigger) -> SKIP; SKIP(next tick) -> BUY; BUY(next tick) -> SKIP/COMPLETE.
 */
export function advanceScheduler(
  phase: SchedulerPhase,
  trigger: boolean,
  roundWillComplete = false,
): SchedulerStep {
  if (phase === 'WAITING') return trigger
    ? { action: 'TRIGGER', nextPhase: 'SKIP' }
    : { action: 'NONE', nextPhase: 'WAITING' };
  if (phase === 'SKIP') return { action: 'SKIP_AND_FREEZE', nextPhase: 'BUY' };
  if (phase === 'BUY') return {
    action: 'SETTLE',
    nextPhase: roundWillComplete ? 'COMPLETE' : 'SKIP',
  };
  return { action: 'NONE', nextPhase: 'WAITING' };
}
