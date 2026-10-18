import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Bird, Box, Check, ChevronRight, Columns2, ExternalLink, Eye, Focus, Pause, Plane, Play, RotateCcw, Search, X } from 'lucide-react';
import { RECOGNITION_LIBRARY, recognitionEntry } from './recognition';
import type { FlightModelId } from './flightTypes';
import type { StudioBand, StudioView } from './ModelStudio';
import './model-library.css';

const ModelStudio = lazy(() => import('./ModelStudio'));
class StudioBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  render() {return this.state.failed ? <div className="studio-fallback"><Box size={30}/><h3>3D viewer unavailable</h3><p>Enable hardware acceleration or reload the page. You can still browse the recognition reference.</p></div> : this.props.children;}
}

export default function ModelLibrary({onBack}: {onBack: () => void}) {
  const [selected, setSelected] = useState<FlightModelId>('black-kite');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [compare, setCompare] = useState(false);
  const [second, setSecond] = useState<FlightModelId>('mavic-3');
  const [band, setBand] = useState<StudioBand>('colour');
  const [view, setView] = useState<StudioView>('perspective');
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [labels, setLabels] = useState(false);
  const [reset, setReset] = useState(0);
  const [time, setTime] = useState(0);
  const entry = recognitionEntry(selected), other = recognitionEntry(second);
  const ids = useMemo(() => compare ? [selected, second] : [selected], [compare, selected, second]);
  const entries = RECOGNITION_LIBRARY.filter(item => (filter === 'All' || (filter === 'Birds' ? item.family === 'Bird' : item.family !== 'Bird')) && `${item.name} ${item.subtitle} ${item.family}`.toLowerCase().includes(search.toLowerCase().trim()));
  function choose(id: FlightModelId) {
    if (id === second) setSecond(selected);
    setSelected(id); setLabels(false);
  }
  return <main className="recognition-library">
    <header className="library-heading">
      <div><span className="library-eyebrow">FIELD REFERENCE / {RECOGNITION_LIBRARY.length.toString().padStart(2,'0')} SPECIMENS</span><h1>Know what you’re looking at.</h1><p>Explore the shape. Compare the motion. Learn the visual cues.</p></div>
      <button className="library-back" onClick={onBack}><ArrowLeft size={15}/>Back to exercise</button>
    </header>
    <div className="library-layout">
      <aside className="library-catalogue" aria-label="Recognition catalogue">
        <div className="library-catalogue-head"><span>CONTACT LIBRARY</span><span>{RECOGNITION_LIBRARY.length} models</span></div>
        <label className="library-search"><Search size={15}/><input aria-label="Search recognition models" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a bird or aircraft…"/>{search && <button aria-label="Clear model search" onClick={() => setSearch('')}><X size={13}/></button>}</label>
        <div className="library-filters" role="group" aria-label="Filter models">{['All', 'Birds', 'Aircraft'].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
        <div className="library-model-list" role="group" aria-label="Choose a recognition model">
          {entries.map(item => <button className="library-model" key={item.id} aria-pressed={selected === item.id} onClick={() => choose(item.id)}>
            <span className={`library-model-symbol ${item.family === 'Bird' ? 'bird' : ''}`}>{item.family === 'Bird' ? <Bird size={21}/> : item.family === 'Fixed-wing' ? <Plane size={21}/> : <Focus size={21}/>}</span>
            <span><strong>{item.name}</strong><small>{item.family} · {item.id === 'rc-cessna' ? 'Reference airframe' : 'Study model'}</small></span>
            {selected === item.id ? <Check size={14}/> : <ChevronRight size={14}/>}
          </button>)}
          {!entries.length && <p className="library-empty">No models match. Try another name or clear the filter.</p>}
        </div>
        <p className="library-catalogue-note">The same model builders power the exercise, EO/IR feed and Pilot lab. Study here without changing a score.</p>
      </aside>
      <section className="library-inspection" aria-label="Model inspection">
        <div className="library-stage-head"><div><span className="library-family">{compare ? 'SIDE-BY-SIDE COMPARISON' : entry.family.toUpperCase()}</span><h2>{compare ? `${entry.name} + ${other.name}` : entry.name}</h2><p>{compare ? 'Shared camera. Real model metres. No size normalization.' : entry.subtitle}</p></div><span className="library-live"><i/>{playing ? 'ANIMATED' : 'HELD'}</span></div>
        <div className="library-viewer" data-animation-time={time} data-models={ids.join(',')}>
          <StudioBoundary><Suspense fallback={<div className="studio-fallback"><span className="loader"/>Preparing inspection studio…</div>}><ModelStudio ids={ids} playing={playing} band={band} view={view} reset={reset} labels={labels && !compare} onTime={setTime}/></Suspense></StudioBoundary>
          <span className="library-viewer-corner">{band === 'ir' ? 'WHITE-HOT · DISPLAY APPROXIMATION' : band === 'silhouette' ? 'SHAPE STUDY' : 'COLOUR · STUDIO LIGHTING'}</span>
          <span className="library-scale-note">{compare ? 'Compare at the same scale' : 'Reference-inspired 3D model'}</span>
        </div>
        <div className="library-toolbar">
          <div role="group" aria-label="Inspection view">{(['perspective', 'front', 'side', 'top'] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => {setView(value); setReset(n => n + 1);}}>{value === 'perspective' ? '3/4 view' : `${value[0].toUpperCase()}${value.slice(1)}`}</button>)}</div>
          <div className="library-playback"><button onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause model animation' : 'Play model animation'}>{playing ? <Pause size={15}/> : <Play size={15}/>}<span>{playing ? 'Pause' : 'Animate'}</span></button><button aria-label="Reset inspection camera" onClick={() => {setView('perspective'); setReset(n => n + 1);}}><RotateCcw size={15}/></button></div>
        </div>
        <div className="library-options">
          <div role="group" aria-label="Inspection appearance">{(['colour', 'silhouette', 'ir'] as const).map(value => <button key={value} aria-pressed={band === value} onClick={() => setBand(value)}>{value === 'colour' ? 'Colour' : value === 'ir' ? 'IR approximation' : 'Silhouette'}</button>)}</div>
          <button aria-pressed={labels} disabled={compare} onClick={() => setLabels(value => !value)}><Eye size={14}/>Feature labels</button>
          <button aria-pressed={compare} onClick={() => {setCompare(value => !value); setLabels(false);}}><Columns2 size={14}/>Compare</button>
        </div>
        {compare && <label className="library-compare-select">Compare {entry.name} with<select aria-label="Comparison model" value={second} onChange={e => setSecond(e.target.value as FlightModelId)}>{RECOGNITION_LIBRARY.filter(item => item.id !== selected).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <p className="library-gesture">Drag to orbit · Scroll or pinch to zoom · Use Front, Side and Top to compare silhouettes.</p>
        <div className="library-evidence">
          {(compare ? [entry, other] : [entry]).map(item => <article key={item.id} className="library-reference">
            <span className="library-eyebrow">{compare ? item.name.toUpperCase() : 'RECOGNITION NOTES'}</span>
            <h3>{item.family === 'Bird' ? 'Look for the living silhouette.' : 'Look for the rigid structure.'}</h3>
            <p>{item.description}</p>
            <ol className="library-cues">{item.cues.map((cue, i) => <li key={cue}><b>{i + 1}</b>{cue}</li>)}</ol>
            <p className="library-motion">{item.motion}</p>
            <dl className="library-published">{item.published.map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl>
            <a href={item.source} target="_blank" rel="noreferrer">{item.sourceLabel}<ExternalLink size={12}/></a>
            <p className="library-provenance">{item.note}</p>
          </article>)}
        </div>
      </section>
    </div>
  </main>;
}
