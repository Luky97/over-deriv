'use client';

import { useMemo, useState } from 'react';
import type { LogCategory, MarketResearchView } from '@/lib/types';
import { displayEnum, serverTime } from './format';

export function ResearchLogs({ research }: { research: MarketResearchView }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | LogCategory>('ALL');
  const logs = useMemo(() => research.logs.filter((log) => (category === 'ALL' || log.category === category) && log.message.toLowerCase().includes(query.toLowerCase())), [category, query, research.logs]);
  const categories: Array<'ALL' | LogCategory> = ['ALL', 'TICK', 'PREDICTION', 'SKIP', 'CONTRACT', 'ROUND', 'MODEL', 'CONFIDENCE', 'DRIFT', 'STRATEGY', 'CONNECTION', 'STORAGE', 'ERROR'];
  return <section className="panel-block"><div className="panel-heading flex-wrap"><div><p className="eyebrow">Auditable event history</p><h3>Research logs</h3></div><div className="flex flex-wrap gap-2"><input className="control-input" placeholder="Search logs" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="control-input" value={category} onChange={(event) => setCategory(event.target.value as 'ALL' | LogCategory)}>{categories.map((item) => <option key={item} value={item}>{displayEnum(item)}</option>)}</select></div></div><div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-white/5">{logs.length ? logs.map((log) => <div key={log.id} className="log-line"><time>{serverTime(log.epoch)}</time><span>{log.category}</span><p>{log.message}</p></div>) : <div className="empty-state">No matching logs.</div>}</div></section>;
}
