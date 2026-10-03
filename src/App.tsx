import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, Crosshair, Eye, Focus, Layers, Moon, Pause, Play, Radio, RotateCcw, Shuffle, Sun, Timer, Wind, X } from 'lucide-react';
import { categories, createScenario, exercises, formatTime, scoreSession, visibleContacts, type CameraView, type Category, type Difficulty, type ExerciseId, type Session, type SessionEvent } from './simulation';
import { readSessions, saveSessions } from './storage';
import Review from './Review';
import {createVariationDeck, variationNumber, VARIATION_SEEDS} from './variations';
const SceneView=lazy(()=>import('./SceneView'));
type Phase='ready'|'running'|'paused'|'review';
export default function App() {
  const [phase,setPhase]=useState<Phase>('ready');
  const phaseRef=useRef<Phase>('ready');
  const [exercise,setExercise]=useState<ExerciseId>('skyline');
  const [difficulty,setDifficulty]=useState<Difficulty>('guided');
  const [dusk,setDusk]=useState(false);
  const [variationDeck]=useState(()=>createVariationDeck());
  const [seed,setSeed]=useState(()=>variationDeck.next());
  const [scenarioVersion,setScenarioVersion]=useState<1|2>(2);
  function newSeed(){setScenarioVersion(2);return variationDeck.next(seed);}
  const scenario=useMemo(()=>createScenario(exercise,seed,difficulty,dusk,scenarioVersion),[exercise,seed,difficulty,dusk,scenarioVersion]);
  const definition=exercises.find(e=>e.id===exercise)!;
  const time=useRef(0);
  const [elapsed,setElapsed]=useState(0);
  const [detected,setDetected]=useState<number|null>(null);
  const detectionRef=useRef<number|null>(null);
  const [answer,setAnswer]=useState<Category|''>('');
  const answerRef=useRef<Category|''>('');
  const events=useRef<SessionEvent[]>([]);
  const [history,setHistory]=useState<Session[]>(readSessions);
  const historyRef=useRef(history);
  const [selectedId,setSelectedId]=useState<string|null>(history[0]?.id||null);
  const [notice,setNotice]=useState('');
  const [cameraView,setCameraView]=useState<CameraView>('overview');
  const result=history.find(s=>s.id===selectedId)||history[0];
  const active=phase==='running'||phase==='paused';
  const review=phase==='review'&&!!result;
  const locked=active||review;
  const previewTime=scenario.arrival+6;
  useEffect(()=>{if(phase==='ready')time.current=previewTime;},[previewTime,phase]);
  function transition(next:Phase){phaseRef.current=next;setPhase(next);}
  const finish=useCallback(()=>{
    if(!['running','paused'].includes(phaseRef.current))return;
    const duration=Math.min(time.current,scenario.duration);
    const scored=scoreSession(scenario,detectionRef.current,answerRef.current,duration);
    const session:Session={version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),scenario,duration,detection:detectionRef.current,answer:answerRef.current,...scored,events:[...events.current,{time:duration,type:'finish',label:'Exercise completed'}]};
    const updated=[session,...historyRef.current].slice(0,20);historyRef.current=updated;setHistory(updated);setSelectedId(session.id);transition('review');
    if(!saveSessions(updated))setNotice('Browser storage is unavailable. Results will remain available during this visit.');
  },[scenario]);
  function addEvent(type:SessionEvent['type'],label:string){events.current=[...events.current,{time:time.current,type,label}];}
  const pause=useCallback(()=>{if(phaseRef.current!=='running')return;events.current.push({time:time.current,type:'pause',label:'Exercise paused'});setElapsed(time.current);transition('paused');},[]);
  const resume=useCallback(()=>{if(phaseRef.current!=='paused')return;events.current.push({time:time.current,type:'resume',label:'Exercise resumed'});transition('running');},[]);
  useEffect(()=>{
    if(phase!=='running')return;
    let previous=performance.now(),frame=0,lastRender=0;
    const tick=(now:number)=>{time.current=Math.min(scenario.duration,time.current+(now-previous)/1000);previous=now;
      if(now-lastRender>80){setElapsed(time.current);lastRender=now;}
      if(time.current>=scenario.duration){setElapsed(scenario.duration);finish();return;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    const hide=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hide);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hide);};
  },[phase,scenario.duration,finish,pause]);
  function reset(start=false){time.current=start?0:previewTime;setElapsed(0);detectionRef.current=null;answerRef.current='';setDetected(null);setAnswer('');events.current=start?[{time:0,type:'start',label:'Exercise started'}]:[];setNotice('');transition(start?'running':'ready');}
  const mark=useCallback(()=>{if(phaseRef.current!=='running'||detectionRef.current!==null)return;
    if(!visibleContacts(scenario,time.current).length){setNotice('Keep scanning. The aerial objects have not entered the district yet.');return;}
    detectionRef.current=time.current;setDetected(time.current);setNotice('');events.current.push({time:time.current,type:'observation',label:'Aerial movement observed'});
  },[scenario]);
  const classify=useCallback((value:Category)=>{if(phaseRef.current!=='running'||detectionRef.current===null||answerRef.current===value)return;answerRef.current=value;setAnswer(value);events.current.push({time:time.current,type:'classification',label:`Classified as ${value.toLowerCase()}`});},[]);
  useEffect(()=>{const keydown=(event:KeyboardEvent)=>{
    const element=event.target as HTMLElement;
    if(element.closest('input,select,textarea,button,a')||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    if(event.code==='Space'){event.preventDefault();if(phaseRef.current==='running')pause();else if(phaseRef.current==='paused')resume();}
    if(event.key.toLowerCase()==='o')mark();
    if(['1','2','3'].includes(event.key))classify(categories[Number(event.key)-1]);
  };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[pause,resume,mark,classify]);
  function repeat(session:Session,newVariation=false){setScenarioVersion(newVariation?2:session.scenario.version);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setDusk(session.scenario.dusk);setSeed(newVariation?newSeed():session.scenario.seed);setCameraView('overview');reset();}
  function nextChallenge(){if(!result)return;if(!result.observationValid){setExercise('skyline');setDifficulty('guided');setDusk(false);setSeed(newSeed());reset();return;}if(result.classificationScore===0||result.detectionScore<25){repeat(result);return;}setExercise(result.scenario.difficulty==='guided'?result.scenario.exercise:'mixed');setDifficulty(result.scenario.difficulty==='guided'?'challenge':'guided');setDusk(result.scenario.dusk);setSeed(newSeed());reset();}
  function selectSession(id:string){const session=history.find(s=>s.id===id);if(!session)return;setSelectedId(id);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setDusk(session.scenario.dusk);setSeed(session.scenario.seed);setScenarioVersion(session.scenario.version);}
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Aeron home"><span className="brand-mark"><Focus size={22}/></span>AERON<span className="brand-divider"/><span className="brand-sub">TRAINING LAB</span></a>
      <nav aria-label="Workspace"><button className={!review?'nav-active':''} onClick={()=>{if(review)reset();}}>Exercise</button><button className={review?'nav-active':''} disabled={!result||active} onClick={()=>{if(result)selectSession(result.id);transition('review');}}>Session review {history.length>0&&<span className="nav-dot"/>}</button></nav>
      <div className="prototype-label">REACT PROTOTYPE <span>02</span></div>
    </header>
    <main><div className="page-heading"><div><div className="eyebrow">OBSERVATION & RECOGNITION</div><h1>{review?'Every session is a lesson.':'A clearer view. A better decision.'}</h1><p>{review?'Revisit the scene. Understand your decisions. Build consistency.':'Explore a Delhi-inspired district and practice recognizing aerial objects.'}</p></div><div className="heading-actions">{!review&&<button className="header-start" onClick={()=>phase==='ready'?reset(true):phase==='running'?pause():resume()}>{phase==='running'?<Pause size={15}/>:<Play size={15}/>} {phase==='ready'?'Begin session':phase==='running'?'Pause session':'Resume session'}</button>}<div className="heading-note"><Layers size={17}/><span>{difficulty==='guided'?'Foundations':'Challenge'}<br/><strong>Delhi observation lab</strong></span></div></div></div>
      <div className="workspace"><aside className="sidebar">
        <div className="scenario-number"><span>DELHI DISTRICT</span><span className="tag">{difficulty.toUpperCase()}</span></div>
        <h2>{definition.title}</h2><p className="scenario-desc">{definition.description}</p>
        <div className="setup-exercise"><label className="section-label" htmlFor="exercise-select">EXERCISE</label><select id="exercise-select" value={exercise} disabled={locked} onChange={e=>{setExercise(e.target.value as ExerciseId);setSeed(newSeed());}}>{exercises.map(e=><option key={e.id} value={e.id}>{e.short}</option>)}</select></div>
        <div className="scenario-details"><div><Layers size={16}/><span>Environment</span><strong>Delhi district</strong></div><div><Timer size={16}/><span>Session length</span><strong>45 seconds</strong></div><div><Wind size={16}/><span>Conditions</span><strong>{difficulty==='guided'?'Light urban haze':'Dense urban haze'}</strong></div></div>
        <div className="setup-control"><span className="section-label">DIFFICULTY</span><div className="segmented"><button aria-pressed={difficulty==='guided'} disabled={locked} className={difficulty==='guided'?'selected':''} onClick={()=>setDifficulty('guided')}>Guided</button><button aria-pressed={difficulty==='challenge'} disabled={locked} className={difficulty==='challenge'?'selected':''} onClick={()=>setDifficulty('challenge')}>Challenge</button></div></div>
        <div className="setup-control"><span className="section-label">LIGHTING</span><div className="segmented"><button aria-pressed={!dusk} disabled={locked} className={!dusk?'selected':''} onClick={()=>setDusk(false)}><Sun size={16}/>Daylight</button><button aria-pressed={dusk} disabled={locked} className={dusk?'selected':''} onClick={()=>setDusk(true)}><Moon size={16}/>Dusk</button></div></div>
        <div className="variation-row"><span>Variation <strong>{variationNumber(seed)?.toString().padStart(3,'0')??'Saved'} / 200</strong></span><button disabled={locked} onClick={()=>setSeed(newSeed())} aria-label="New scenario variation" title="New scenario variation"><Shuffle size={14}/></button></div>
        <div className="seed-library"><label htmlFor="variation-select" className="section-label">VARIATION LIBRARY</label><select id="variation-select" aria-label="Choose scenario variation" value={seed} disabled={locked} onChange={e=>{setSeed(Number(e.target.value));setScenarioVersion(2);}}>{variationNumber(seed)===null&&<option value={seed}>Saved seed {seed}</option>}{VARIATION_SEEDS.map((value,index)=><option key={value} value={value}>Variation {(index+1).toString().padStart(3,'0')} · Seed {value}</option>)}</select><span className="seed-value">SEED {seed} · Shuffle avoids repeats</span></div>
        <div className="briefing"><div className="section-label">YOUR OBJECTIVE</div><div><span>01</span><p>Choose a camera view. Drag to look around.</p></div><div><span>02</span><p>Mark the aerial movement as it appears.</p></div><div><span>03</span><p>Classify the objects, then review or replay.</p></div></div>
        <div className="sidebar-bottom">{phase==='ready'?<button className="primary-button" onClick={()=>reset(true)}><Play size={17} fill="currentColor"/>Start exercise <span>45s</span></button>:phase==='running'?<button className="primary-button" onClick={pause}><Pause size={17}/>Pause exercise <kbd>Space</kbd></button>:phase==='paused'?<button className="primary-button" onClick={resume}><Play size={17}/>Resume exercise</button>:<button className="primary-button" onClick={()=>result&&repeat(result,true)}><RotateCcw size={17}/>Try a new variation</button>}
          <p className="demo-note">Synthetic scene · local practice results</p></div>
      </aside>
      <section className="main-stage">{review&&result?<Review key={result.id} session={result} history={history} onSelectSession={selectSession} onRepeat={()=>repeat(result)} onNext={nextChallenge}/>:<>
        <Suspense fallback={<div className="scene scene-loading"><Focus size={28}/><p>Preparing your district…</p></div>}><SceneView scenario={scenario} time={time} displayTime={phase==='ready'?previewTime:elapsed} selected={detected!==null} phase={phase==='ready'?'preview':phase==='paused'?'paused':'running'} cameraView={cameraView} onCameraChange={setCameraView} onSelect={mark} onResume={resume} onNotice={setNotice}/></Suspense>
        <div className="session-bar"><div><span className="section-label">SESSION PROGRESS</span><strong>{formatTime(elapsed)} <span>/ 00:45</span></strong></div><div className="progress-track"><div style={{width:`${elapsed/scenario.duration*100}%`}}/></div><button className="text-button" disabled={!active} onClick={finish}>Finish & review<ChevronRight size={16}/></button></div>
        <div className="observation-panel"><div className="observation-heading"><span className="observation-icon"><Crosshair size={20}/></span><div><h3>{detected!==null?'Observation recorded':phase==='running'&&elapsed<scenario.arrival?'Scan the skyline.':'What do you see?'}</h3><p>{detected!==null?`Marked at ${detected.toFixed(1)}s. Choose the category that best describes what you saw.`:phase==='ready'?'The preview shows a sample moment. Start to practice noticing the encounter.':'Watch for aerial movement. Click the object or mark your observation.'}</p></div><button className={`mark-button ${detected!==null?'marked':''}`} disabled={phase!=='running'||detected!==null} onClick={mark}>{detected===null?<><Eye size={16}/>Mark observation <kbd>O</kbd></>:<><Check size={16}/>Observed</>}</button></div>
          <div className="classification"><span className="section-label">CLASSIFY THE OBSERVATION</span><div className="choice-buttons">{categories.map((choice,i)=><button key={choice} disabled={phase!=='running'||detected===null} aria-pressed={answer===choice} className={answer===choice?'choice-selected':''} onClick={()=>classify(choice)}><span>{i+1}</span>{choice}{answer===choice&&<Check size={15}/>}</button>)}</div></div>
        </div>
        <div className="exercise-footnote"><span><Radio size={12}/>Radar uses simulated scene positions.</span><span><kbd>Space</kbd> pause <kbd>O</kbd> observe <kbd>1–3</kbd> classify</span></div>
      </>}
      </section></div>
      {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={14}/></button></div>}
      <footer><span><Radio size={14}/>SIH26247 <span className="footer-divider"/>Drone awareness simulation</span><span>Built with React + Three.js <ArrowUpRight size={14}/></span></footer>
    </main>
  </div>;
}
