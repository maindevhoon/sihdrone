import { Check, Circle, Eye } from 'lucide-react';
import { trackLabel, type TrackDecision } from './simulation';
import { useT } from './i18n';

type Props = {
  tracks: {id: number; outside: boolean}[];
  decisions: TrackDecision[];
  selected: number;
  onInspect: (id: number) => void;
};

/** Shows operator progress only. Scenario categories are deliberately absent from this interface. */
export default function TrackChecklist({tracks, decisions, selected, onInspect}: Props) {
  const t = useT();
  const classified = tracks.filter(track => decisions.find(item => item.id === track.id)?.answer).length;
  return <section className="track-checklist" aria-label={t('Track checklist')}>
    <header><span>{t('CONTACT REGISTER')}</span><span aria-live="polite">{classified}/{tracks.length} {t('classified')}</span></header>
    <div role="group" aria-label="Radar tracks" className="track-checklist-grid">
      {tracks.map(({id, outside}) => {
        const decision = decisions.find(item => item.id === id);
        const status = decision?.answer ? 'Classified' : decision?.detection != null ? 'Observed' : 'Unobserved';
        const Icon = status === 'Classified' ? Check : status === 'Observed' ? Eye : Circle;
        return <button key={id} aria-label={`Inspect radar track ${id + 1}`} aria-pressed={selected === id}
          className={`checklist-track ${status.toLowerCase()} ${outside ? 'outside-range' : ''}`}
          title={`${trackLabel(id)} · ${t(status)}${decision?.answer ? ` · ${t(decision.answer)}` : ''}${outside ? ` · ${t('Outside radar range')}` : ''}`}
          onClick={() => onInspect(id)}>
          <span className="checklist-symbol"><Icon size={13}/></span>
          <span><strong>{trackLabel(id)}</strong><small>{t(status)}{outside && ' · OUT'}</small></span>
          <span className="checklist-selected" aria-hidden>{selected === id ? '↗' : ''}</span>
        </button>;
      })}
    </div>
  </section>;
}
