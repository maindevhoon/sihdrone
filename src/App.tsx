import { LIGHTING_OPTIONS, lightingLabels, lightingOf, visibilityLabel, type Lighting } from './environment';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleHelp, CloudFog, Crosshair, Eye, Layers, Moon, Pause, Play, Radio, RotateCcw, Shuffle, SlidersHorizontal, Sun, X } from 'lucide-react';
import { categories, createScenario, exercises, formatTime, scoreSession, scoreTracks, emptyTrackDecisions, trackLabel, type ScenarioVersion, type TrackDecision, visibleContacts, type CameraView, type Category, type Difficulty, type ExerciseId, type Session, type SessionEvent } from './simulation';
import { readProfile, readSessions, saveProfile, saveSessions, type Profile } from './storage';
import Review from './Review';
import RecognitionGuide from './RecognitionGuide';
import HelpDialog from './HelpDialog';
import BrandMark from './BrandMark';
import { LangContext, readLang, saveLang, translate, type Lang } from './i18n';
import { THEATRES, theatreById, type TheatreId } from './theatres';
const Progress=lazy(()=>import('./Progress'));
import {createVariationDeck, variationNumber, VARIATION_SEEDS} from './variations';
import { planPractice } from './practice';
import { advancePreview } from './previewClock';
const SceneView=lazy(()=>import('./SceneView'));
const PilotView=lazy(()=>import('./PilotView'));
import { useFlightPreparation } from './useFlightPreparation';
import { useFlightTerrain } from './useFlightTerrain';
import { flatTerrain } from './flightTerrain';
import type { FlightDefinition, WindPreset } from './flightTypes';
type Phase='ready'|'running'|'paused'|'review';
export default function App() {
  const [phase,setPhase]=useState<Phase>('ready');
  const phaseRef=useRef<Phase>('ready');
  const [exercise,setExercise]=useState<ExerciseId>('skyline');
  const [difficulty,setDifficulty]=useState<Difficulty>('guided');
  const [lighting,setLighting]=useState<Lighting>('day');
  const [fog,setFog]=useState(false);
  const [variationDeck]=useState(()=>createVariationDeck());
  const [seed,setSeed]=useState(()=>variationDeck.next());
  const [scenarioVersion,setScenarioVersion]=useState<ScenarioVersion>(4);
  function newSeed(){setRecordedFlight(undefined);setScenarioVersion(4);return variationDeck.next(seed);}
  const [recordedFlight,setRecordedFlight]=useState<FlightDefinition>();
  const [wind,setWind]=useState<WindPreset>('breeze');
  // Version 4 freezes the physical theatre during flight; camera navigation remains independent.
  const [theatreId,setTheatreId]=useState<TheatreId>(()=>{try{return theatreById(localStorage.getItem('aeron-theatre')??'district').id;}catch{return 'district';}});
  const theatre=theatreById(theatreId);
  const theatreRef=useRef(theatreId);theatreRef.current=theatreId;
  const changeTheatre=useCallback((id:TheatreId)=>{if(scenarioVersion===4&&phaseRef.current!=='ready')return;setRecordedFlight(undefined);setTheatreId(id);try{localStorage.setItem('aeron-theatre',id);}catch{/* preference only */}},[scenarioVersion]);
  const terrainPreparation=useFlightTerrain(theatre,scenarioVersion===4&&!recordedFlight);
  const terrain=recordedFlight?.terrain??terrainPreparation.terrain;
  const scenario=useMemo(()=>createScenario(exercise,seed,difficulty,lighting==='dusk',scenarioVersion,{lighting,fog},{terrain:terrain??flatTerrain(theatre),wind}),[exercise,seed,difficulty,lighting,fog,scenarioVersion,terrain,theatre,wind]);
  const flightPreparation=useFlightPreparation(scenario);
  const flightReady=scenarioVersion!==4||(!!terrain&&flightPreparation.ready);
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
  const [selectedTrack,setSelectedTrack]=useState(0);
  const [tracks,setTracks]=useState<TrackDecision[]>(()=>emptyTrackDecisions(scenario));
  const tracksRef=useRef(tracks);
  const perTrack=scenario.version>=3;
  const currentTrack=tracks[selectedTrack];
  const currentDetection=perTrack?(currentTrack?.detection ?? null):detected;
  const currentAnswer=perTrack?(currentTrack?.answer ?? ''):answer;
  const events=useRef<SessionEvent[]>([]);
  useEffect(()=>{const next=emptyTrackDecisions(scenario);tracksRef.current=next;setTracks(next);setSelectedTrack(0);},[scenario]);
  const [history,setHistory]=useState<Session[]>(readSessions);
  const historyRef=useRef(history);
  const practicePlan=useMemo(()=>planPractice(history,seed),[history,seed]);
  const [selectedId,setSelectedId]=useState<string|null>(history[0]?.id||null);
  const [notice,setNotice]=useState('');
  const [cameraView,setCameraView]=useState<CameraView>('overview');
  const [page,setPage]=useState<'exercise'|'progress'|'pilot'>('exercise');
  const [lang,setLang]=useState<Lang>(readLang);
  const tr=(text:string)=>translate(lang,text);
  function changeLang(next:Lang){setLang(next);saveLang(next);}
  useEffect(()=>{document.documentElement.lang=lang==='hi'?'hi':'en';},[lang]);
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
  const previewAdvancing=phase==='ready'&&previewPlaying&&!help&&page==='exercise'&&flightReady;
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
    const scored=scenario.version>=3?scoreTracks(scenario,tracksRef.current,duration):scoreSession(scenario,detectionRef.current,answerRef.current,duration);
    const session:Session={version:scenario.version>=3?2:1,...(scenario.version>=3?{tracks:tracksRef.current}:{}),id:crypto.randomUUID(),createdAt:new Date().toISOString(),scenario,duration,detection:detectionRef.current,answer:answerRef.current,...scored,events:[...events.current,{time:duration,type:'finish',label:'Exercise completed'}],theatre:theatreRef.current};
    const updated=[session,...historyRef.current].slice(0,20);historyRef.current=updated;setHistory(updated);setSelectedId(session.id);transition('review');
    if(!saveSessions(updated))setNotice('Browser storage is unavailable. Results will remain available during this visit.');
  },[scenario]);
  function addEvent(type:SessionEvent['type'],label:string){events.current=[...events.current,{time:time.current,type,label}];}
  const pause=useCallback(()=>{if(phaseRef.current==='ready'){setPreviewElapsed(time.current);setPreviewPlaying(false);return;}if(phaseRef.current!=='running')return;events.current.push({time:time.current,type:'pause',label:'Exercise paused'});setElapsed(time.current);transition('paused');},[]);
  const resume=useCallback(()=>{if(phaseRef.current!=='paused')return;events.current.push({time:time.current,type:'resume',label:'Exercise resumed'});transition('running');},[]);
  useEffect(()=>{
    if(phase!=='running')return;
    let previous=performance.now(),frame=0,lastRender=0;
    const tick=(now:number)=>{if(phaseRef.current!=='running')return;time.current=Math.min(scenario.duration,time.current+Math.max(0,(now-previous)/1000));previous=now;
      if(now-lastRender>80){setElapsed(time.current);lastRender=now;}
      if(time.current>=scenario.duration){setElapsed(scenario.duration);finish();return;}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    const hide=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',hide);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hide);};
  },[phase,scenario.duration,finish,pause]);
  function reset(start=false){if(start&&!flightReady)return;const next=emptyTrackDecisions(scenario);tracksRef.current=next;setTracks(next);setSelectedTrack(0);time.current=start?0:previewTime;setElapsed(0);detectionRef.current=null;answerRef.current='';setDetected(null);setAnswer('');events.current=start?[{time:0,type:'start',label:'Exercise started'}]:[];setNotice('');transition(start?'running':'ready');}
  const mark=useCallback((id=selectedTrack)=>{
    if(phaseRef.current!=='running'||!Number.isInteger(id)||id<0||id>=scenario.count)return;
    if(!visibleContacts(scenario,time.current).length){setNotice('Keep scanning. The aerial objects have not entered the district yet.');return;}
    if(scenario.version>=3){
      const track=tracksRef.current[id];if(!track||track.detection!==null)return;
      const next=tracksRef.current.map(item=>item.id===id?{...item,detection:time.current}:item);
      tracksRef.current=next;setTracks(next);
      events.current.push({time:time.current,type:'observation',trackId:id,label:`${trackLabel(id)} observed`});
    }else if(detectionRef.current!==null)return;
    else events.current.push({time:time.current,type:'observation',label:'Aerial movement observed'});
    if(detectionRef.current===null){detectionRef.current=time.current;setDetected(time.current);}
    setNotice('');
  },[scenario,selectedTrack]);
  const classify=useCallback((value:Category)=>{
    if(phaseRef.current!=='running')return;
    if(scenario.version>=3){
      const track=tracksRef.current[selectedTrack];if(!track||track.detection===null||track.answer===value)return;
      const next=tracksRef.current.map(item=>item.id===selectedTrack?{...item,answer:value}:item);
      tracksRef.current=next;setTracks(next);
      events.current.push({time:time.current,type:'classification',trackId:selectedTrack,answer:value,label:`${trackLabel(selectedTrack)} classified as ${value.toLowerCase()}`});
    }else{
      if(detectionRef.current===null||answerRef.current===value)return;
      answerRef.current=value;setAnswer(value);events.current.push({time:time.current,type:'classification',label:`Classified as ${value.toLowerCase()}`});
    }
  },[scenario,selectedTrack]);
  useEffect(()=>{const keydown=(event:KeyboardEvent)=>{
    if(page==='pilot')return;
    const element=event.target as HTMLElement;
    if(element.closest('input,select,textarea,button,a')||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    if(document.querySelector('[aria-modal="true"]'))return;
    if(event.code==='Space'){event.preventDefault();if(phaseRef.current==='running')pause();else if(phaseRef.current==='paused')resume();}
    if(event.key==='?'){setHelp('help');return;}
    if(event.key.toLowerCase()==='o')mark();
    if(['1','2','3'].includes(event.key))classify(categories[Number(event.key)-1]);
  };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[pause,resume,mark,classify,page]);
  function repeat(session:Session,newVariation=false){setRecordedFlight(newVariation?undefined:session.scenario.flight);setScenarioVersion(newVariation?4:session.scenario.version);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setLighting(lightingOf(session.scenario));setFog(session.scenario.fog??false);setWind(session.scenario.flight?.wind??'breeze');if(session.theatre)setTheatreId(session.theatre);setSeed(newVariation?newSeed():session.scenario.seed);setCameraView('overview');reset();}
  function nextChallenge(){
    setPage('exercise');setScenarioVersion(4);setExercise(practicePlan.exercise);setDifficulty(practicePlan.difficulty);
    setLighting(practicePlan.dusk?'dusk':'day');setFog(false);setRecordedFlight(undefined);setSeed(practicePlan.seed);setCameraView('overview');reset();
  }
  function selectSession(id:string){const session=history.find(s=>s.id===id);if(!session)return;setSelectedId(id);setExercise(session.scenario.exercise);setDifficulty(session.scenario.difficulty);setLighting(lightingOf(session.scenario));setFog(session.scenario.fog??false);setRecordedFlight(session.scenario.flight);setWind(session.scenario.flight?.wind??'breeze');if(session.theatre)setTheatreId(session.theatre);setSeed(session.scenario.seed);setScenarioVersion(session.scenario.version);}
  const [radarSlot,setRadarSlot]=useState<HTMLDivElement|null>(null);
  const variation=variationNumber(seed);
  const observedCount=tracks.filter(item=>item.detection!==null).length;
  const classifiedCount=tracks.filter(item=>item.answer).length;
  const instruction=phase==='ready'?'Explore the scene, then start when you are ready.':phase==='paused'?'Exercise on hold. Resume when you are ready.':currentAnswer?'Assessment saved. Select another track to continue.':currentDetection!==null?'Compare the EO/IR view, then choose a category.':'Select a radar track or mark an observation.';
  const stateLabel=phase==='running'?'LIVE':phase==='paused'?'HOLD':phase==='review'?'DEBRIEF':'STANDBY';
  const primary=phase==='ready'?{label:'Start exercise',icon:<Play size={15} fill="currentColor"/>,action:()=>{reset(true);requestAnimationFrame(()=>document.getElementById('exercise-workspace')?.scrollIntoView({block:'start'}));}}:phase==='running'?{label:'Hold exercise',icon:<Pause size={15}/>,action:pause}:phase==='paused'?{label:'Resume exercise',icon:<Play size={15} fill="currentColor"/>,action:resume}:{label:'Run a new variation',icon:<RotateCcw size={15}/>,action:()=>{if(result)repeat(result,true);}};
  return <LangContext.Provider value={lang}><div className={`app-shell ${page==='exercise'&&!review&&phase==='ready'?'is-standby':''}`}>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Trinetra home"><span className="brand-mark"><BrandMark/></span><span className="brand-name">Trinetra</span><span className="brand-hi" lang="hi">त्रिनेत्र</span><span className="brand-sub">{tr('Airspace observation trainer')}</span></a>
      <nav className="tabs" aria-label="Workspace"><button aria-current={page==='exercise'&&!review?'page':undefined} onClick={()=>{setPage('exercise');if(review)reset();}}>{tr('Exercise')}</button><button aria-current={page==='exercise'&&review?'page':undefined} disabled={!result||active} onClick={()=>{setPage('exercise');if(result)selectSession(result.id);transition('review');}}>{tr('Debrief')}{history.length>0&&<span className="nav-count">{history.length}</span>}</button><button aria-current={page==='pilot'?'page':undefined} disabled={active} onClick={()=>{setPage('pilot');setPreviewPlaying(false);}}>Pilot lab</button><button aria-current={page==='progress'?'page':undefined} disabled={active} onClick={()=>setPage('progress')}>{tr('Progress')}</button></nav>
      <div className="topbar-status">
        <div className="status-block"><span>{tr('SCENARIO')}</span><strong>{page==='pilot'?'Manual flight':tr(definition.short)} · {variation?`V${variation.toString().padStart(3,'0')}`:'Saved seed'}</strong></div>
        <div className="status-block"><span>{tr(page==='pilot'?'FLIGHT MODE':'EXERCISE CLOCK')}</span><strong className="mono">{page==='pilot'?'UNSCORED':<>{formatTime(review&&result?result.duration:elapsed)}<small> / {formatTime(scenario.duration)}</small></>}</strong></div>
        {profile.name&&<div className="status-block"><span>{tr('TRAINEE')}</span><strong>{profile.name}</strong></div>}
        <span className={`state-pill state-${phase}`}><span className="state-dot"/>{page==='pilot'?'PILOT LAB':tr(stateLabel)}</span>
        <button className="lang-toggle" aria-label={`${tr('Language')}: ${lang==='hi'?'हिन्दी':'English'}`} title="English / हिन्दी" onClick={()=>changeLang(lang==='hi'?'en':'hi')}><span aria-hidden className={lang==='en'?'on':''}>EN</span><span aria-hidden className={lang==='hi'?'on':''}>हिं</span></button>
        <button className="icon-button help-button" aria-label={tr('Operator guide and shortcuts')} title="Operator guide (?)" onClick={()=>setHelp('help')}><CircleHelp size={17}/></button>
      </div>
    </header>
    {page==='exercise'&&!review&&phase==='ready'&&<section className="launch-header" aria-label={tr('Training overview')}>
      <div className="launch-copy"><span className="launch-eyebrow"><span/>{tr('AIRSPACE OBSERVATION, REIMAGINED')}</span><h1 className="launch-title">{tr('Train your eye.')}<br/><span>{tr('Sharpen your judgement.')}</span></h1><p>{tr('Practise recognising drones and birds in a shared 3D airspace.')}</p><div className="launch-actions"><button className="launch-primary" disabled={!flightReady} onClick={primary.action}>{tr('Start exercise')}<ChevronRight size={16}/></button><button className="launch-secondary" onClick={()=>document.getElementById('mission-setup')?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}>{tr('Configure exercise')}<SlidersHorizontal size={14}/></button></div></div>
      <div className="launch-details"><span className="launch-edition">TRINETRA / त्रिनेत्र</span><div><strong>200</strong><span>{tr('reproducible variations')}</span></div><div><strong>{scenario.duration}s</strong><span>{tr('focused exercises')}</span></div><small>{tr('Synthetic encounters. Results stay in your browser.')}</small></div>
    </section>}
    {page==='pilot'?<Suspense fallback={<div className="scene-loading">Preparing flight lab…</div>}><PilotView lighting={lighting} fog={fog} suspended={!!help} onBack={()=>setPage('exercise')}/></Suspense>:page==='progress'?<main className="console console-progress"><Suspense fallback={<div className="scene-loading"><span className="loader"/></div>}><Progress practicePlan={practicePlan} onPractice={nextChallenge} history={history} profile={profile} onProfile={updateProfile} onOpenSession={id=>{selectSession(id);setPage('exercise');transition('review');}} onStart={()=>{setPage('exercise');if(review)reset();}}/></Suspense></main>:
    <main className={`console ${review?'console-review':''}`}>
      <aside className="panel mission" aria-label="Mission setup" id="mission-setup">
        <div className="panel-head"><span className="panel-heading-label"><Layers size={13}/>{tr('MISSION SETUP')}</span><span className="tag">{tr(difficulty==='guided'?'GUIDED':'CHALLENGE')}</span></div>
        <div className="panel-scroll">
          <div className="mission-title"><span className="mission-eyebrow">TRINETRA / {tr('TRAINING')}</span><h2>{tr(definition.title)}</h2><p>{tr(definition.description)}</p></div>
          <div className="field"><label className="section-label" htmlFor="theatre-select">{tr('THEATRE')}</label><select id="theatre-select" disabled={locked&&scenarioVersion===4} value={theatre.id} onChange={e=>changeTheatre(e.target.value as TheatreId)}>{THEATRES.map(t=><option key={t.id} value={t.id}>{t.kind==='synthetic'?'3D training district (offline)':`${t.name} — ${t.region}`}</option>)}</select><span className="seed-value">{theatre.kind==='synthetic'?tr('Locally rendered city block; supports thermal view.'):`${theatre.terrainLabel} · ${tr('satellite imagery on 3D terrain')}`}</span></div>
          <div className="field"><label className="section-label" htmlFor="exercise-select">{tr('EXERCISE')}</label><select id="exercise-select" value={exercise} disabled={locked} onChange={e=>{setExercise(e.target.value as ExerciseId);setSeed(newSeed());}}>{exercises.map(e=><option key={e.id} value={e.id}>{tr(e.short)}</option>)}</select></div>
          <div className="field"><span className="section-label">{tr('DIFFICULTY')}</span><div className="segmented"><button aria-pressed={difficulty==='guided'} disabled={locked} onClick={()=>setDifficulty('guided')}>{tr('Guided')}</button><button aria-pressed={difficulty==='challenge'} disabled={locked} onClick={()=>setDifficulty('challenge')}>{tr('Challenge')}</button></div></div>
          <div className="field"><span className="section-label">FLIGHT / WIND</span><select aria-label="Wind preset" value={wind} disabled={locked||scenarioVersion!==4} onChange={e=>setWind(e.target.value as WindPreset)}><option value="calm">Calm</option><option value="breeze">Breeze · 4 m/s</option><option value="gusty">Gusty · 8 m/s + gusts</option></select><span className="seed-value">{scenarioVersion===4?'Rigid-body flight · actual metres':'Historical trajectory · preserved replay'}</span>{scenarioVersion===4&&!terrain&&<div className="flight-preparing" role="status">{terrainPreparation.error||'Sampling 2 km of terrain…'}{terrainPreparation.error&&<><button onClick={terrainPreparation.retry}>Retry terrain</button><button onClick={terrainPreparation.useFlat}>Use flat practice</button></>}</div>}{terrain?.source==='flat'&&theatre.kind!=='synthetic'&&<span className="seed-value">Flat practice surface · terrain collisions use a flat plane</span>}{flightPreparation.error&&<div role="alert">{flightPreparation.error}<button onClick={flightPreparation.retry}>Retry flight</button></div>}</div>
          <div className="field"><span className="section-label">{tr('LIGHTING')}</span><div className="segmented lighting-options" role="group" aria-label={tr('LIGHTING')}>{LIGHTING_OPTIONS.map(option=><button key={option} aria-pressed={lighting===option} disabled={locked} onClick={()=>setLighting(option)}>{option==='day'?<Sun size={14}/>:<Moon size={14} fill={option==='night'?'currentColor':'none'}/>} {tr(lightingLabels[option])}</button>)}</div></div>
          <div className="field"><span className="section-label">{tr('VISIBILITY')}</span><div className="segmented" role="group" aria-label={tr('VISIBILITY')}><button aria-pressed={!fog} disabled={locked} onClick={()=>setFog(false)}>{tr('Urban haze')}</button><button aria-pressed={fog} disabled={locked} onClick={()=>setFog(true)}><CloudFog size={14}/>{tr('Fog')}</button></div></div>
          <div className="field"><div className="field-row"><label htmlFor="variation-select" className="section-label">{tr('VARIATION')}</label><button className="shuffle-button" disabled={locked} onClick={()=>setSeed(newSeed())} aria-label="New scenario variation" title="New scenario variation"><Shuffle size={13}/>{tr('Shuffle')}</button></div>
            <select id="variation-select" aria-label="Choose scenario variation" value={seed} disabled={locked} onChange={e=>{setSeed(Number(e.target.value));setRecordedFlight(undefined);setScenarioVersion(4);}}>{variation===null&&<option value={seed}>Saved seed {seed}</option>}{VARIATION_SEEDS.map((value,index)=><option key={value} value={value}>Variation {(index+1).toString().padStart(3,'0')} · Seed {value}</option>)}</select>
            <span className="seed-value">SEED {seed} · {variation?`${variation.toString().padStart(3,'0')} of 200`:'saved variation'} · shuffle avoids repeats</span></div>
          <dl className="mission-facts"><div><dt>{tr('Area')}</dt><dd>{theatre.kind==='synthetic'?tr('Training district'):theatre.name}</dd></div><div><dt>{tr('Window')}</dt><dd>{scenario.duration} s</dd></div><div><dt>{tr('Visibility')}</dt><dd>{tr(visibilityLabel(scenario))}</dd></div><div><dt>{tr('Sensors')}</dt><dd>Radar · EO/IR</dd></div></dl>
          <details className="briefing"><summary><span className="section-label">{tr('PROCEDURE')}</span><ChevronDown size={14}/></summary><ol>
            <li><b>{tr('Detect')}</b><span>{tr('Scan the skyline and the radar for new returns.')}</span></li>
            <li><b>{tr('Observe')}</b><span>{tr('Click the aircraft or its radar track, or press')} <kbd>O</kbd>.</span></li>
            <li><b>{tr('Identify')}</b><span>{tr('Confirm on the EO/IR feed, then classify with')} <kbd>1</kbd>–<kbd>3</kbd>.</span></li>
          </ol></details>
        </div>
        <div className="panel-foot"><button className="primary-button" disabled={phase==='ready'&&!flightReady} onClick={primary.action}>{primary.icon}{tr(phase==='ready'&&!flightReady?'Preparing flight…':primary.label)}{phase==='ready'?<span>{scenario.duration}s</span>:phase==='running'?<kbd>Space</kbd>:null}</button><p className="demo-note">{tr('Synthetic encounters · results stay in this browser')}</p></div>
      </aside>
      <section className="stage" id="exercise-workspace">{review&&result?<Review practicePlan={practicePlan} key={result.id} session={result} history={history} profile={profile} theatre={theatre} onTheatreChange={changeTheatre} onSelectSession={selectSession} onRepeat={()=>repeat(result)} onNext={nextChallenge}/>:<>
        <header className="workspace-heading"><div><span className="section-label">{tr('LIVE WORKSPACE')}</span><h2>{tr('Your training workspace')}</h2></div><div className="workspace-status"><span className={`workspace-mode ${phase==='running'?'is-live':''}`}><span className="state-dot"/>{tr(phase==='ready'?'Unscored preview':phase==='paused'?'Exercise on hold':'Exercise in progress')}</span><button className="setup-shortcut" onClick={()=>document.getElementById('mission-setup')?.scrollIntoView({block:'start'})}><SlidersHorizontal size={12}/>{tr('Setup')}</button></div></header>
        <div className="workflow-strip" role="group" aria-label={tr('Exercise procedure')}><span className={currentDetection===null?'active':'complete'}><b>{currentDetection!==null?<Check size={11}/>:'01'}</b>{tr('Observe')}</span><i/><span className={currentAnswer?'complete':currentDetection!==null?'active':''}><b>{currentAnswer?<Check size={11}/>:'02'}</b>{tr('Identify')}</span><i/><span><b>03</b>{tr('Debrief')}</span><p>{tr(instruction)}</p></div>
        <Suspense fallback={<div className="scene scene-loading"><span className="loader"/><p>Preparing the sensor view…</p></div>}><SceneView scenario={scenario} time={time} displayTime={phase==='ready'?previewElapsed:elapsed} selected={currentDetection!==null} selectedTrack={selectedTrack} onTrackChange={setSelectedTrack} decisions={perTrack?tracks:undefined} phase={phase==='ready'?'preview':phase==='paused'?'paused':'running'} cameraView={cameraView} onCameraChange={setCameraView} onSelect={mark} onResume={resume} onPause={pause} previewPlaying={previewAdvancing} onTogglePreview={togglePreview} onNotice={setNotice} radarTarget={radarSlot} assessment={currentAnswer} theatre={theatre} onTheatreChange={changeTheatre}/></Suspense>
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
          <section className="ops-section observation">
            <div className="selected-track-heading"><span className="selected-track-icon"><Crosshair size={20}/></span><div><span className="section-label">{tr('SELECTED TRACK')}</span><h3>{trackLabel(selectedTrack)}<small>{tr('Operator assessment')}</small></h3></div><span className={`track-stage ${currentAnswer?'classified':currentDetection!==null?'observed':''}`}>{tr(currentAnswer?'Classified':currentDetection!==null?'Observed':'Unobserved')}</span></div>
            {perTrack&&<div className="track-progress" role="status"><span>{observedCount}/{scenario.count} {tr('observed')}</span><span>{classifiedCount}/{scenario.count} {tr('classified')}</span><div className="track-completion" aria-hidden>{tracks.map(item=><i key={item.id} className={item.answer?'complete':item.detection!==null?'observed':''}/>)}</div></div>}
            <div className="ops-heading"><span className="section-label">{tr('OBSERVATION')}{perTrack&&` · ${trackLabel(selectedTrack)}`}</span><span className={`obs-status ${currentDetection!==null?'done':phase==='running'?'waiting':''}`}>{currentDetection!==null?`${tr('MARKED')} T+${currentDetection.toFixed(1)} s`:tr(phase==='running'?(elapsed<scenario.arrival?'SCANNING':'AWAITING MARK'):'NOT STARTED')}</span></div>
            <p className="ops-help">{tr(currentDetection!==null?'Confirm the type on the EO/IR feed, then classify the contact.':phase==='ready'?'Preview playback is unscored. Start the exercise to practise detection.':'Mark as soon as you see aerial movement. Timing counts from arrival.')}</p>
            <button className={`mark-button ${currentDetection!==null?'marked':''}`} disabled={phase!=='running'||currentDetection!==null} onClick={()=>mark()}>{currentDetection===null?<><Eye size={15}/>{tr('Mark observation')}<kbd>O</kbd></>:<><Check size={15}/>{tr('Observation recorded')}</>}</button>
            <div className="ops-heading classify-heading"><span className="section-label">{tr('CLASSIFICATION')}</span>{currentAnswer&&<span className="obs-status done">{tr(currentAnswer).toUpperCase()}</span>}</div>
            <div className="choice-buttons">{categories.map((choice,i)=><button key={choice} disabled={phase!=='running'||currentDetection===null} aria-pressed={currentAnswer===choice} onClick={()=>classify(choice)}><kbd>{i+1}</kbd>{tr(choice)}{currentAnswer===choice&&<Check size={14}/>}</button>)}</div>
          </section>
          <div ref={setRadarSlot} className="radar-slot"/>
          <RecognitionGuide difficulty={difficulty}/>
        </div>
      </aside>}
    </main>}
    {help&&<HelpDialog welcome={help==='welcome'} onClose={closeHelp}/>}
    {notice&&<div className="notice" role="status">{tr(notice)}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={14}/></button></div>}
  </div></LangContext.Provider>;
}
