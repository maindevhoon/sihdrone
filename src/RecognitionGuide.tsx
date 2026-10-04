import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Category, Difficulty } from './simulation';
import { AIRFRAMES } from './airframes';
import { useT } from './i18n';

// Visual cues that separate the three categories in this simulation. They describe what the
// models and motion here actually do, so the guide stays consistent with the scene.
const cues: { category: Category; title: string; points: string[] }[] = [
  { category: 'Single drone', title: 'Multirotor UAS', points: [
    'Rigid airframe; no wingbeat. Speed changes show as body tilt.',
    'Smooth, deliberate legs; can slow, hover or reverse.',
    'Red/green navigation lights and a white strobe, most obvious at dusk.',
    'A steady rotor hum that rises in pitch as it manoeuvres.',
    'IR: motors and battery are the hottest points.',
  ] },
  { category: 'Drone group', title: 'Coordinated UAS', points: [
    'Several rigid airframes with matching heading and speed.',
    'Spacing holds through turns; manoeuvres start together.',
    'Multiple radar tracks moving as one formation.',
  ] },
  { category: 'Bird', title: 'Black kite', points: [
    'Long angled wings with fingered tips; shallow forked tail.',
    'Long glides on steady wings, with short bursts of slow flapping.',
    'Banks steeply into turns; tail twists to steer. No lights.',
    'No motor hum; a kite is effectively silent at these ranges.',
    'IR: the whole body is warm, without motor hot spots.',
  ] },
];

export default function RecognitionGuide({ difficulty }: { difficulty: Difficulty }) {
  // Challenge mode starts collapsed so trainees work from memory, but the guide stays available.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? difficulty === 'guided';
  const t = useT();
  return <section className="ops-section guide">
    <button className="guide-toggle" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
      <span className="section-label">{t('RECOGNITION CUES')}</span><ChevronDown size={14} />
    </button>
    {expanded && <div className="guide-cards">{cues.map(cue => <div key={cue.category} className="guide-card">
      <div className="guide-title"><strong>{t(cue.category)}</strong><span>{t(cue.title)}</span></div>
      <ul>{cue.points.map(point => <li key={point}>{t(point)}</li>)}</ul>
    </div>)}
      <div className="guide-card size-card">
        <div className="guide-title"><strong>{t('Size reference')}</strong><span>{t('Published figures')}</span></div>
        <table><tbody>{Object.values(AIRFRAMES).map(a => <tr key={a.id}><th scope="row">{a.name.replace('DJI ', '')}</th><td>{a.published[0].value}</td><td>{a.published.find(p => /weight/i.test(p.label))?.value}</td></tr>)}
          <tr><th scope="row">{t('Black kite')}</th><td>≈ 150 cm span</td><td>≈ 735 g</td></tr></tbody></table>
        <p>{t("Small UAS are roughly 0.3–1.4 m tip to tip; a kite spans about 1.5 m. Compare with the EO feed's SPAN estimate.")}</p>
      </div>
    </div>}
  </section>;
}
