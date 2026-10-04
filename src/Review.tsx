import { variationNumber } from './variations';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Download, Eye, Flag, Focus, Layers, Pause, Play, Printer, RotateCcw, X } from 'lucide-react';
import type { Profile } from './storage';
import { exercises, formatTime, recommendation, type CameraView, type Session } from './simulation';
const SceneView=lazy(()=>import('./SceneView'));
const noop=()=>{};
function Replay({session}: {session:Session}) {
  const [elapsed,setElapsed]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [camera,setCamera]=useState<CameraView>('overview');
  const time=useRef(0);
  useEffect(()=>{if(!playing)return;let previous=performance.now(),frame=0,lastRender=0;
    const tick=(now:number)=>{time.current=Math.min(session.duration,time.current+(now-previous)/1000);previous=now;if(now-lastRender>80){setElapsed(time.current);lastRender=now;}
      if(time.current>=session.duration){setElapsed(session.duration);setPlaying(false);return;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);const hide=()=>{if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',hide);return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hide);};
  },[playing,session.duration]);
  function seek(value:number){time.current=value;setElapsed(value);}
  function toggle(){if(!playing&&time.current>=session.duration)seek(0);setPlaying(!playing);}
  // The radar shows the operator's assessment only from the moment it was recorded.
  const classifiedAt=session.events.filter(e=>e.type==='classification').at(-1)?.time;
  const assessment=classifiedAt!==undefined&&elapsed>=classifiedAt?session.answer:'';
  return <div className="replay-container"><Suspense fallback={<div className="scene scene-loading">Preparing replay…</div>}><SceneView scenario={session.scenario} time={time} displayTime={elapsed} selected={session.detection!==null&&elapsed>=session.detection} phase="replay" cameraView={camera} onCameraChange={setCamera} onSelect={noop} assessment={assessment}/></Suspense>
    <div className="replay-controls"><button onClick={toggle} aria-label={playing?'Pause replay':'Play replay'}>{playing?<Pause size={16}/>:<Play size={16}/>}</button><span>{formatTime(elapsed)}</span><div className="replay-track"><input type="range" aria-label="Replay position" min={0} max={session.duration} step={.05} value={elapsed} onChange={e=>seek(Number(e.target.value))}/>{session.events.filter(e=>e.type==='observation'||e.type==='classification').map((event,i)=><span className={`replay-marker marker-${event.type}`} key={i} style={{left:`${session.duration?event.time/session.duration*100:0}%`}} title={`${event.label} at ${event.time.toFixed(1)}s`}/>)}</div><span>{formatTime(session.duration)}</span></div>
    <p className="replay-caption">Same variation, same movement. Amber marks your observation; green marks a classification. Replay does not change the result.</p>
  </div>;
}
export default function Review({session,history,profile,onSelectSession,onRepeat,onNext}: {session:Session;history:Session[];profile:Profile;onSelectSession:(id:string)=>void;onRepeat:()=>void;onNext:()=>void}) {
  const [replay,setReplay]=useState(false);
  const correct=session.classificationScore===60;
  const definition=exercises.find(e=>e.id===session.scenario.exercise)!;
  const reaction=session.observationValid?session.detection!-session.scenario.arrival:null;
  function exportSession(){const file=new Blob([JSON.stringify(session,null,2)],{type:'application/json'});const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=`aeron-session-${session.scenario.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="review-panel">
    <div className="review-heading"><span className="review-icon"><Flag size={24}/></span><div><div className="eyebrow">AFTER-ACTION REVIEW</div><h2>Debrief: {definition.short}</h2></div><span className="tag">{session.scenario.dusk?'DUSK':'DAYLIGHT'}</span></div>
    <div className="print-only print-meta">Trainee: {profile.name||'—'} · Unit/ID: {profile.unit||'—'} · Session {new Date(session.createdAt).toLocaleString()} · Printed {new Date().toLocaleString()}</div>
    <div className="review-context"><span>{definition.short}</span><span>{session.scenario.difficulty==='guided'?'Guided':'Challenge'}</span><span>Variation {variationNumber(session.scenario.seed)?.toString().padStart(3,'0')??'saved'} · Seed {session.scenario.seed}</span></div>
    <div className="score-row"><div className="score-large">{session.score}<span>/ 100</span><p>Practice score</p></div><div className="score-summary"><h3>{correct?'Correctly classified.':!session.observationValid?'An observation to practice.':session.answer?'A closer look next time.':'Complete the classification.'}</h3><p>{correct?`You identified ${session.scenario.category.toLowerCase()}. Review your timing, or replay the encounter from another angle.`:!session.observationValid?'No valid observation was recorded after the objects entered the scene. Start with guided mode and watch the skyline.':`The encounter was ${session.scenario.category.toLowerCase()}. ${session.answer?`You selected ${session.answer.toLowerCase()}.`:'No category was submitted.'} Replay the scene to compare the objects and their movement.`}</p></div></div>
    <div className="review-metrics"><div><Eye size={19}/><span>Time after arrival</span><strong>{reaction===null?'Not recorded':`${reaction.toFixed(1)}s`}</strong></div><div>{correct?<Check size={19}/>:<X size={19}/>}<span>Classification</span><strong>{correct?'Correct':session.answer?'Incorrect':'Not submitted'}</strong></div><div><Layers size={19}/><span>Scene contained</span><strong>{session.scenario.category}</strong></div></div>
    <div className="score-breakdown"><div><span>Observation timing</span><span>{session.detectionScore}<i>/40</i></span></div><div className="breakdown-track"><span style={{width:`${session.detectionScore/40*100}%`}}/></div><div><span>Classification</span><span>{session.classificationScore}<i>/60</i></span></div><div className="breakdown-track classification-score"><span style={{width:`${session.classificationScore/60*100}%`}}/></div></div>
    <div className="review-actions"><button className="replay-button" onClick={()=>setReplay(!replay)}>{replay?<X size={15}/>:<Play size={15}/>} {replay?'Close replay':'Replay session'}</button><button className="text-button" onClick={onRepeat}><RotateCcw size={14}/>Repeat variation</button><button className="text-button" onClick={exportSession}><Download size={14}/>Export result</button><button className="text-button" onClick={()=>{setReplay(false);setTimeout(()=>window.print(),50);}}><Printer size={14}/>Print report</button></div>
    {replay&&<Replay session={session}/>}
    <div className="timeline-heading"><h3>Session timeline</h3><span>{session.duration.toFixed(1)}s · {session.events.length} events</span></div><div className="timeline">{[{time:session.scenario.arrival,type:'arrival',label:'Aerial objects entered the district'},...session.events].sort((a,b)=>a.time-b.time).filter(e=>e.time<=session.duration).map((event,i)=><div key={i}><span className={`timeline-dot event-${event.type}`}/><time>{event.time.toFixed(1).padStart(4,'0')}s</time><span>{event.label}</span></div>)}</div>
    <div className="feedback"><Focus size={22}/><div><strong>Next exercise</strong><p>{recommendation(session)}</p></div><button onClick={onNext} aria-label="Set up the suggested next exercise"><ChevronRight size={19}/></button></div>
    <div className="history-heading"><h3>Your practice history</h3><select aria-label="Choose saved session" value={session.id} onChange={e=>onSelectSession(e.target.value)}>{history.map((item,index)=><option key={item.id} value={item.id}>{index===0?'Latest':index+1}. {exercises.find(e=>e.id===item.scenario.exercise)?.short} · {item.score}/100</option>)}</select></div>
    <div className="history-chart" aria-label="Scores from recent practice sessions">{history.slice(0,8).reverse().map((item,i)=><button key={item.id} className={item.id===session.id?'history-current':''} onClick={()=>onSelectSession(item.id)} aria-label={`Review ${exercises.find(e=>e.id===item.scenario.exercise)?.short}, score ${item.score}`}><strong>{item.score}</strong><span className="history-bar" style={{height:`${Math.max(3,item.score*.6)}px`}}/><span>{i+1}</span></button>)}</div>
    <p className="rubric">Illustrative rubric: classification earns 60 points after a valid observation. Observation starts at 40 points and decreases by 1 point per 0.83s after arrival, to a minimum of 5. Up to 20 sessions are saved locally.</p>
  </div>;
}
