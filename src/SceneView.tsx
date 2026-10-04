import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { Focus, Maximize2, Minus, Pause, Play, Plus, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
const EarthScene = lazy(() => import('./EarthScene'));
const DelhiScene = lazy(() => import('./DelhiScene'));
import Radar from './Radar';
import SensorFeed, { type SensorMode, type SensorTelemetry } from './SensorFeed';
import { visibleContacts, type CameraView, type Category, type Scenario } from './simulation';
import { contactKinematics } from './kinematics';
import { bladePass, combinedLevel, rotorLevel, RotorAudio } from './acoustics';
import { airframeFor } from './airframes';
import type { NavigationInput } from './earthNavigationMath';
class SceneBoundary extends Component<{children:ReactNode;label:string},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="canvas-error"><Focus size={28}/><h3>{this.props.label} unavailable</h3><p>Enable hardware acceleration in your browser.</p></div>:this.props.children;}
}
type Props = { scenario:Scenario; time:MutableRefObject<number>; displayTime:number; selected:boolean; phase:'preview'|'running'|'paused'|'replay'; cameraView:CameraView; onCameraChange:(view:CameraView)=>void; onSelect:()=>void; onResume?:()=>void; onPause?:()=>void; onNotice?:(notice:string)=>void; radarTarget?:HTMLElement|null; assessment?:Category|'' };
type ThermalPalette='white'|'black'|'iron';
const paletteLabels:Record<ThermalPalette,string>={white:'White hot',black:'Black hot',iron:'Ironbow'};
const zoomLevels=[{factor:6,label:'WFOV'},{factor:2.5,label:'MFOV'},{factor:1,label:'NFOV'}];
const cardinal:Record<number,string>={0:'N',90:'E',180:'S',270:'W'};
function HeadingTape({bearing}:{bearing:number}) {
  const ticks:number[]=[];for(let d=Math.ceil((bearing-50)/5)*5;d<=bearing+50;d+=5)ticks.push(d);
  return <div className="heading-tape" aria-label={`Camera heading ${bearing} degrees`}>
    <div className="tape-window">{ticks.map(d=>{const n=((d%360)+360)%360;return <span key={d} className={n%30===0?'tick major':n%10===0?'tick minor':'tick'} style={{left:`${(d-bearing)/100*100+50}%`}}>{n%30===0&&<b>{cardinal[n]??n.toString().padStart(3,'0')}</b>}</span>;})}</div>
    <strong>{bearing.toString().padStart(3,'0')}°</strong>
  </div>;
}
export default function SceneView({scenario,time,displayTime,selected,phase,cameraView,onCameraChange,onSelect,onResume,onPause,onNotice,radarTarget,assessment=''}:Props) {
  const [bearing,setBearing]=useState(0);
  const [world,setWorld]=useState<'earth'|'training'>('training');
  const [earthStatus,setEarthStatus]=useState('Loading Delhi satellite imagery…');
  const [earthInput,setEarthInput]=useState<NavigationInput>(()=>/Mac|iPad|iPhone/.test(navigator.platform)?'trackpad':'mouse');
  const [quality,setQuality]=useState<'balanced'|'high'>('balanced');
  const [track,setTrack]=useState(0);
  const [sensorCue,setSensorCue]=useState(false);
  const [sensorMode,setSensorMode]=useState<SensorMode>('eo');
  const [zoomIndex,setZoomIndex]=useState(2);
  const [sensorOpen,setSensorOpen]=useState(true);
  const [telemetry,setTelemetry]=useState<SensorTelemetry|null>(null);
  const [thermal,setThermal]=useState(false);
  const [palette,setPalette]=useState<ThermalPalette>('white');
  const [audioOn,setAudioOn]=useState(()=>{try{return localStorage.getItem('aeron-audio')!=='off';}catch{return true;}});
  const sceneRef=useRef<HTMLDivElement>(null);
  const updateBearing=useCallback((value:number)=>setBearing(value),[]);
  // A new scenario has new tracks: drop the previous cue so the sensor returns to standby.
  useEffect(()=>{setTrack(0);setSensorCue(false);setTelemetry(null);},[scenario]);
  const metresPerUnit=world==='earth'?8:1;
  // Satellite photography carries no thermal information, so thermal is offered in the 3D district only.
  const thermalActive=thermal&&world==='training';
  const toggleAudio=useCallback(()=>setAudioOn(on=>{try{localStorage.setItem('aeron-audio',on?'off':'on');}catch{/* preference only */}return !on;}),[]);
  const toggleFullscreen=useCallback(()=>{if(document.fullscreenElement)void document.exitFullscreen();else void sceneRef.current?.requestFullscreen().catch(()=>onNotice?.('Fullscreen is unavailable in this preview.'));},[onNotice]);
  // Rotor sound from the listener at the radar observer. It plays only while the exercise or replay
  // clock is advancing, so hold, preview and a paused replay are silent. Kites are effectively silent.
  useEffect(()=>{
    const airframe=airframeFor(scenario);
    if(!audioOn||!airframe||(phase!=='running'&&phase!=='replay'))return;
    const audio=new RotorAudio();let frame=0,last=-1;
    const tick=()=>{
      const t=time.current,advancing=t!==last;last=t;
      if(!advancing||document.hidden)audio.silence();
      else{
        let nearest=Infinity,pitch=airframe.bladePassHz;const levels:number[]=[];
        for(const {id} of visibleContacts(scenario,t)){
          const k=contactKinematics(scenario,t,id),[x,y,z]=k.position;
          const range=Math.hypot(x*metresPerUnit,y*metresPerUnit-1.6,(z-12)*metresPerUnit);
          levels.push(Math.min(1,rotorLevel(range)*airframe.loudness));
          if(range<nearest){nearest=range;pitch=bladePass(airframe.bladePassHz,k.speed,k.forwardAccel);}
        }
        audio.update(combinedLevel(levels),pitch);
      }
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);audio.dispose();};
  },[audioOn,scenario,phase,metresPerUnit,time]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const element=event.target as HTMLElement;
      if(element.closest('input,select,textarea')||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
      if(document.querySelector('[aria-modal="true"]'))return;
      const k=event.key.toLowerCase();
      if(k==='t'&&displayTime>=scenario.arrival){setTrack(t=>(Math.min(t,scenario.count-1)+1)%scenario.count);setSensorCue(true);setSensorOpen(true);}
      if(k==='i'){setSensorMode(m=>m==='eo'?'ir':'eo');setSensorOpen(true);}
      if(k==='f')toggleFullscreen();
      if(k==='m')toggleAudio();
      if(k==='h')setThermal(on=>!on);
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[displayTime,scenario,toggleAudio,toggleFullscreen]);
  const sensorActive=(selected||sensorCue)&&displayTime>=scenario.arrival;
  const views: {id:CameraView;label:string}[]=[{id:'overview',label:'Overview'},{id:'rooftop',label:'Rooftop'},{id:'street',label:'Street'}];
  const stateLabel=phase==='running'?'LIVE':phase==='paused'?'HOLD':phase==='replay'?'REPLAY':'PREVIEW';
  const radar=<Radar scenario={scenario} time={displayTime} selected={selected} paused={phase==='paused'||phase==='preview'} preview={phase==='preview'} replay={phase==='replay'} bearing={bearing} metresPerUnit={metresPerUnit} track={track} assessment={assessment} onTrack={id=>{setTrack(id);setSensorCue(true);setSensorOpen(true);}} onSelect={onSelect}/>;
  const trackLabel=`T${(Math.min(track,scenario.count-1)+1).toString().padStart(2,'0')}`;
  return <div ref={sceneRef} className={`scene ${phase==='replay'?'replay-scene':''} world-${world}`}>
    <svg className="filter-defs" aria-hidden><filter id="thermal-iron" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="0 .25 .62 .9 1 1"/><feFuncG type="table" tableValues="0 0 .08 .38 .76 1"/><feFuncB type="table" tableValues="0 .42 .5 .08 0 .85"/></feComponentTransfer></filter></svg>
    <div className={`main-view ${thermalActive?`thermal palette-${palette}`:''}`}><SceneBoundary label="3D view"><Suspense fallback={<div className="canvas-error"><span className="loader"/>Preparing the scene…</div>}>{world==='earth'?<EarthScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'} onStatus={setEarthStatus} onHome={()=>onCameraChange('overview')} input={earthInput} onInputChange={setEarthInput} onTutorialOpen={()=>onPause?.()}/>:<Canvas shadows camera={{position:[28,22,42],fov:44,near:.2,far:600}} dpr={quality==='high'?[1,2]:[1,1.25]} gl={{antialias:true,toneMappingExposure:.9}}><DelhiScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'} thermal={thermalActive}/></Canvas>}</Suspense></SceneBoundary></div>
    <div className="scene-vignette" aria-hidden/>
    <div className="scene-hud-top">
      <div className="scene-id">
        <div className={`scene-state state-${stateLabel.toLowerCase()}`}><span className="state-dot"/>{stateLabel}<i/>{thermalActive?`LWIR · ${paletteLabels[palette].toUpperCase()}`:scenario.dusk?'DUSK':'DAY'}<i/>{scenario.difficulty==='challenge'?'DENSE HAZE':'LIGHT HAZE'}</div>
        <div className="scene-coordinate"><strong>{world==='earth'?'NEW DELHI · INDIA GATE':'TRAINING DISTRICT · SECTOR 01'}</strong><span>{world==='earth'?'28.6126° N  77.2268° E':'SYNTHETIC CITY BLOCK · 1 UNIT = 1 m'}</span></div>
        {world==='earth'&&<div className="earth-source" role="status">{earthStatus}</div>}
      </div>
      <HeadingTape bearing={bearing}/>
      <div className="scene-tools">
        <div className="world-switch segmented-dark" role="group" aria-label="Environment"><button aria-pressed={world==='training'} onClick={()=>setWorld('training')}>3D district</button><button aria-pressed={world==='earth'} onClick={()=>setWorld('earth')}>Satellite</button></div>
        <button className="icon-button" title={scenario.category==='Bird'?'Rotor audio (kites are silent at range)':audioOn?'Mute rotor audio (M)':'Unmute rotor audio (M)'} aria-label={audioOn?'Mute rotor audio':'Unmute rotor audio'} aria-pressed={!audioOn} onClick={toggleAudio}>{audioOn?<Volume2 size={15}/>:<VolumeX size={15}/>}</button>
        <button className="icon-button" title="Fullscreen (F)" aria-label="Expand scene" onClick={toggleFullscreen}><Maximize2 size={15}/></button>
      </div>
    </div>
    <div className="view-modes"><div className="segmented-dark" role="group" aria-label="Sensor band"><button aria-pressed={!thermalActive} onClick={()=>setThermal(false)}>Visible</button><button aria-pressed={thermalActive} disabled={world==='earth'} title={world==='earth'?'Thermal view needs the 3D district: satellite photos contain no heat data':'Long-wave infrared view (H)'} onClick={()=>setThermal(true)}>Thermal</button></div>
      {thermalActive&&<label className="palette-control"><span className="sr-only">Thermal palette</span><select aria-label="Thermal palette" value={palette} onChange={e=>setPalette(e.target.value as ThermalPalette)}>{(Object.keys(paletteLabels) as ThermalPalette[]).map(p=><option key={p} value={p}>{paletteLabels[p]}</option>)}</select></label>}</div>
    <div className="camera-presets segmented-dark" role="group" aria-label="Camera position">{views.map(view=><button key={view.id} aria-pressed={cameraView===view.id} onClick={()=>onCameraChange(view.id)}>{view.label}</button>)}</div>
    <div className="reticle" aria-hidden><span/><span/><span/><span/></div>
    {sensorOpen?<section className={`eo-panel ${sensorActive?'eo-live':''} eo-${sensorMode} palette-${palette}`} aria-label="Electro-optical sensor feed">
      <header className="eo-head"><span className="eo-name">EO-1 <i>{sensorMode==='ir'?`IR · ${{white:'WH',black:'BH',iron:'IRON'}[palette]}`:'DAY TV'}</i></span>
        <div className="eo-modes" role="group" aria-label="Sensor band"><button aria-pressed={sensorMode==='eo'} onClick={()=>setSensorMode('eo')}>EO</button><button aria-pressed={sensorMode==='ir'} onClick={()=>setSensorMode('ir')}>IR</button></div>
        <button className="eo-close" aria-label="Hide sensor feed" title="Hide sensor feed" onClick={()=>setSensorOpen(false)}><VideoOff size={13}/></button></header>
      <div className="eo-view">
        {sensorActive?<SceneBoundary label="Sensor feed"><SensorFeed scenario={scenario} time={time} track={track} metresPerUnit={metresPerUnit} mode={sensorMode} zoom={zoomLevels[zoomIndex].factor} onTelemetry={setTelemetry}/></SceneBoundary>
          :<div className="eo-standby"><strong>SENSOR STANDBY</strong><span>{phase==='running'?'Mark an observation or select a radar track to slew the camera.':'Select a radar track to slew the camera.'}</span></div>}
        {sensorActive&&<><svg className="eo-reticle" viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden><path d="M50 22v-9M50 40v9M38 31h-9M62 31h9"/><path d="M41 25v-3h3M56 22h3v3M59 37v3h-3M44 40h-3v-3" className="eo-gate"/></svg>
          <div className="eo-overlay-top"><span>{trackLabel} · AUTO TRACK</span><span>{zoomLevels[zoomIndex].label}{telemetry?` ${telemetry.fov.toFixed(1)}°`:''}</span></div>
          <div className="eo-zoom"><button aria-label="Widen field of view" disabled={zoomIndex===0} onClick={()=>setZoomIndex(i=>i-1)}><Minus size={12}/></button><button aria-label="Narrow field of view" disabled={zoomIndex===zoomLevels.length-1} onClick={()=>setZoomIndex(i=>i+1)}><Plus size={12}/></button></div></>}
        <div className="eo-grain" aria-hidden/>
      </div>
      <footer className="eo-foot">{sensorActive&&telemetry?<><span>AZ <b>{telemetry.azimuth.toFixed(1).padStart(5,'0')}°</b></span><span>EL <b>{telemetry.elevation.toFixed(1)}°</b></span><span>RNG <b>{Math.round(telemetry.range)} m</b></span><span>SPAN≈<b>{telemetry.span.toFixed(2)} m</b></span></>:<span>AZ — · EL — · RNG — · SPAN —</span>}</footer>
    </section>:<button className="eo-show" onClick={()=>setSensorOpen(true)}><Video size={14}/>Show EO/IR sensor</button>}
    {radarTarget?createPortal(radar,radarTarget):radar}
    <div className="scene-bottom"><span className="scene-hint">{world==='earth'?(earthInput==='trackpad'?'Click-drag to pan · Two-finger scroll to orbit · Pinch to zoom':'Drag to pan · Scroll to zoom · Right-drag to orbit'):'Drag to orbit · Scroll to zoom · Click an aircraft to observe'}</span><label className="quality-control"><span>GFX</span><select aria-label="Graphics quality" value={quality} onChange={e=>setQuality(e.target.value as 'balanced'|'high')}><option value="balanced">Balanced</option><option value="high">High</option></select></label></div>
    {phase==='paused'&&<div className="pause-overlay"><Pause size={26}/><h3>Exercise on hold</h3><p>The exercise clock, radar and sensor are frozen.</p><button onClick={onResume}><Play size={15}/>Resume</button></div>}
  </div>;
}
