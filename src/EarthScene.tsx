import { flightForContact } from './contactFlight';
import { lightingOf } from './environment';
import { earthEnvironmentStage } from './earthEnvironment';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ArcGisMapServerImageryProvider, ArcGISTiledElevationTerrainProvider, CallbackPositionProperty, CallbackProperty,
  BoundingSphere, Cartesian2, Cartesian3, Cartographic, Color, ConstantProperty, HeadingPitchRange, HeadingPitchRoll, ImageryLayer,
  Ion, JulianDate, LabelStyle, Math as CesiumMath, Matrix4, NodeTransformationProperty, PropertyBag, Quaternion, ScreenSpaceEventHandler,
  ScreenSpaceEventType, Transforms, VerticalOrigin, Viewer, createGooglePhotorealistic3DTileset, sampleTerrainMostDetailed,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { contactCategory, contactPosition, type CameraView, type Position, type Scenario } from './simulation';
import { earthRadarObserver } from './earthRadarObserver';
import { attachEarthNavigation, type EarthNavigation } from './earthNavigation';
import type { NavigationInput } from './earthNavigationMath';
import { Compass, Home, Minus, Plus, HelpCircle } from 'lucide-react';
import GestureTutorial from './GestureTutorial';
import { birdAttitude, contactKinematics, droneAttitude, wingBeat } from './kinematics';
import { airframeFor } from './airframes';
import { Euler, Quaternion as ThreeQuaternion } from 'three';
import { sampleFlight } from './flightRuntime';
import { FLIGHT_PROFILES } from './flightProfiles';
import { rotate, add, scale } from './flightMath';
import { cameraFraming, groundSamplePoints, type Theatre } from './theatres';

type Props = {
  scenario: Scenario; time: MutableRefObject<number>; selected: boolean; highlightedTrack?: number; theatre: Theatre; labels: boolean;
  cameraView: CameraView; highQuality: boolean; onSelect: (id: number) => void;
  onBearingChange: (bearing: number) => void; onStatus: (status: string) => void; onGround?: (height: number) => void;
  onObserverChange: (observer: Position) => void;
  onHome:()=>void; onTutorialOpen:()=>void; input:NavigationInput; onInputChange:(input:NavigationInput)=>void;
  pilotCamera?:'chase'|'fpv'|'free';onFreeCamera?:()=>void;
};
const env = (import.meta as ImportMeta & {env: Record<string, string | undefined>}).env;
const googleKey = env.VITE_GOOGLE_MAPS_API_KEY;
const ionToken = env.VITE_CESIUM_ION_TOKEN;
const hasPhotorealisticAccess = Boolean(googleKey || ionToken);
const ELEVATION_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
/** Height of the camera's look-at point above the airspace datum: the exercise airspace, not the ground. */
const lookAbove = (t: Theatre) => t.kind === 'mountain' ? 120 : 70;

/** Raises the camera if a framing would leave it inside a slope or a building. */
function keepAboveGround(viewer: Viewer) {
  const c = viewer.camera.positionCartographic.clone();
  const ground = viewer.scene.globe.show ? viewer.scene.globe.getHeight(c) : viewer.scene.sampleHeight(c);
  if (ground !== undefined && c.height < ground + 40) {
    viewer.camera.setView({ destination: Cartesian3.fromRadians(c.longitude, c.latitude, ground + 80), orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 } });
  }
}
function frameCamera(viewer: Viewer, theatre: Theatre, view: CameraView, ground: number, duration: number) {
  if (theatre.kind === 'synthetic' || viewer.isDestroyed()) return;
  const f = cameraFraming[theatre.kind][view];
  const target = Cartesian3.fromDegrees(theatre.longitude!, theatre.latitude!, ground + lookAbove(theatre));
  const offset = new HeadingPitchRange(CesiumMath.toRadians(f.heading), CesiumMath.toRadians(f.pitch), f.range);
  if (!duration) { viewer.camera.lookAt(target, offset); viewer.camera.lookAtTransform(Matrix4.IDENTITY); keepAboveGround(viewer); return; }
  // The same anchor keeps every camera preset looking at the exercise airspace.
  viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 10), { duration, offset, complete: () => keepAboveGround(viewer) });
}
/**
 * Airspace datum: the highest ground within ~320 m of the site, so contacts fly over ridges rather
 * than through them. Uses the rendered surface (3D tiles or terrain); falls back to the nominal elevation.
 */
