import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Download, Printer, Target, Timer, TrendingUp, Trophy, Crosshair } from 'lucide-react';
import { summarize, historyCsv, type Answer } from './analytics';
import { categories, type Session } from './simulation';
import type { Profile } from './storage';
import type { PracticePlan } from './practice';
import { useT } from './i18n';

type Props = { practicePlan:PracticePlan; onPractice:()=>void; history: Session[]; profile: Profile; onProfile: (profile: Profile) => void; onOpenSession: (id: string) => void; onStart: () => void };
const pct = (value: number | null) => value === null ? '—' : `${Math.round(value*100)}%`;
const secs = (value: number | null) => value === null ? '—' : `${value.toFixed(1)} s`;
const W = 640, H = 220, PAD = { l: 34, r: 14, t: 14, b: 26 };

function ScoreTrend({ trend, onOpen }: { trend: ReturnType<typeof summarize>['trend']; onOpen: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD.l + (trend.length < 2 ? (W - PAD.l - PAD.r)/2 : i*(W - PAD.l - PAD.r)/(trend.length - 1));
  const y = (score: number) => PAD.t + (1 - score/100)*(H - PAD.t - PAD.b);
  const active = hover === null ? null : trend[hover];
  return <div className="trend-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score trend over ${trend.length} sessions`} onMouseLeave={() => setHover(null)}>
      {[0, 20, 40, 60, 80, 100].map(v => <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 80 ? 'trend-target' : 'trend-grid'} /><text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="trend-axis">{v}</text></g>)}
      <text x={W - PAD.r} y={y(80) - 5} textAnchor="end" className="trend-target-label">Readiness target 80</text>
      {trend.length > 1 && <polyline className="trend-line" points={trend.map((t, i) => `${x(i)},${y(t.score)}`).join(' ')} />}
      {active && hover !== null && <line className="trend-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />}
      {trend.map((t, i) => <g key={t.id}>
        <circle cx={x(i)} cy={y(t.score)} r={hover === i ? 6 : 4.5} className={t.correct ? 'trend-dot correct' : 'trend-dot missed'} />
        {/* Hit target wider than the mark. */}
        <rect x={x(i) - Math.max(8, (W - PAD.l - PAD.r)/Math.max(1, trend.length)/2)} width={Math.max(16, (W - PAD.l - PAD.r)/Math.max(1, trend.length))} y={PAD.t} height={H - PAD.t - PAD.b} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHover(i)} onClick={() => onOpen(t.id)}><title>{`Session ${i + 1}: ${t.score}/100`}</title></rect>
        {(trend.length <= 12 || i === trend.length - 1 || i % Math.ceil(trend.length/8) === 0) && <text x={x(i)} y={H - 8} textAnchor="middle" className="trend-axis">{i + 1}</text>}
      </g>)}
    </svg>
    {active && hover !== null && <div className="chart-tooltip" style={{ left: `${x(hover)/W*100}%`, top: `${y(active.score)/H*100}%` }}>
      <strong>{active.score}<small>/100</small></strong><span>Session {hover + 1} · {new Date(active.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><span>{active.category} · {active.correct ? 'identified' : 'not identified'}</span>
    </div>}
    <p className="chart-caption"><span className="legend-dot correct" />Correct identification <span className="legend-dot missed" />Missed or wrong · Select a point to open its debrief.</p>
  </div>;
}

export default function Progress({ history, practicePlan, onPractice, profile, onProfile, onOpenSession, onStart }: Props) {
  const summary = useMemo(() => summarize(history), [history]);
  const t = useT();
  const maxCell = Math.max(1, ...categories.flatMap(actual => Object.values(summary.confusion[actual])));
  const answers: Answer[] = [...categories, 'None'];
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([historyCsv(history)], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `trinetra-training-record${profile.name ? `-${profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : ''}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const level = summary.readiness.level;
  return <div className="progress-page">
    <header className="progress-head">
      <div><div className="eyebrow">{t('TRAINEE PROGRESS')}</div><h2>{t('Training record')}</h2><p>Computed from the last {history.length || 'no'} session{history.length === 1 ? '' : 's'} stored in this browser (up to 20).</p></div>
      <div className="profile-fields">
        <label><span className="section-label">{t('TRAINEE')}</span><input value={profile.name} maxLength={60} placeholder="Name" onChange={e => onProfile({ ...profile, name: e.target.value })} /></label>
        <label><span className="section-label">{t('UNIT / ID')}</span><input value={profile.unit} maxLength={60} placeholder="Unit or service number" onChange={e => onProfile({ ...profile, unit: e.target.value })} /></label>
      </div>
      <div className="progress-actions"><button className="text-button" disabled={!history.length} onClick={exportCsv}><Download size={14} />{t('Export CSV')}</button><button className="text-button" onClick={() => window.print()}><Printer size={14} />{t('Print record')}</button></div>
    </header>
    <div className="print-only print-meta">Trainee: {profile.name || '—'} · Unit/ID: {profile.unit || '—'} · Generated {new Date().toLocaleString()}</div>
    <section className="practice-plan" aria-label="Adaptive practice recommendation"><div><span className="section-label">{t('TARGETED PRACTICE')} · {t(practicePlan.focus)}</span><h3>{t('Your next exercise')}</h3><p>{practicePlan.reason}</p><small>{practicePlan.evidence}</small><small>{t('Rule-based recommendation')} · {t(practicePlan.difficulty==='guided'?'Guided':'Challenge')} · {t(practicePlan.dusk?'Dusk':'Day')} · Seed {practicePlan.seed}</small></div><button className="primary-button" onClick={onPractice}>{t('Set up targeted practice')}</button></section>
    {!history.length ? <div className="empty-state"><Crosshair size={28} /><h3>{t('No sessions yet')}</h3><p>Complete an exercise and its debrief to start building a training record.</p><button className="primary-button" onClick={onStart}>{t('Go to exercise')}</button></div> : <>
      <section className="kpi-row" aria-label="Key figures">
        <div className="kpi"><span>{t('Sessions')}</span><strong>{summary.sessions}</strong><small>Best {summary.bestScore}/100</small></div>
        <div className="kpi"><span><TrendingUp size={13} />{t('Mean score')}</span><strong>{summary.meanScore === null ? '—' : Math.round(summary.meanScore)}</strong><small>out of 100</small></div>
        <div className="kpi"><span><Target size={13} />{t('Identification')}</span><strong>{pct(summary.accuracy)}</strong><small>correct classifications</small></div>
        <div className="kpi"><span><Timer size={13} />{t('Time to observe')}</span><strong>{secs(summary.meanResponse)}</strong><small>mean after arrival · {pct(summary.observationRate)} observed</small></div>
        <div className={`kpi readiness-kpi level-${level.replace(' ', '-').toLowerCase()}`}><span><Trophy size={13} />{t('Practice readiness')}</span><strong>{t(level)}</strong><small>{summary.readiness.met} of {summary.readiness.criteria.length} milestones</small></div>
      </section>
      <div className="progress-grid">
        <section className="progress-card span-2"><h3>{t('Score trend')}</h3><ScoreTrend trend={summary.trend} onOpen={onOpenSession} /></section>
        <section className="progress-card"><h3>{t('Milestones')}</h3><ul className="criteria">{summary.readiness.criteria.map(c => <li key={c.label} className={c.met ? 'met' : ''}>{c.met ? <CheckCircle2 size={16} aria-label="Met" /> : <Circle size={16} aria-label="Not met" />}<div><strong>{c.label}</strong><span>{c.detail}</span></div></li>)}</ul>
          <p className="chart-caption">Illustrative practice targets, not an operational qualification.</p></section>
        <section className="progress-card span-2"><h3>{t('Identification matrix')}</h3>
          <div className="table-scroll"><table className="confusion"><caption>One entry per track (or legacy encounter). Rows: present. Columns: reported.</caption>
            <thead><tr><th scope="col">Present ↓ / Reported →</th>{answers.map(a => <th key={a} scope="col">{a === 'None' ? 'No answer' : a}</th>)}</tr></thead>
            <tbody>{categories.map(actual => <tr key={actual}><th scope="row">{actual}</th>{answers.map(a => { const n = summary.confusion[actual][a]; return <td key={a} className={a === actual ? 'diagonal' : ''} style={{ ['--fill' as string]: n/maxCell }} title={`${actual} reported as ${a === 'None' ? 'no answer' : a}: ${n}`}>{n}</td>; })}</tr>)}</tbody>
          </table></div></section>
        <section className="progress-card"><h3>{t('By category')}</h3><table className="data-table"><thead><tr><th scope="col">Category</th><th scope="col">Decisions</th><th scope="col">Correct</th><th scope="col">Observe</th></tr></thead>
          <tbody>{summary.byCategory.map(row => <tr key={row.category}><th scope="row">{row.category}</th><td>{row.sessions}</td><td><span className="inline-bar"><i style={{ width: `${(row.accuracy ?? 0)*100}%` }} /></span>{pct(row.accuracy)}</td><td>{secs(row.meanResponse)}</td></tr>)}</tbody></table></section>
        <section className="progress-card span-3"><h3>{t('By theatre')}</h3><div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Theatre</th><th scope="col">Runs</th><th scope="col">Mean score</th><th scope="col">Correct</th></tr></thead>
          <tbody>{summary.byTheatre.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.sessions}</td><td>{row.meanScore === null ? '—' : Math.round(row.meanScore)}</td><td><span className="inline-bar"><i style={{ width: `${row.accuracy*100}%` }} /></span>{pct(row.accuracy)}</td></tr>)}</tbody></table></div></section>
        <section className="progress-card span-3"><h3>{t('By conditions')}</h3><div className="conditions">{summary.byCondition.map(c => <div key={`${c.difficulty}-${c.lighting}`} className={c.sessions ? '' : 'empty'}>
          <span className="section-label">{c.difficulty === 'guided' ? 'GUIDED' : 'CHALLENGE'} · {c.lighting.toUpperCase()}</span>
          <strong>{c.meanScore === null ? '—' : Math.round(c.meanScore)}</strong><small>{c.sessions ? `mean score · ${c.sessions} run${c.sessions === 1 ? '' : 's'} · ${pct(c.accuracy)} correct` : 'Not practised yet'}</small></div>)}</div></section>
      </div>
      <p className="rubric">Scores and milestones use the illustrative practice rubric shown in each debrief. Encounters are synthetic; this record is not a measure of operational sensor or operator performance.</p>
    </>}
  </div>;
}
