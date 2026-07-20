import type { MarketResearchView, TimelineEvent, VirtualRound } from '@/lib/types';
import { displayEnum, displayTarget, percent, serverTime } from './format';

function Timeline({ events }: { events: TimelineEvent[] }) {
  return <div className="timeline">{events.map((event) => <div key={event.id} className={`timeline-event timeline-${event.stage.toLowerCase().replaceAll('_', '-')}`}><span>{serverTime(event.epoch)}</span><i /> <div><strong>{displayEnum(event.stage)}</strong><small>{event.detail}</small></div>{event.digit !== undefined && <b>{event.digit}</b>}</div>)}</div>;
}

function RoundRow({ round }: { round: VirtualRound }) {
  const wins = round.contracts.filter((contract) => contract.outcome === 'WIN').length;
  return <details className="round-row"><summary><span>#{round.roundNumber}</span><strong>{displayEnum(round.status)}</strong><span>{displayEnum(round.executionKind)}</span><span>{wins}W / {round.contracts.length - wins}L</span><span>{displayEnum(round.regime)}</span></summary><div className="grid gap-4 border-t border-white/5 p-4 lg:grid-cols-2"><div><p className="text-sm text-slate-400">Trigger {displayEnum(round.triggerType)} · epoch {round.triggerEpoch} · strategy {round.strategyId}</p><div className="mt-3 space-y-2">{round.contracts.map((contract) => <div key={contract.id} className="contract-line"><span>{displayTarget(contract.prediction.target)}</span><span>{percent(contract.prediction.probability)}</span><span>digit {contract.actualDigit}</span><strong className={contract.outcome === 'WIN' ? 'text-emerald-300' : 'text-rose-300'}>{contract.outcome}</strong></div>)}</div></div><Timeline events={round.timeline} /></div></details>;
}

export function VirtualRoundPanel({ research }: { research: MarketResearchView }) {
  const current = research.currentRound;
  return <div className="space-y-5">
    <section className="panel-block">
      <div className="panel-heading"><div><p className="eyebrow">Exact execution scheduler</p><h3>{current ? `${displayEnum(current.executionKind)} round #${current.roundNumber}` : 'Waiting for a qualified trigger'}</h3></div><span className="stage-pill">{research.schedulerPhase}</span></div>
      <div className="execution-flow mt-5"><span>TRIGGER</span><i>→</i><span>SKIP</span><i>→</i><span>FROZEN</span><i>→</i><span>VIRTUAL BUY</span><i>→</i><span>SKIP</span><i>→</i><span>…</span></div>
      <p className="mt-3 text-xs text-slate-500">The immediate tick after a trigger is always skipped. Features freeze only after that skipped tick; the following tick settles the virtual contract.</p>
      {current && <div className="mt-5"><Timeline events={current.timeline} /></div>}
    </section>
    <section className="panel-block">
      <div className="panel-heading"><div><p className="eyebrow">Forward-test history</p><h3>Virtual rounds</h3></div><span className="text-sm text-slate-400">Shadow and active results remain separate</span></div>
      <div className="mt-4 space-y-2">{research.recentRounds.length ? research.recentRounds.map((round) => <RoundRow key={round.id} round={round} />) : <div className="empty-state">No completed rounds have settled yet.</div>}</div>
    </section>
    <div className="grid gap-4 lg:grid-cols-3">
      {(['SHADOW', 'ACTIVE_VIRTUAL', 'FORMULA_EXPERIMENT'] as const).map((kind) => { const bucket = research.metrics.rounds[kind]; return <div className="metric-tile" key={kind}><span>{displayEnum(kind)} rounds</span><strong>{bucket.total}</strong><small>{bucket.wins} wins · {bucket.losses} losses · {bucket.invalidated} invalidated · {bucket.winRate ? percent(bucket.winRate) : '—'}</small></div>; })}
    </div>
  </div>;
}
