import { Component, lazy, Suspense, useCallback, useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { Focus, Maximize2, Minus, Pause, Play, Plus, Video, VideoOff } from 'lucide-react';
const EarthScene = lazy(() => import('./EarthScene'));
const DelhiScene = lazy(() => import('./DelhiScene'));
import Radar from './Radar';
import SensorFeed, { type SensorMode, type SensorTelemetry } from './SensorFeed';
import type { CameraView, Category, Scenario } from './simulation';
import type { NavigationInput } from './earthNavigationMath';
class SceneBoundary extends Component<{children:ReactNode;label:string},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="canvas-error"><Focus size={28}/><h3>{this.props.label} unavailable</h3><p>Enable hardware acceleration in your browser.</p></div>:this.props.children;}
}
type Props = { scenario:Scenario; time:MutableRefObject<number>; displayTime:number; selected:boolean; phase:'preview'|'running'|'paused'|'replay'; cameraView:CameraView; onCameraChange:(view:CameraView)=>void; onSelect:()=>void; onResume?:()=>void; onNotice?:(notice:string)=>void; radarTarget?:HTMLElement|null; assessment?:Category|'' };
const zoomLevels=[{factor:6,label:'WFOV'},{factor:2.5,label:'MFOV'},{factor:1,label:'NFOV'}];
const cardinal:Record<number,string>={0:'N',90:'E',180:'S',270:'W'};
function HeadingTape({bearing}:{bearing:number}) {
  const ticks:number[]=[];for(let d=Math.ceil((bearing-50)/5)*5;d<=bearing+50;d+=5)ticks.push(d);
  return <div className="heading-tape" aria-label={`Camera heading ${bearing} degrees`}>
    <div className="tape-window">{ticks.map(d=>{const n=((d%360)+360)%360;return <span key={d} className={n%30===0?'tick major':n%10===0?'tick minor':'tick'} style={{left:`${(d-bearing)/100*100+50}%`}}>{n%30===0&&<b>{cardinal[n]??n.toString().padStart(3,'0')}</b>}</span>;})}</div>
    <strong>{bearing.toString().padStart(3,'0')}°</strong>
  </div>;
}
export default function SceneView({scenario,time,displayTime,selected,phase,cameraView,onCameraChange,onSelect,onResume,onNotice,radarTarget,assessment=''}:Props) {
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
  const updateBearing=useCallback((value:number)=>setBearing(value),[]);
  // A new scenario has new tracks: drop the previous cue so the sensor returns to standby.
  useEffect(()=>{setTrack(0);setSensorCue(false);setTelemetry(null);},[scenario]);
  const metresPerUnit=world==='earth'?8:1;
  const sensorActive=(selected||sensorCue)&&displayTime>=scenario.arrival;
  const views: {id:CameraView;label:string}[]=[{id:'overview',label:'Overview'},{id:'rooftop',label:'Rooftop'},{id:'street',label:'Street'}];
  const stateLabel=phase==='running'?'LIVE':phase==='paused'?'HOLD':phase==='replay'?'REPLAY':'PREVIEW';
  const radar=<Radar scenario={scenario} time={displayTime} selected={selected} paused={phase==='paused'||phase==='preview'} preview={phase==='preview'} replay={phase==='replay'} bearing={bearing} metresPerUnit={metresPerUnit} track={track} assessment={assessment} onTrack={id=>{setTrack(id);setSensorCue(true);setSensorOpen(true);}} onSelect={onSelect}/>;
  const trackLabel=`T${(Math.min(track,scenario.count-1)+1).toString().padStart(2,'0')}`;
  return <div className={`scene ${phase==='replay'?'replay-scene':''} world-${world}`}>
    <SceneBoundary label="3D view"><Suspense fallback={<div className="canvas-error"><span className="loader"/>Preparing the scene…</div>}>{world==='earth'?<EarthScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'} onStatus={setEarthStatus} onHome={()=>onCameraChange('overview')} input={earthInput} onInputChange={setEarthInput}/>:<Canvas shadows camera={{position:[28,22,42],fov:44,near:.2,far:600}} dpr={quality==='high'?[1,2]:[1,1.25]} gl={{antialias:true,toneMappingExposure:.9}}><DelhiScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'}/></Canvas>}</Suspense></SceneBoundary>
    <div className="scene-vignette" aria-hidden/>
    <div className="scene-hud-top">
      <div className="scene-id">
        <div className={`scene-state state-${stateLabel.toLowerCase()}`}><span className="state-dot"/>{stateLabel}<i/>{scenario.dusk?'DUSK':'DAY'}<i/>{scenario.difficulty==='challenge'?'DENSE HAZE':'LIGHT HAZE'}</div>
        <div className="scene-coordinate"><strong>{world==='earth'?'NEW DELHI · INDIA GATE':'TRAINING DISTRICT · SECTOR 01'}</strong><span>{world==='earth'?'28.6126° N  77.2268° E':'SYNTHETIC CITY BLOCK · 1 UNIT = 1 m'}</span></div>
        {world==='earth'&&<div className="earth-source" role="status">{earthStatus}</div>}
      </div>
      <HeadingTape bearing={bearing}/>
      <div className="scene-tools">
        <div className="world-switch segmented-dark" role="group" aria-label="Environment"><button aria-pressed={world==='training'} onClick={()=>setWorld('training')}>3D district</button><button aria-pressed={world==='earth'} onClick={()=>setWorld('earth')}>Satellite</button></div>
        <button className="icon-button" title="Expand scene" aria-label="Expand scene" onClick={e=>{const element=e.currentTarget.closest('.scene');if(document.fullscreenElement)void document.exitFullscreen();else void element?.requestFullscreen().catch(()=>onNotice?.('Fullscreen is unavailable in this preview.'));}}><Maximize2 size={15}/></button>
      </div>
    </div>
    <div className="camera-presets segmented-dark" role="group" aria-label="Camera position">{views.map(view=><button key={view.id} aria-pressed={cameraView===view.id} onClick={()=>onCameraChange(view.id)}>{view.label}</button>)}</div>
    <div className="reticle" aria-hidden><span/><span/><span/><span/></div>
    {sensorOpen?<section className={`eo-panel ${sensorActive?'eo-live':''} eo-${sensorMode}`} aria-label="Electro-optical sensor feed">
      <header className="eo-head"><span className="eo-name">EO-1 <i>{sensorMode==='ir'?'LWIR · WHITE HOT':'DAY TV'}</i></span>
        <div className="eo-modes" role="group" aria-label="Sensor band"><button aria-pressed={sensorMode==='eo'} onClick={()=>setSensorMode('eo')}>EO</button><button aria-pressed={sensorMode==='ir'} onClick={()=>setSensorMode('ir')}>IR</button></div>
        <button className="eo-close" aria-label="Hide sensor feed" title="Hide sensor feed" onClick={()=>setSensorOpen(false)}><VideoOff size={13}/></button></header>
      <div className="eo-view">
        {sensorActive?<SceneBoundary label="Sensor feed"><SensorFeed scenario={scenario} time={time} track={track} metresPerUnit={metresPerUnit} mode={sensorMode} zoom={zoomLevels[zoomIndex].factor} onTelemetry={setTelemetry}/></SceneBoundary>
          :<div className="eo-standby"><strong>SENSOR STANDBY</strong><span>{phase==='running'?'Mark an observation or select a radar track to slew the camera.':'Select a radar track to slew the camera.'}</span></div>}
        {sensorActive&&<><svg className="eo-reticle" viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden><path d="M50 22v-9M50 40v9M38 31h-9M62 31h9"/><path d="M41 25v-3h3M56 22h3v3M59 37v3h-3M44 40h-3v-3" className="eo-gate"/></svg>
          <div className="eo-overlay-top"><span>{trackLabel} · AUTO TRACK</span><span>{zoomLevels[zoomIndex].label}</span></div>
          <div className="eo-zoom"><button aria-label="Widen field of view" disabled={zoomIndex===0} onClick={()=>setZoomIndex(i=>i-1)}><Minus size={12}/></button><button aria-label="Narrow field of view" disabled={zoomIndex===zoomLevels.length-1} onClick={()=>setZoomIndex(i=>i+1)}><Plus size={12}/></button></div></>}
        <div className="eo-grain" aria-hidden/>
      </div>
      <footer className="eo-foot">{sensorActive&&telemetry?<><span>AZ <b>{telemetry.azimuth.toFixed(1).padStart(5,'0')}°</b></span><span>EL <b>{telemetry.elevation.toFixed(1)}°</b></span><span>RNG <b>{Math.round(telemetry.range)} m</b></span><span>HFOV <b>{telemetry.fov.toFixed(2)}°</b></span></>:<span>AZ — · EL — · RNG — · HFOV —</span>}</footer>
    </section>:<button className="eo-show" onClick={()=>setSensorOpen(true)}><Video size={14}/>Show EO/IR sensor</button>}
    {radarTarget?createPortal(radar,radarTarget):radar}
    <div className="scene-bottom"><span className="scene-hint">{world==='earth'?(earthInput==='trackpad'?'Scroll to pan · Pinch to zoom · Shift + scroll to orbit':'Drag to pan · Scroll to zoom · Right-drag to orbit'):'Drag to orbit · Scroll to zoom · Click an aircraft to observe'}</span><label className="quality-control"><span>GFX</span><select aria-label="Graphics quality" value={quality} onChange={e=>setQuality(e.target.value as 'balanced'|'high')}><option value="balanced">Balanced</option><option value="high">High</option></select></label></div>
    {phase==='paused'&&<div className="pause-overlay"><Pause size={26}/><h3>Exercise on hold</h3><p>The exercise clock, radar and sensor are frozen.</p><button onClick={onResume}><Play size={15}/>Resume</button></div>}
  </div>;
}
