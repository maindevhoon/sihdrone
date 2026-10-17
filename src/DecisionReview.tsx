import { useState } from 'react';
import { ArrowUpRight, Check, Circle, EyeOff, Minus, X } from 'lucide-react';
import { decisionRows, type DecisionOutcome } from './reviewEvidence';
import { trackLabel, type Session } from './simulation';
import { useT } from './i18n';

const outcomes = [
  {id: 'all', label: 'All decisions'},
  {id: 'missed', label: 'Missed'},
  {id: 'unclassified', label: 'Unclassified'},
  {id: 'incorrect', label: 'Incorrect'},
  {id: 'correct', label: 'Correct'},
] as const;
const outcomeDetails = {
  missed: {label: 'Missed', icon: EyeOff},
  unclassified: {label: 'Unclassified', icon: Minus},
  incorrect: {label: 'Incorrect', icon: X},
  correct: {label: 'Correct', icon: Check},
};

export default function DecisionReview({session, onReplay}: {session: Session; onReplay: (track: number, time: number) => void}) {
  const [filter, setFilter] = useState<DecisionOutcome | 'all'>('all');
  const t = useT();
  const rows = decisionRows(session);
  const visible = rows.filter(row => filter === 'all' || row.outcome === filter).length;
  return <section className="decision-review" aria-label={t('Decision review')}>
    <header className="decision-review-heading"><div><span className="section-label">{t('A CLOSER LOOK')}</span><h3>{t('Review your decisions')}</h3></div><span className="decision-count" role="status">{visible}/{rows.length} {t('shown')}</span></header>
    <div className="decision-filters" role="group" aria-label={t('Filter decisions')}>
      {outcomes.map(option => <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
        {t(option.label)}<span>{option.id === 'all' ? rows.length : rows.filter(row => row.outcome === option.id).length}</span>
      </button>)}
    </div>
    <div className="table-scroll track-review"><table className="data-table">
      <caption>{t('Ground truth is revealed after the exercise. Replay opens the selected track at its recorded decision, paused. Missed tracks open at arrival.')}</caption>
      <thead><tr>{['Track', 'Present', 'Reported', 'Observe', 'Score', 'Outcome', 'Replay'].map(label => <th key={label} scope="col" className={label === 'Replay' ? 'decision-replay-action' : undefined}>{t(label)}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const {label, icon: Icon} = outcomeDetails[row.outcome];
        return <tr key={row.id} data-outcome={row.outcome} data-filtered={filter !== 'all' && filter !== row.outcome}>
          <th scope="row">{session.version === 2 ? trackLabel(row.id) : t('Encounter')}</th>
          <td data-label={t('Present')}>{t(row.category)}</td><td data-label={t('Reported')}>{row.answer ? t(row.answer) : t('No answer')}</td>
          <td data-label={t('Observe')}>{row.response === null ? '—' : `${row.response.toFixed(1)}s`}</td><td data-label={t('Score')}>{row.score}<small>/100</small></td>
          <td data-label={t('Outcome')}><span className={`decision-outcome outcome-${row.outcome}`}><Icon size={12}/>{t(label)}</span></td>
          <td className="decision-replay-action"><button className="decision-jump" disabled={!row.canReplayContact}
            aria-label={session.version === 2 ? `Replay decision for ${trackLabel(row.id)}` : t('Replay encounter decision')}
            title={row.canReplayContact ? `${t('Open paused replay')} · ${row.replayTime.toFixed(1)}s` : t('The session ended before contact arrival.')}
            onClick={() => onReplay(row.id, row.replayTime)}>{t('Inspect')}<ArrowUpRight size={13}/></button></td>
        </tr>;
      })}
      {visible === 0 && <tr className="decision-empty"><td colSpan={7}><Circle size={18}/><strong>{t('No decisions in this filter.')}</strong><span>{t('Choose another filter to review the remaining tracks.')}</span></td></tr>}
      </tbody>
    </table></div>
  </section>;
}
