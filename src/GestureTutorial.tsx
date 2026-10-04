import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { NavigationInput } from './earthNavigationMath';

type Gesture = 'pan' | 'orbit' | 'zoom';
type Props = { input: NavigationInput; onClose: () => void };

/** Small, original SVG diagrams: no external assets or gesture video downloads. */
function GestureDiagram({ gesture, input }: { gesture: Gesture; input: NavigationInput }) {
  const mouse = input === 'mouse';
  return <svg className={`gesture-diagram gesture-${gesture} ${mouse ? 'gesture-mouse' : ''}`} viewBox="0 0 180 115" aria-hidden="true">
    <rect className="gesture-pad" x="26" y="12" width="128" height="88" rx="12" />
    {mouse ? <>
      <path className="gesture-device" d="M68 72V42a22 22 0 0 1 44 0v30a22 22 0 0 1-44 0Z" />
      <path className="gesture-divider" d="M90 21v25M69 46h42" />
      <rect className="gesture-pressed" x={gesture === 'orbit' ? 94 : 74} y="28" width="12" height="13" rx="4" />
      {gesture === 'zoom' && <rect className="gesture-wheel" x="87" y="28" width="6" height="17" rx="3" />}
    </> : <>
      {gesture === 'pan' && <g className="gesture-finger gesture-one"><ellipse cx="90" cy="54" rx="8" ry="12" /><circle className="gesture-pressure" cx="90" cy="54" r="17" /></g>}
      {gesture === 'orbit' && <g className="gesture-finger gesture-two"><ellipse cx="80" cy="54" rx="8" ry="12" /><ellipse cx="100" cy="54" rx="8" ry="12" /></g>}
      {gesture === 'zoom' && <><g className="gesture-finger gesture-pinch-left"><ellipse cx="72" cy="54" rx="8" ry="12" /></g><g className="gesture-finger gesture-pinch-right"><ellipse cx="108" cy="54" rx="8" ry="12" /></g></>}
    </>}
    <g className="gesture-arrows">
      {gesture === 'pan' && <path d="M43 56h17m-17 0 5-4m-5 4 5 4M137 56h-17m17 0-5-4m5 4-5 4M90 23v11m0-11-4 5m4-5 4 5M90 88V77m0 11-4-5m4 5 4-5" />}
      {gesture === 'orbit' && <><path d="M42 42c-13 25 109 25 96 0m0 0-5 2m5-2 2 6M45 75V40m0 0-4 5m4-5 4 5m-4 30-4-5m4 5 4-5" /><path className="gesture-orbit-axis" d="M71 82h38" /></>}
      {gesture === 'zoom' && <path d="M57 54H40m0 0 5-4m-5 4 5 4M123 54h17m0 0-5-4m5 4-5 4" />}
    </g>
    <text x="90" y="109" textAnchor="middle">{mouse ? 'MOUSE' : gesture === 'pan' ? 'PRESS + MOVE' : gesture === 'orbit' ? 'TWO FINGERS' : 'PINCH / SPREAD'}</text>
  </svg>;
}

export default function GestureTutorial({ input, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trackpad = input === 'trackpad';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  const steps: { gesture: Gesture; action: string; title: string; detail: string }[] = [
    { gesture: 'pan', action: 'PAN', title: trackpad ? 'One finger + click-drag' : 'Left-click + drag', detail: trackpad ? 'Hold the trackpad click and move one finger. Slide across Delhi without changing your viewing angle.' : 'Hold the left button and drag to move across the map.' },
    { gesture: 'orbit', action: 'ROTATE & TILT', title: trackpad ? 'Two-finger scroll' : 'Right-click + drag', detail: trackpad ? 'Without clicking, slide sideways to rotate around the view centre. Slide up or down to change the viewing angle.' : 'Hold the right button and drag sideways to rotate, or vertically to tilt. Shift + left-drag works too.' },
    { gesture: 'zoom', action: 'ZOOM', title: trackpad ? 'Pinch / spread' : 'Scroll wheel', detail: trackpad ? 'Spread two fingers to move closer; pinch together to pull back. Keep the pointer over the place you want to inspect.' : 'Scroll up to move closer and down to pull back. Zoom follows the pointer.' },
  ];

  return <dialog ref={dialog} className="gesture-tutorial" aria-labelledby="gesture-tutorial-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose();
  }}>
    <header className="gesture-tutorial-head">
      <div><span className="gesture-eyebrow">SATELLITE NAVIGATION · {trackpad ? 'MAC TRACKPAD' : 'MOUSE'}</span><h2 id="gesture-tutorial-title">Your hands, three controls.</h2><p>Pan to travel. Rotate to look around. Zoom to get closer.</p></div>
      <button autoFocus className="gesture-tutorial-close" aria-label="Close gesture tutorial" onClick={onClose}><X size={20}/></button>
    </header>
    <div className="gesture-cards">{steps.map((step, index) => <article className="gesture-card" key={step.gesture}>
      <div className="gesture-card-label"><span>0{index + 1}</span><strong>{step.action}</strong></div>
      <GestureDiagram gesture={step.gesture} input={input}/>
      <h3>{step.title}</h3><p>{step.detail}</p>
    </article>)}</div>
    <div className="gesture-extra">
      <p>{trackpad ? <><kbd>Shift</kbd> + two-finger scroll also pans. Safari supports a two-finger twist to rotate.</> : <><kbd>Shift</kbd> + scroll also rotates and tilts.</>}</p>
      <p>{trackpad ? 'Moving one finger without clicking only moves the pointer. Keep gestures over the map.' : 'Keep the pointer over the map while navigating.'} Use <b>N</b> to face north, <b>2D</b> for top-down, or <b>Home</b> to return to Delhi.</p>
    </div>
    <footer className="gesture-tutorial-foot"><span>Reopen this guide with the ? button on the map.</span><button className="primary-button" onClick={onClose}>Got it — try gestures</button></footer>
  </dialog>;
}
