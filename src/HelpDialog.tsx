import { useEffect, useRef } from 'react';
import { Crosshair, Eye, Flag, Radar, X } from 'lucide-react';

const steps = [
  { icon: Radar, title: 'Detect', text: 'Watch the skyline and the radar. New returns appear as yellow unknown tracks.' },
  { icon: Eye, title: 'Observe', text: 'Click the aircraft, click its radar track, or press O as soon as you see movement. Timing counts from arrival.' },
  { icon: Crosshair, title: 'Identify', text: 'The EO/IR sensor slews to the track. Compare shape, motion, lights and heat, then classify with 1–3.' },
  { icon: Flag, title: 'Debrief', text: 'Review the score, replay the encounter and follow your progress across sessions.' },
];
const shortcuts: [string, string][] = [
  ['Space', 'Start, hold or resume'], ['O', 'Mark observation'], ['1 · 2 · 3', 'Single drone · Drone group · Bird'],
  ['T', 'Next radar track (slews EO/IR)'], ['I', 'Toggle EO / IR feed'], ['H', 'Thermal sensor view'], ['F', 'Fullscreen sensor view'], ['M', 'Mute rotor audio'], ['?', 'This help'],
];

export default function HelpDialog({ welcome, onClose }: { welcome: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <header><div><div className="eyebrow">{welcome ? 'WELCOME TO AERON' : 'OPERATOR GUIDE'}</div><h2 id="help-title">{welcome ? 'Detect, observe, identify, debrief' : 'Procedure and shortcuts'}</h2></div>
        <button ref={close} className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></header>
      {welcome && <p className="dialog-lead">Aeron trains low-altitude aerial observation over a Delhi district. Each 45-second exercise brings drones, drone groups or black kites; your job is to notice them early and identify them correctly.</p>}
      <ol className="dialog-steps">{steps.map(({ icon: Icon, title, text }) => <li key={title}><span><Icon size={17} /></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol>
      <h3 className="section-label">KEYBOARD</h3>
      <dl className="shortcut-list">{shortcuts.map(([keys, label]) => <div key={keys}><dt>{keys.split(' · ').map(k => <kbd key={k}>{k}</kbd>)}</dt><dd>{label}</dd></div>)}</dl>
      <footer><span>Synthetic training data. Results stay in this browser.</span><button className="primary-button" onClick={onClose}>{welcome ? 'Begin training' : 'Close'}</button></footer>
    </div>
  </div>;
}
