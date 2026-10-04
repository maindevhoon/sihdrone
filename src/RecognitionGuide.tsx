import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Category, Difficulty } from './simulation';

// Visual cues that separate the three categories in this simulation. They describe what the
// models and motion here actually do, so the guide stays consistent with the scene.
const cues: { category: Category; title: string; points: string[] }[] = [
  { category: 'Single drone', title: 'Multirotor UAS', points: [
    'Rigid airframe; no wingbeat. Speed changes show as body tilt.',
    'Smooth, deliberate legs; can slow, hover or reverse.',
    'Red/green navigation lights and a white strobe, most obvious at dusk.',
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
    'IR: the whole body is warm, without motor hot spots.',
  ] },
];

export default function RecognitionGuide({ difficulty }: { difficulty: Difficulty }) {
  // Challenge mode starts collapsed so trainees work from memory, but the guide stays available.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? difficulty === 'guided';
  return <section className="ops-section guide">
    <button className="guide-toggle" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
      <span className="section-label">RECOGNITION CUES</span><ChevronDown size={14} />
    </button>
    {expanded && <div className="guide-cards">{cues.map(cue => <div key={cue.category} className="guide-card">
      <div className="guide-title"><strong>{cue.category}</strong><span>{cue.title}</span></div>
      <ul>{cue.points.map(point => <li key={point}>{point}</li>)}</ul>
    </div>)}</div>}
  </section>;
}
