import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, CircleHelp, Eye, Moon, Pause, Play, Radio, RotateCcw, Shuffle, Sun, X } from 'lucide-react';
import { categories, createScenario, exercises, formatTime, scoreSession, visibleContacts, type CameraView, type Category, type Difficulty, type ExerciseId, type Session, type SessionEvent } from './simulation';
import { readProfile, readSessions, saveProfile, saveSessions, type Profile } from './storage';
import Review from './Review';
import RecognitionGuide from './RecognitionGuide';
import HelpDialog from './HelpDialog';
import BrandMark from './BrandMark';
import { LangContext, readLang, saveLang, translate, type Lang } from './i18n';
import { THEATRES, theatreById, type TheatreId } from './theatres';
const Progress=lazy(()=>import('./Progress'));
import {createVariationDeck, variationNumber, VARIATION_SEEDS} from './variations';
import { advancePreview } from './previewClock';
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
  const previewTime=scenario.arrival+6;
  const time=useRef(previewTime);
  const [previewElapsed,setPreviewElapsed]=useState(previewTime);
  const [previewPlaying,setPreviewPlaying]=useState(true);
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
  const [page,setPage]=useState<'exercise'|'progress'>('exercise');
  const [lang,setLang]=useState<Lang>(readLang);
  const tr=(text:string)=>translate(lang,text);
  function changeLang(next:Lang){setLang(next);saveLang(next);}
  useEffect(()=>{document.documentElement.lang=lang==='hi'?'hi':'en';},[lang]);
  // The theatre is a view choice, not part of the scenario or the saved session, so it is remembered per browser.
  const [theatreId,setTheatreId]=useState<TheatreId>(()=>{try{return theatreById(localStorage.getItem('aeron-theatre')??'district').id;}catch{return 'district';}});
  const theatre=theatreById(theatreId);
  const theatreRef=useRef(theatreId);theatreRef.current=theatreId;
  const changeTheatre=useCallback((id:TheatreId)=>{setTheatreId(id);try{localStorage.setItem('aeron-theatre',id);}catch{/* preference only */}},[]);
  const [profile,setProfile]=useState<Profile>(readProfile);
  // First visit opens the welcome guide; afterwards it is available from the help button or "?".
  const [help,setHelp]=useState<'welcome'|'help'|null>(()=>{try{return localStorage.getItem('aeron-onboarded-v1')?null:'welcome';}catch{return null;}});
  const closeHelp=useCallback(()=>{setHelp(null);try{localStorage.setItem('aeron-onboarded-v1','1');}catch{/* preference only */}},[]);
  function updateProfile(next:Profile){setProfile(next);saveProfile(next);}
  const result=history.find(s=>s.id===selectedId)||history[0];
  const active=phase==='running'||phase==='paused';
  const review=phase==='review'&&!!result;
  const locked=active||review;
  useEffect(()=>{if(phase==='ready'){time.current=previewTime;setPreviewElapsed(previewTime);}},[scenario,phase,previewTime]);
  const previewAdvancing=phase==='ready'&&previewPlaying&&!help&&page==='exercise';
  useEffect(()=>{
    if(!previewAdvancing)return;
    let previous=performance.now(),frame=0,lastRender=0;
    const tick=(now:number)=>{
      if(phaseRef.current!=='ready')return;
      const delta=(now-previous)/1000;previous=now;
      if(!document.hidden){
        time.current=advancePreview(time.current,delta,scenario.duration);
        if(now-lastRender>80){setPreviewElapsed(time.current);lastRender=now;}
      }
      frame=requestAnimationFrame(tick);
    };
    const visibility=()=>{previous=performance.now();};
    document.addEventListener('visibilitychange',visibility);
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);};
  },[previewAdvancing,scenario.duration]);
  function togglePreview(){setPreviewElapsed(time.current);setPreviewPlaying(v=>!v);}
  function transition(next:Phase){phaseRef.current=next;setPhase(next);}
  const finish=useCallback(()=>{
    if(!['running','paused'].includes(phaseRef.current))return;
    const duration=Math.min(time.current,scenario.duration);
    const scored=scoreSession(scenario,detectionRef.current,answerRef.current,duration);
    const session:Session={version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),scenario,duration,detection:detectionRef.current,answer:answerRef.current,...scored,events:[...events.current,{time:duration,type:'finish',label:'Exercise completed'}],theatre:theatreRef.current};
    const updated=[session,...historyRef.current].slice(0,20);historyRef.current=updated;setHistory(updated);setSelectedId(session.id);transition('review');
    if(!saveSessions(updated))setNotice('Browser storage is unavailable. Results will remain available during this visit.');
  },[scenario]);
  function addEvent(type:SessionEvent['type'],label:string){events.current=[...events.current,{time:time.current,type,label}];}
  const pause=useCallback(()=>{if(phaseRef.current==='ready'){setPreviewElapsed(time.current);setPreviewPlaying(false);return;}if(phaseRef.current!=='running')return;events.current.push({time:time.current,type:'pause',label:'Exercise paused'});setElapsed(time.current);transition('paused');},[]);
  const resume=useCallback(()=>{if(phaseRef.current!=='paused')return;events.current.push({time:time.current,type:'resume',label:'Exercise resumed'});transition('running');},[]);
  useEffect(()=>{
    if(phase!=='running')return;
    let previous=performance.now(),frame=0,lastRender=0;
    const tick=(now:number)=>{if(phaseRef.current!=='running')return;time.current=Math.min(scenario.duration,time.current+(now-previous)/1000);previous=now;
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
    if(document.querySelector('[aria-modal="true"]'))return;
    if(event.code==='Space'){event.preventDefault();if(phaseRef.current==='running')pause();else if(phaseRef.current==='paused')resume();}
    if(event.key==='?'){setHelp('help');return;}
    if(event.key.toLowerCase()==='o')mark();
    if(['1','2','3'].includes(event.key))classify(categories[Number(event.key)-1]);
  };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[pause,resume,mark,classify]);
  function repeat(session:Session,newVariation=false){setScenarioVersion(newVariation?2:session.scenario.version);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setDusk(session.scenario.dusk);setSeed(newVariation?newSeed():session.scenario.seed);setCameraView('overview');reset();}
  function nextChallenge(){if(!result)return;if(!result.observationValid){setExercise('skyline');setDifficulty('guided');setDusk(false);setSeed(newSeed());reset();return;}if(result.classificationScore===0||result.detectionScore<25){repeat(result);return;}setExercise(result.scenario.difficulty==='guided'?result.scenario.exercise:'mixed');setDifficulty(result.scenario.difficulty==='guided'?'challenge':'guided');setDusk(result.scenario.dusk);setSeed(newSeed());reset();}
  function selectSession(id:string){const session=history.find(s=>s.id===id);if(!session)return;setSelectedId(id);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setDusk(session.scenario.dusk);setSeed(session.scenario.seed);setScenarioVersion(session.scenario.version);if(session.theatre)changeTheatre(session.theatre);}
  const [radarSlot,setRadarSlot]=useState<HTMLDivElement|null>(null);
  const variation=variationNumber(seed);
  const stateLabel=phase==='running'?'LIVE':phase==='paused'?'HOLD':phase==='review'?'DEBRIEF':'STANDBY';
  const primary=phase==='ready'?{label:'Start exercise',icon:<Play size={15} fill="currentColor"/>,action:()=>reset(true)}:phase==='running'?{label:'Hold exercise',icon:<Pause size={15}/>,action:pause}:phase==='paused'?{label:'Resume exercise',icon:<Play size={15} fill="currentColor"/>,action:resume}:{label:'Run a new variation',icon:<RotateCcw size={15}/>,action:()=>{if(result)repeat(result,true);}};
  return <LangContext.Provider value={lang}><div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="Trinetra home"><span className="brand-mark"><BrandMark/></span><span className="brand-name">TRINETRA</span><span className="brand-hi" lang="hi">त्रिनेत्र</span><span className="brand-sub">{tr('Airspace observation trainer')}</span></a>
      <nav className="tabs" aria-label="Workspace"><button aria-current={page==='exercise'&&!review?'page':undefined} onClick={()=>{setPage('exercise');if(review)reset();}}>{tr('Exercise')}</button><button aria-current={page==='exercise'&&review?'page':undefined} disabled={!result||active} onClick={()=>{setPage('exercise');if(result)selectSession(result.id);transition('review');}}>{tr('Debrief')}{history.length>0&&<span className="nav-count">{history.length}</span>}</button><button aria-current={page==='progress'?'page':undefined} disabled={active} onClick={()=>setPage('progress')}>{tr('Progress')}</button></nav>
      <div className="topbar-status">
        <div className="status-block"><span>{tr('SCENARIO')}</span><strong>{tr(definition.short)} · {variation?`V${variation.toString().padStart(3,'0')}`:'Saved seed'}</strong></div>
        <div className="status-block"><span>{tr('EXERCISE CLOCK')}</span><strong className="mono">{formatTime(review&&result?result.duration:elapsed)}<small> / {formatTime(scenario.duration)}</small></strong></div>
        {profile.name&&<div className="status-block"><span>{tr('TRAINEE')}</span><strong>{profile.name}</strong></div>}
        <span className={`state-pill state-${phase}`}><span className="state-dot"/>{tr(stateLabel)}</span>
        <button className="lang-toggle" aria-label={`${tr('Language')}: ${lang==='hi'?'हिन्दी':'English'}`} title="English / हिन्दी" onClick={()=>changeLang(lang==='hi'?'en':'hi')}><span aria-hidden className={lang==='en'?'on':''}>EN</span><span aria-hidden className={lang==='hi'?'on':''}>हिं</span></button>
        <button className="icon-button help-button" aria-label={tr('Operator guide and shortcuts')} title="Operator guide (?)" onClick={()=>setHelp('help')}><CircleHelp size={17}/></button>
      </div>
    </header>
    {page==='progress'?<main className="console console-progress"><Suspense fallback={<div className="scene-loading"><span className="loader"/></div>}><Progress history={history} profile={profile} onProfile={updateProfile} onOpenSession={id=>{selectSession(id);setPage('exercise');transition('review');}} onStart={()=>{setPage('exercise');if(review)reset();}}/></Suspense></main>:
    <main className={`console ${review?'console-review':''}`}>
      <aside className="panel mission" aria-label="Mission setup">
        <div className="panel-head"><span>{tr('MISSION SETUP')}</span><span className="tag">{tr(difficulty==='guided'?'GUIDED':'CHALLENGE')}</span></div>
        <div className="panel-scroll">
          <div className="mission-title"><h1>{tr(definition.title)}</h1><p>{tr(definition.description)}</p></div>
          <div className="field"><label className="section-label" htmlFor="theatre-select">{tr('THEATRE')}</label><select id="theatre-select" value={theatre.id} onChange={e=>changeTheatre(e.target.value as TheatreId)}>{THEATRES.map(t=><option key={t.id} value={t.id}>{t.kind==='synthetic'?'3D training district (offline)':`${t.name} — ${t.region}`}</option>)}</select><span className="seed-value">{theatre.kind==='synthetic'?tr('Locally rendered city block; supports thermal view.'):`${theatre.terrainLabel} · ${tr('satellite imagery on 3D terrain')}`}</span></div>
          <div className="field"><label className="section-label" htmlFor="exercise-select">{tr('EXERCISE')}</label><select id="exercise-select" value={exercise} disabled={locked} onChange={e=>{setExercise(e.target.value as ExerciseId);setSeed(newSeed());}}>{exercises.map(e=><option key={e.id} value={e.id}>{tr(e.short)}</option>)}</select></div>
          <div className="field"><span className="section-label">{tr('DIFFICULTY')}</span><div className="segmented"><button aria-pressed={difficulty==='guided'} disabled={locked} onClick={()=>setDifficulty('guided')}>{tr('Guided')}</button><button aria-pressed={difficulty==='challenge'} disabled={locked} onClick={()=>setDifficulty('challenge')}>{tr('Challenge')}</button></div></div>
          <div className="field"><span className="section-label">{tr('LIGHTING')}</span><div className="segmented"><button aria-pressed={!dusk} disabled={locked} onClick={()=>setDusk(false)}><Sun size={14}/>{tr('Day')}</button><button aria-pressed={dusk} disabled={locked} onClick={()=>setDusk(true)}><Moon size={14}/>{tr('Dusk')}</button></div></div>
          <div className="field"><div className="field-row"><label htmlFor="variation-select" className="section-label">{tr('VARIATION')}</label><button className="shuffle-button" disabled={locked} onClick={()=>setSeed(newSeed())} aria-label="New scenario variation" title="New scenario variation"><Shuffle size={13}/>{tr('Shuffle')}</button></div>
            <select id="variation-select" aria-label="Choose scenario variation" value={seed} disabled={locked} onChange={e=>{setSeed(Number(e.target.value));setScenarioVersion(2);}}>{variation===null&&<option value={seed}>Saved seed {seed}</option>}{VARIATION_SEEDS.map((value,index)=><option key={value} value={value}>Variation {(index+1).toString().padStart(3,'0')} · Seed {value}</option>)}</select>
            <span className="seed-value">SEED {seed} · {variation?`${variation.toString().padStart(3,'0')} of 200`:'saved variation'} · shuffle avoids repeats</span></div>
          <dl className="mission-facts"><div><dt>{tr('Area')}</dt><dd>{theatre.kind==='synthetic'?tr('Training district'):theatre.name}</dd></div><div><dt>{tr('Window')}</dt><dd>{scenario.duration} s</dd></div><div><dt>{tr('Visibility')}</dt><dd>{tr(difficulty==='guided'?'Light urban haze':'Dense urban haze')}</dd></div><div><dt>{tr('Sensors')}</dt><dd>Radar · EO/IR</dd></div></dl>
          <div className="briefing"><span className="section-label">{tr('PROCEDURE')}</span><ol>
            <li><b>{tr('Detect')}</b><span>{tr('Scan the skyline and the radar for new returns.')}</span></li>
            <li><b>{tr('Observe')}</b><span>{tr('Click the aircraft or its radar track, or press')} <kbd>O</kbd>.</span></li>
            <li><b>{tr('Identify')}</b><span>{tr('Confirm on the EO/IR feed, then classify with')} <kbd>1</kbd>–<kbd>3</kbd>.</span></li>
          </ol></div>
        </div>
        <div className="panel-foot"><button className="primary-button" onClick={primary.action}>{primary.icon}{tr(primary.label)}{phase==='ready'?<span>{scenario.duration}s</span>:phase==='running'?<kbd>Space</kbd>:null}</button><p className="demo-note">{tr('Synthetic encounters · results stay in this browser')}</p></div>
      </aside>
      <section className="stage">{review&&result?<Review key={result.id} session={result} history={history} profile={profile} theatre={theatre} onTheatreChange={changeTheatre} onSelectSession={selectSession} onRepeat={()=>repeat(result)} onNext={nextChallenge}/>:<>
        <Suspense fallback={<div className="scene scene-loading"><span className="loader"/><p>Preparing the sensor view…</p></div>}><SceneView scenario={scenario} time={time} displayTime={phase==='ready'?previewElapsed:elapsed} selected={detected!==null} phase={phase==='ready'?'preview':phase==='paused'?'paused':'running'} cameraView={cameraView} onCameraChange={setCameraView} onSelect={mark} onResume={resume} onPause={pause} previewPlaying={previewAdvancing} onTogglePreview={togglePreview} onNotice={setNotice} radarTarget={radarSlot} assessment={answer} theatre={theatre} onTheatreChange={changeTheatre}/></Suspense>
        <div className="session-bar">
          <button className="session-action" onClick={primary.action}>{primary.icon}{tr(primary.label)}</button>
          <div className="session-clock mono">{formatTime(elapsed)}<span> / {formatTime(scenario.duration)}</span></div>
          <div className="progress-track" aria-hidden><div style={{width:`${elapsed/scenario.duration*100}%`}}/>{detected!==null&&<span className="progress-marker" style={{left:`${detected/scenario.duration*100}%`}}/>}</div>
          <span className="shortcut-hints"><kbd>Space</kbd>{tr('hold')} <kbd>O</kbd>{tr('observe')} <kbd>1–3</kbd>{tr('classify')}</span>
          <button className="text-button" disabled={!active} onClick={finish}>{tr('End & debrief')}<ChevronRight size={15}/></button>
        </div>
      </>}
      </section>
      {!review&&<aside className="panel ops" aria-label="Situation and classification">
        <div className="panel-head"><span>{tr('SITUATION')}</span><span className="panel-head-note"><Radio size={12}/>{tr('Radar · simulated')}</span></div>
        <div className="panel-scroll">
          <div ref={setRadarSlot} className="radar-slot"/>
          <section className="ops-section observation">
            <div className="ops-heading"><span className="section-label">{tr('OBSERVATION')}</span><span className={`obs-status ${detected!==null?'done':phase==='running'?'waiting':''}`}>{detected!==null?`${tr('MARKED')} T+${detected.toFixed(1)} s`:tr(phase==='running'?(elapsed<scenario.arrival?'SCANNING':'AWAITING MARK'):'NOT STARTED')}</span></div>
            <p className="ops-help">{tr(detected!==null?'Confirm the type on the EO/IR feed, then classify the contact.':phase==='ready'?'Preview playback is unscored. Start the exercise to practise detection.':'Mark as soon as you see aerial movement. Timing counts from arrival.')}</p>
            <button className={`mark-button ${detected!==null?'marked':''}`} disabled={phase!=='running'||detected!==null} onClick={mark}>{detected===null?<><Eye size={15}/>{tr('Mark observation')}<kbd>O</kbd></>:<><Check size={15}/>{tr('Observation recorded')}</>}</button>
            <div className="ops-heading classify-heading"><span className="section-label">{tr('CLASSIFICATION')}</span>{answer&&<span className="obs-status done">{tr(answer).toUpperCase()}</span>}</div>
            <div className="choice-buttons">{categories.map((choice,i)=><button key={choice} disabled={phase!=='running'||detected===null} aria-pressed={answer===choice} onClick={()=>classify(choice)}><kbd>{i+1}</kbd>{tr(choice)}{answer===choice&&<Check size={14}/>}</button>)}</div>
          </section>
          <RecognitionGuide difficulty={difficulty}/>
        </div>
      </aside>}
    </main>}
    {help&&<HelpDialog welcome={help==='welcome'} onClose={closeHelp}/>}
    {notice&&<div className="notice" role="status">{tr(notice)}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </div></LangContext.Provider>;
}