async function sampleGround(viewer: Viewer, theatre: Theatre, tiles: boolean) {
  const points = groundSamplePoints(theatre).map(([lon, lat]) => Cartographic.fromDegrees(lon, lat));
  try {
    const sampling = tiles ? viewer.scene.sampleHeightMostDetailed(points) : sampleTerrainMostDetailed(viewer.terrainProvider, points);
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 9000));
    const sampled = await Promise.race([sampling, timeout]);
    const heights = (sampled ?? []).map(c => c?.height).filter((h): h is number => Number.isFinite(h));
    if (heights.length) return Math.max(...heights);
  } catch { /* fall through to the nominal elevation */ }
  return theatre.elevation ?? 0;
}

export default function EarthScene(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const current = useRef(props);
  const groundHeight = useRef(props.theatre.elevation ?? 0);
  const ready = useRef<Promise<boolean>>(Promise.resolve(false));
  const navigation = useRef<EarthNavigation|null>(null);
  const home = useRef<()=>void>(()=>{});
  const interacted = useRef(false);
  const previousView = useRef(props.cameraView);
  const {input}=props;
  const [help,setHelp]=useState(() => {
    if(props.pilotCamera)return false;
    try { return sessionStorage.getItem('aeron-gesture-guide-v2') !== 'seen'; }
    catch { return true; }
  });
  const closeHelp = () => {
    setHelp(false);
    try { sessionStorage.setItem('aeron-gesture-guide-v2', 'seen'); } catch { /* Guide remains usable without storage. */ }
  };
  const openHelp = () => { navigation.current?.cancel(); props.onTutorialOpen(); setHelp(true); };
  current.current = props;

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    Ion.defaultAccessToken = ionToken || '';
    const viewer = new Viewer(container.current, {
      baseLayer: false, animation: false, timeline: false, geocoder: false,
      homeButton: false, sceneModePicker: false, baseLayerPicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: false, shadows: false,
      contextOptions: { webgl: { alpha: false, antialias: true } },
    });
    viewerRef.current = viewer;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.baseColor = Color.fromCssColorString('#213343');
    viewer.scene.backgroundColor = Color.fromCssColorString('#0c1725');
    viewer.scene.fog.density = .00008;

    viewer.cesiumWidget.creditContainer.classList.add('earth-credits');
    viewer.scene.postProcessStages.fxaa.enabled = true;
    // Sun-lit relief shading makes ridgelines and valleys read like a real aerial view.
    viewer.scene.globe.enableLighting = true;
    viewer.clock.currentTime = JulianDate.fromIso8601('2026-10-04T06:00:00Z');

    const anchor = () => { const t = current.current.theatre; return Cartesian3.fromDegrees(t.longitude ?? 0, t.latitude ?? 0, current.current.scenario.flight?.terrain.datum??groundHeight.current); };
    const frame = () => Transforms.eastNorthUpToFixedFrame(anchor());
    const contactPoint = (index: number, result?: Cartesian3) => {
      const [x,y,z] = contactPosition(current.current.scenario, current.current.time.current, index);
      // Version 4 uses metres in both renderers; historical encounters retain their Earth scale.
      const units=current.current.scenario.version===4?1:8;
      return Matrix4.multiplyByPoint(frame(), new Cartesian3(x*units,-z*units,y*units), result || new Cartesian3());
    };
    // EO/IR and Pilot lab retain real-size models; automatic Earth views use display-size assistance.
    const modelUri = (index=0) => {const s=current.current.scenario,airframe=airframeFor(s,index),flight=flightForContact(s,index);return `/models/${flight?`v3-${flight.model}`:airframe?`drone-${airframe.id}`:'bird'}.glb`;};
    const attitude = (index: number) => {
      const {scenario,time} = current.current, k = contactKinematics(scenario, time.current, index);
      if(k.flight){const e=new Euler().setFromQuaternion(new ThreeQuaternion(...k.flight.orientation),'YXZ');return {k:{...k,heading:Math.PI-e.y},a:{pitch:e.x,roll:e.z}};}
      return {k, a: contactCategory(scenario,index)==='Bird' ? birdAttitude(k) : droneAttitude(k)};
    };
    // Wing elevation is applied to the named glTF wing nodes, about the airframe's forward axis.
    const wing = (index: number, side: 1 | -1) => new NodeTransformationProperty({rotation: new CallbackProperty(() => {
      const {scenario,time} = current.current;
      return Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, side*(contactCategory(scenario,index)==='Bird' ? scenario.version===4?sampleFlight(scenario,time.current,index).wing.shoulder:wingBeat(time.current, index).angle : 0));
    }, false)});
    const rigNodes=(index:number)=>{
      const nodes:Record<string,NodeTransformationProperty>={'wing-left':wing(index,1),'wing-right':wing(index,-1)};
      const node=(name:string,axis:Cartesian3,angle:()=>number)=>{nodes[name]=new NodeTransformationProperty({rotation:new CallbackProperty(()=>Quaternion.fromAxisAngle(axis,angle()),false)});};
      const state=()=>{const s=current.current.scenario;return s.version===4?sampleFlight(s,current.current.time.current,index):undefined;};
      for(const side of [1,-1])for(const joint of ['elbow','wrist'] as const)node(`${joint}-${side===1?'left':'right'}`,Cartesian3.UNIT_Z,()=>side*(state()?.wing[joint]??0));
      nodes.tail=new NodeTransformationProperty({rotation:new CallbackProperty(()=>{
        const s=state(),pitch=Quaternion.fromAxisAngle(Cartesian3.UNIT_X,s?.wing.tail??0),yaw=Quaternion.fromAxisAngle(Cartesian3.UNIT_Y,(s?.angularVelocity[1]??0)*.06);
        return Quaternion.multiply(pitch,yaw,new Quaternion());
      },false)});
      for(let i=0;i<6;i++){
        nodes[`prop-${i}`]=new NodeTransformationProperty({rotation:new CallbackProperty(()=>{
          const s=current.current.scenario;if(!s.flight)return Quaternion.IDENTITY;
          const p=FLIGHT_PROFILES[flightForContact(s,index)!.model],m=p.motors[i];if(!m)return Quaternion.IDENTITY;
          const spin=p.kind==='fixed-wing'?1:p.motors.length===6?(i%2?1:-1):Math.sign(m[0]*m[2]);
          return Quaternion.fromAxisAngle(p.kind==='fixed-wing'?Cartesian3.UNIT_Z:Cartesian3.UNIT_Y,(state()?.rotorAngles[i]??0)*spin);
        },false)});
      }
      node('aileron-left',Cartesian3.UNIT_X,()=>(state()?.surfaces[2]??0)*.3);node('aileron-right',Cartesian3.UNIT_X,()=>-(state()?.surfaces[2]??0)*.3);
      node('elevator',Cartesian3.UNIT_X,()=>(state()?.surfaces[0]??0)*.3);node('rudder',Cartesian3.UNIT_Y,()=>(state()?.surfaces[1]??0)*.3);
      return new PropertyBag(nodes);
    };
    // Site marker drawn by the app itself; third-party boundary/place overlays are deliberately not used.
    viewer.entities.add({
      id: 'theatre-site',
      position: new CallbackPositionProperty((_time, result) => Cartesian3.clone(anchor(), result), false),
      point: { pixelSize: 7, color: Color.fromCssColorString('#ff8a3d'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY, show: new CallbackProperty(() => current.current.labels, false) },
      label: {
        text: new CallbackProperty(() => `${current.current.theatre.name.toUpperCase()}\n${current.current.theatre.region}`, false),
        font: '600 13px "IBM Plex Sans", system-ui, sans-serif', fillColor: Color.WHITE, outlineColor: Color.fromCssColorString('#05080c'), outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY, show: new CallbackProperty(() => current.current.labels, false),
      },
    });
    const contacts: Entity[] = [];
    const details:boolean[]=[];
    // Entities are added on demand so every generated contact is represented, whatever the count.
    const ensureContacts = (count: number) => {
      while (contacts.length < count) {
        const index = contacts.length;
        contacts.push(viewer.entities.add({
          id: `training-contact-${index}`,
          position: new CallbackPositionProperty((_time, result) => contactPoint(index,result), false),
          // glTF noses point along +Z, which Cesium presents as local east at zero heading.
          orientation: new CallbackProperty(() => {const {k,a} = attitude(index); return Transforms.headingPitchRollQuaternion(contactPoint(index), new HeadingPitchRoll(k.heading - Math.PI/2, -a.pitch, a.roll));}, false),
          model: {
            // Allow minimumPixelSize to work at the 2.6 km mountain overview,
            // while keeping display enlargement bounded when zooming farther out.
            uri: modelUri(index), scale: 1, minimumPixelSize: 0, maximumScale: 256,
            silhouetteColor: Color.fromCssColorString('#ffd25a'), silhouetteSize: 0,
            nodeTransformations: rigNodes(index),
          },
        }));
      }
    };
    let contactConfig = '', lastDatum = NaN;
    const lastCameraPosition = new Cartesian3(), lastCameraDirection = new Cartesian3();
    let lastFollow=performance.now();
    const update = viewer.scene.preRender.addEventListener(() => {
      const {pilotCamera,scenario:flightScenario}=current.current;
      if(pilotCamera&&pilotCamera!=='free'&&flightScenario.flight){
        navigation.current?.cancel();viewer.camera.cancelFlight();
        const s=sampleFlight(flightScenario,current.current.time.current,0),forward=rotate(s.orientation,[0,0,1]),up=rotate(s.orientation,[0,1,0]);
        const localEye=add(s.position,add(scale(forward,pilotCamera==='fpv'?.7:-10),scale(up,pilotCamera==='fpv'?.35:4)));
        const localLook=add(s.position,scale(forward,pilotCamera==='fpv'?100:2));
        const toWorld=(p:number[])=>Matrix4.multiplyByPoint(frame(),new Cartesian3(p[0],-p[2],p[1]),new Cartesian3());
        const eye=toWorld(localEye),look=toWorld(localLook),now=performance.now(),ease=pilotCamera==='fpv'?1:1-Math.exp(-Math.min(.1,(now-lastFollow)/1000)*8);lastFollow=now;
        const dest=Cartesian3.lerp(viewer.camera.positionWC,eye,ease,new Cartesian3());
        const direction=Cartesian3.normalize(Cartesian3.subtract(look,dest,new Cartesian3()),new Cartesian3());
        const worldUp=Matrix4.multiplyByPointAsVector(frame(),new Cartesian3(pilotCamera==='fpv'?up[0]:0,pilotCamera==='fpv'?-up[2]:0,pilotCamera==='fpv'?up[1]:1),new Cartesian3());
        viewer.camera.frustum.near=.05;
        viewer.camera.setView({destination:dest,orientation:{direction,up:worldUp}});
      }else lastFollow=performance.now();
      // Cesium's percentage-based changed event can miss a short drag. Check the pose as well,
      // including native drag inertia, camera flights and asynchronous airspace-datum updates.
      if (!Cartesian3.equals(lastCameraPosition, viewer.camera.positionWC) ||
          !Cartesian3.equals(lastCameraDirection, viewer.camera.directionWC) || lastDatum !== groundHeight.current) updateCamera();
      const {scenario,time,selected,highlightedTrack} = current.current;
      ensureContacts(scenario.count);
      const signature=`${scenario.version}/${scenario.exercise}/${scenario.seed}/${Array.from({length:scenario.count},(_,id)=>modelUri(id)).join(',')}/${scenario.difficulty}/${selected}/${highlightedTrack}/${scenario.count}`;
      for (let index=0;index<contacts.length;index++) {
        const contact=contacts[index];
        contact.show=index<scenario.count && time.current>=scenario.arrival;
        const distance=Cartesian3.distance(viewer.camera.positionWC,contactPoint(index));
        const detail=scenario.version!==4||distance<(details[index]?180:140);
        if (contact.model && (signature!==contactConfig||detail!==details[index])) {
          contact.model.uri = new ConstantProperty(detail?modelUri(index):modelUri(index).replace('.glb','-low.glb'));
          details[index]=detail;
          contact.model.minimumPixelSize = new ConstantProperty(current.current.pilotCamera?0:scenario.difficulty==='guided'?22:12);
          contact.model.silhouetteSize = new ConstantProperty(selected&&(highlightedTrack===undefined||highlightedTrack===index)?1.5:0);
        }
      }
      contactConfig=signature;
    });
    const updateCamera = () => {
      current.current.onBearingChange(Math.round(CesiumMath.toDegrees(viewer.camera.heading))%360);
      const inverse = Matrix4.inverseTransformation(frame(), new Matrix4());
      const scenario=current.current.scenario,plane=scenario.flight?Math.min(...scenario.flight.waypoints.map(p=>p[1])):lookAbove(current.current.theatre);
      const observer = earthRadarObserver(inverse, viewer.camera.positionWC, viewer.camera.directionWC, plane,scenario.version===4?1:8);
      if (observer) current.current.onObserverChange(observer);
      Cartesian3.clone(viewer.camera.positionWC, lastCameraPosition);
      Cartesian3.clone(viewer.camera.directionWC, lastCameraDirection);
      lastDatum = groundHeight.current;
      const element=container.current;
      if(element){
        const point=viewer.camera.positionCartographic;
        element.dataset.cameraLongitude=CesiumMath.toDegrees(point.longitude).toFixed(7);
        element.dataset.cameraLatitude=CesiumMath.toDegrees(point.latitude).toFixed(7);
        element.dataset.cameraHeight=point.height.toFixed(2);
        element.dataset.cameraHeading=CesiumMath.toDegrees(viewer.camera.heading).toFixed(2);
        element.dataset.cameraPitch=CesiumMath.toDegrees(viewer.camera.pitch).toFixed(2);
      }
    };
    const changed = viewer.camera.changed.addEventListener(updateCamera);
    viewer.camera.percentageChanged = .01;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: {position: Cartesian2}) => {
      const pick=viewer.scene.pick(event.position);
      if(pick?.id instanceof Object && typeof pick.id.id==='string' && pick.id.id.startsWith('training-contact-')) current.current.onSelect(Number(pick.id.id.slice('training-contact-'.length)));
    }, ScreenSpaceEventType.LEFT_CLICK);

    frameCamera(viewer, current.current.theatre, current.current.cameraView, groundHeight.current, 0);updateCamera();
    // Home returns to the selected theatre's site, not a fixed city.
    home.current=()=>{
      navigation.current?.cancel();viewer.camera.cancelFlight();interacted.current=true;
      previousView.current='overview';
      frameCamera(viewer, current.current.theatre, 'overview', groundHeight.current, .6);updateCamera();current.current.onHome();
    };
    navigation.current=attachEarthNavigation(viewer,{
      input:()=>current.current.input,
      fallbackTarget:anchor,
      onInteraction:()=>{interacted.current=true;if(current.current.pilotCamera&&current.current.pilotCamera!=='free')current.current.onFreeCamera?.();},onChange:updateCamera,
    });
    /** Resolves true when Google photorealistic tiles are the rendered surface, false for imagery on terrain. */
    async function loadWorld() {
      current.current.onStatus(hasPhotorealisticAccess?'Loading photorealistic 3D tiles…':'Loading satellite imagery and 3D terrain…');
      try {
        if (hasPhotorealisticAccess) {
          const tiles = await createGooglePhotorealistic3DTileset({key:googleKey,onlyUsingWithGoogleGeocoder:true},{maximumScreenSpaceError:12,cacheBytes:256*1024*1024,maximumCacheOverflowBytes:128*1024*1024});
          if(disposed){tiles.destroy();return true;}
          viewer.scene.primitives.add(tiles);
          viewer.scene.globe.show = false;
          current.current.onStatus('GOOGLE PHOTOREALISTIC 3D TILES');
          tiles.tileFailed.addEventListener(() => {if(!disposed)current.current.onStatus('Some 3D tiles could not load — check coverage and API access.');});
          return true;
        }
      } catch {
        if(disposed)return false;
        current.current.onStatus('3D service unavailable — using satellite imagery.');
      }
      let terrain = false;
      try {
        viewer.terrainProvider = await ArcGISTiledElevationTerrainProvider.fromUrl(ELEVATION_URL);
        terrain = true;
      } catch { /* imagery still loads on the smooth ellipsoid */ }
      if(disposed)return false;
      try {
        const provider = await ArcGisMapServerImageryProvider.fromUrl(IMAGERY_URL,{enablePickFeatures:false});
        if(disposed)return false;
        viewer.imageryLayers.add(new ImageryLayer(provider));
        current.current.onStatus(terrain?'ESRI WORLD IMAGERY ON 3D WORLD ELEVATION TERRAIN':'SATELLITE IMAGERY ON ELLIPSOID / TERRAIN SERVICE UNAVAILABLE');
        provider.errorEvent.addEventListener(() => {if(!disposed)current.current.onStatus('Imagery connection interrupted — try the 3D district.');});
      } catch {
        if(!disposed)current.current.onStatus('Satellite imagery unavailable — choose the 3D district.');
      }
      return false;
    }
    ready.current = loadWorld();
    return () => {
      disposed=true;navigation.current?.dispose();navigation.current=null;update();changed();handler.destroy();
      viewerRef.current=null;
      if(!viewer.isDestroyed())viewer.destroy();
    };
  }, []);

  // Moving to a theatre: jump near its nominal elevation at once, then settle on the sampled ground.
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    let cancelled=false;
    const theatre=props.theatre;
    navigation.current?.cancel();viewer.camera.cancelFlight();
    interacted.current=false;
    groundHeight.current=props.scenario.flight?.terrain.datum??theatre.elevation??0;
    frameCamera(viewer, theatre, current.current.cameraView, groundHeight.current, 0);
    if(props.scenario.version===4){props.onGround?.(groundHeight.current);return;}
    void ready.current.then(async tiles => {
      const ground = await sampleGround(viewer, theatre, tiles);
      if(cancelled||viewer.isDestroyed())return;
      groundHeight.current=ground;
      current.current.onGround?.(ground);
      // Re-frame on the sampled ground unless the trainee has already started navigating.
      if(!interacted.current)frameCamera(viewer, theatre, current.current.cameraView, ground, 1);
    });
    return () => { cancelled=true; };
  },[props.theatre,props.scenario.version,props.scenario.flight?.terrain.datum]);
  useEffect(() => {
    const viewer=viewerRef.current;
    if(!viewer)return;
    if(previousView.current===props.cameraView)return;
    previousView.current=props.cameraView;
    navigation.current?.cancel();
    interacted.current=true;
    frameCamera(viewer, current.current.theatre, props.cameraView, groundHeight.current, .8);
  },[props.cameraView]);
  useEffect(() => { if (help) current.current.onTutorialOpen(); }, [help]);
  useEffect(() => { navigation.current?.cancel(); }, [props.input]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    viewer.resolutionScale=props.highQuality?1:.85;
    viewer.scene.globe.maximumScreenSpaceError=props.highQuality?1.5:2.5;
  },[props.highQuality]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    const lighting=lightingOf(props.scenario);
    viewer.clock.currentTime=JulianDate.fromIso8601(lighting==='night'?'2026-10-04T18:00:00Z':lighting==='dusk'?'2026-10-04T12:15:00Z':'2026-10-04T06:00:00Z');
    // A color/depth approximation also dims imagery and baked tile textures at night.
    // Disable the extra sun shading at night to avoid double-darkening the terrain.
    viewer.scene.globe.enableLighting=lighting!=='night';
    viewer.scene.fog.density=props.scenario.fog ? .0003 : props.scenario.difficulty==='challenge' ? .0002 : .00008;
    if(lighting!=='night'&&!props.scenario.fog)return;
    const stage=earthEnvironmentStage(props.scenario);
    viewer.scene.postProcessStages.add(stage);
    return()=>{if(!viewer.isDestroyed())viewer.scene.postProcessStages.remove(stage);};
  },[props.scenario.lighting,props.scenario.dusk,props.scenario.fog,props.scenario.difficulty]);
  return <>
    <div ref={container} className="earth-canvas" aria-label={`Interactive 3D Earth view of ${props.theatre.name}, ${props.theatre.region}`}/>
    <div className="earth-navigation" role="group" aria-label="Satellite navigation controls">
      <div className="earth-nav-buttons">
        <button aria-label="Zoom in satellite view" title="Zoom in" onClick={()=>navigation.current?.zoom(-.22)}><Plus size={15}/></button>
        <button aria-label="Zoom out satellite view" title="Zoom out" onClick={()=>navigation.current?.zoom(.22)}><Minus size={15}/></button>
        <button aria-label="Face north" title="Face north" onClick={()=>navigation.current?.north()}><Compass size={15}/><span>N</span></button>
        <button aria-label="Top-down satellite view" title="Top-down view" onClick={()=>navigation.current?.topDown()}>2D</button>
        <button aria-label={`Return to ${props.theatre.name}`} title={`Return to ${props.theatre.name}`} onClick={()=>home.current()}><Home size={15}/></button>
        <button aria-label="Satellite gesture help" aria-haspopup="dialog" aria-expanded={help} title="Gesture tutorial" onClick={openHelp}><HelpCircle size={15}/></button>
      </div>
      <label className="earth-input-mode"><span>INPUT</span><select aria-label="Satellite input device" value={input} onChange={event=>props.onInputChange(event.target.value as NavigationInput)}><option value="trackpad">Trackpad</option><option value="mouse">Mouse</option></select></label>
    </div>
    {help && <GestureTutorial input={input} onClose={closeHelp}/>}
  </>;
}
