import { Component, lazy, Suspense, useCallback, useState, type MutableRefObject, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Focus, Maximize2, Pause, Play } from 'lucide-react';
const EarthScene = lazy(() => import('./EarthScene'));
const DelhiScene = lazy(() => import('./DelhiScene'));
import Radar from './Radar';
import type { CameraView, Scenario } from './simulation';
class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="canvas-error"><Focus size={32}/><h3>3D view unavailable</h3><p>Try hardware acceleration in your browser.</p></div>:this.props.children;}
}
type Props = { scenario:Scenario; time:MutableRefObject<number>; displayTime:number; selected:boolean; phase:'preview'|'running'|'paused'|'replay'; cameraView:CameraView; onCameraChange:(view:CameraView)=>void; onSelect:()=>void; onResume?:()=>void; onNotice?:(notice:string)=>void };
export default function SceneView({scenario,time,displayTime,selected,phase,cameraView,onCameraChange,onSelect,onResume,onNotice}:Props) {
  const [bearing,setBearing]=useState(0);
  const [world,setWorld]=useState<'earth'|'training'>('earth');
  const [earthStatus,setEarthStatus]=useState('Loading Delhi satellite imagery…');
  const [quality,setQuality]=useState<'balanced'|'high'>('balanced');
  const updateBearing=useCallback((value:number)=>setBearing(value),[]);
  const views: {id:CameraView;label:string}[]=[{id:'overview',label:'Overview'},{id:'rooftop',label:'Rooftop'},{id:'street',label:'Street level'}];
  return <div className={`scene ${phase==='replay'?'replay-scene':''}`}>
    <SceneBoundary><Suspense fallback={<div className="canvas-error">Preparing the district…</div>}>{world==='earth'?<EarthScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'} onStatus={setEarthStatus}/>:<Canvas shadows camera={{position:[28,22,42],fov:44,near:.2,far:600}} dpr={quality==='high'?[1,2]:[1,1.25]} gl={{antialias:true,toneMappingExposure:.9}}><DelhiScene scenario={scenario} time={time} selected={selected} onSelect={onSelect} cameraView={cameraView} onBearingChange={updateBearing} highQuality={quality==='high'}/></Canvas>}</Suspense></SceneBoundary>
    <div className="scene-top"><div className="scene-title"><span className={phase==='running'?'live-dot':'idle-dot'}/>{phase==='running'?'SESSION LIVE':phase==='paused'?'SESSION PAUSED':phase==='replay'?'SESSION REPLAY':'SCENE PREVIEW'}<span className="scene-title-divider"/>{scenario.dusk?'DUSK':'DAYLIGHT'}</div><button className="icon-button" title="Expand scene" aria-label="Expand scene" onClick={e=>{const element=e.currentTarget.closest('.scene');if(document.fullscreenElement)void document.exitFullscreen();else void element?.requestFullscreen().catch(()=>onNotice?.('Fullscreen is unavailable in this preview.'));}}><Maximize2 size={17}/></button></div>
    <div className="scene-coordinate"><span>{world==='earth'?'28.6126° N / 77.2268° E':'TRAINING ENVIRONMENT'}</span><strong>{world==='earth'?'NEW DELHI / INDIA GATE DISTRICT':'NEW DELHI / SECTOR 01'}</strong></div>
    <div className="world-switch" aria-label="Environment"><button aria-pressed={world==='earth'} onClick={()=>setWorld('earth')}>Earth view</button><button aria-pressed={world==='training'} onClick={()=>setWorld('training')}>Training scene</button></div>
    {world==='earth'&&<div className="earth-source" role="status">{earthStatus}</div>}
    <div className="camera-presets" aria-label="Camera position">{views.map(view=><button key={view.id} className={cameraView===view.id?'camera-active':''} aria-pressed={cameraView===view.id} onClick={()=>onCameraChange(view.id)}>{view.label}</button>)}</div>
    <div className="reticle"><span/><span/><span/><span/></div>
    <Radar scenario={scenario} time={displayTime} selected={selected} paused={phase==='paused'||phase==='preview'} preview={phase==='preview'} replay={phase==='replay'} bearing={bearing} metresPerUnit={world==='earth'?8:1} onSelect={onSelect}/>
    <div className="hud-readout"><span>URBAN OBSERVATION</span><strong>HDG {bearing.toString().padStart(3,'0')}°</strong><span>{scenario.difficulty==='challenge'?'DENSE HAZE':'LIGHT HAZE'} / {phase==='replay'?'REPLAY':phase==='preview'?'PREVIEW':'EXERCISE'}</span></div>
    <div className="scene-bottom"><span><Focus size={15}/>{world==='earth'?'Drag to pan · Right drag to orbit':'Drag to orbit'} <i/> Scroll to zoom</span><label className="quality-control"><span>GRAPHICS</span><select aria-label="Graphics quality" value={quality} onChange={e=>setQuality(e.target.value as 'balanced'|'high')}><option value="balanced">Balanced</option><option value="high">High</option></select></label></div>
    {phase==='paused'&&<div className="pause-overlay"><Pause size={28}/><h3>Take a moment.</h3><p>Your exercise clock is paused.</p><button onClick={onResume}><Play size={16}/>Resume</button></div>}
  </div>;
}
