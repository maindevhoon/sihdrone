import {
  CameraEventType, Cartesian2, Cartesian3, Cartographic, Ellipsoid,
  HeadingPitchRange, IntersectionTests, Matrix4,
  Plane, Transforms, type Viewer,
} from 'cesium';
import {
  clamp, MAX_EARTH_RANGE, MIN_EARTH_RANGE, MAX_EARTH_PITCH, MIN_EARTH_PITCH,
  ORBIT_HEADING_RATE, orbitAngles, safariGestureDelta, wheelIntent,
  type NavigationInput, type NavigationIntent,
} from './earthNavigationMath';
import { limitTerrainMotion, zoomDestination } from './earthNavigationTerrain';
import { addMotion, consumeMotion, emptyMotion, hasMotion } from './earthNavigationMotion';

type Orbit={target:Cartesian3;heading:number;pitch:number;range:number};
type SafariGesture=Event & {scale:number;rotation:number};
export type EarthNavigation={zoom:(logScale:number)=>void;north:()=>void;topDown:()=>void;cancel:()=>void;dispose:()=>void};

/** Smooth mouse/trackpad navigation; Cesium retains its two-finger touch pinch/tilt controls. */
export function attachEarthNavigation(viewer:Viewer,options:{
  input:()=>NavigationInput;fallbackTarget:()=>Cartesian3;
  onInteraction:()=>void;onChange:()=>void;
}):EarthNavigation {
  const {camera,scene}=viewer,canvas=scene.canvas;
  const controller=scene.screenSpaceCameraController;
  controller.zoomEventTypes=[CameraEventType.PINCH];
  controller.rotateEventTypes=[];controller.translateEventTypes=[];
  controller.tiltEventTypes=[CameraEventType.PINCH];
  controller.lookEventTypes=undefined;
  controller.minimumZoomDistance=MIN_EARTH_RANGE;
  controller.maximumZoomDistance=MAX_EARTH_RANGE;
  controller.maximumTiltAngle=Math.PI/2+MAX_EARTH_PITCH;
  // One easing path owns drag and wheel motion; do not add Cesium inertia to trackpad momentum.
  controller.inertiaSpin=0;controller.inertiaTranslate=0;controller.inertiaZoom=0;
  const savedTabIndex=canvas.getAttribute('tabindex');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Satellite map. Click-drag to pan, two-finger scroll to rotate and tilt, pinch to zoom. Shift and scroll to pan.');
  let frame=0,disposed=false,safariActive=false,safariEnded=-Infinity;
  let pending=emptyMotion(),previousFrame=0,orbitAnchor:Orbit|null=null,zoomAnchor:Cartesian3|null=null;
  let drag:{id:number;kind:'pan'|'orbit';point:Cartesian2;start:Cartesian2;moved:boolean}|null=null;
  const pointers=new Set<number>();
  let safariPrevious={scale:1,rotation:0};

  function centre(){return new Cartesian2(canvas.clientWidth/2,canvas.clientHeight/2);}
  function surfaceHeight(position:Cartographic) {
    if(scene.globe.show)return scene.globe.getHeight(position);
    // Exclude synthetic contacts and our site marker from tile-surface height queries.
    return scene.sampleHeightSupported?scene.sampleHeight(position,viewer.entities.values):undefined;
  }
  function surfacePoint(point:Cartesian2) {
    if(scene.globe.show){
      const ray=camera.getPickRay(point);
      return ray?scene.globe.pick(ray,scene):undefined;
    }
    // The hidden ellipsoid must not override an authenticated 3D-tile surface.
    if(!scene.pickPositionSupported)return undefined;
    const hit=scene.pick(point);
    if(hit?.id && viewer.entities.contains(hit.id))return undefined;
    return scene.pickPosition(point);
  }
  function planePoint(point:Cartesian2,target:Cartesian3) {
    const ray=camera.getPickRay(point);
    if(!ray)return undefined;
    const normal=Ellipsoid.WGS84.geodeticSurfaceNormal(target);
    return IntersectionTests.rayPlane(ray,Plane.fromPointNormal(target,normal));
  }
  function readOrbit(anchor?:Cartesian3):Orbit {
    const point=centre();
    // Pick geographic ground, not the animated contact at the reticle.
    const target=anchor??surfacePoint(point)??fallbackPoint(point);
    const transform=Transforms.eastNorthUpToFixedFrame(target);
    const local=Matrix4.multiplyByPoint(Matrix4.inverseTransformation(transform,new Matrix4()),camera.positionWC,new Cartesian3());
    const distance=Cartesian3.magnitude(local);
    return {target,range:clamp(distance,MIN_EARTH_RANGE,MAX_EARTH_RANGE),
      heading:Math.atan2(-local.x,-local.y),
      pitch:clamp(-Math.asin(clamp(local.z/Math.max(distance,1),-1,1)),MIN_EARTH_PITCH,MAX_EARTH_PITCH)};
  }
  function apply(orbit:Orbit) {
    const before=Cartesian3.clone(camera.positionWC);
    camera.lookAt(orbit.target,new HeadingPitchRange(orbit.heading,orbit.pitch,orbit.range));
    camera.lookAtTransform(Matrix4.IDENTITY);
    const destination=limitTerrainMotion(before,camera.positionWC,surfaceHeight);
    setPosition(destination);
  }
  function setPosition(destination:Cartesian3) {
    const direction=Cartesian3.clone(camera.directionWC),up=Cartesian3.clone(camera.upWC);
    camera.setView({destination,orientation:{direction,up}});
    scene.requestRender();options.onChange();
  }
  function fallbackPoint(point:Cartesian2) {
    // A sky/horizon miss must not pull zoom back to the selected theatre site.
    const position=camera.positionCartographic;
    const ground=Cartesian3.fromRadians(position.longitude,position.latitude,surfaceHeight(position)??0);
    const plane=planePoint(point,ground);
    if(plane && Cartesian3.distance(camera.positionWC,plane)<=MAX_EARTH_RANGE)return plane;
    const range=clamp(Cartesian3.distance(camera.positionWC,options.fallbackTarget()),MIN_EARTH_RANGE,MAX_EARTH_RANGE);
    return Cartesian3.add(camera.positionWC,Cartesian3.multiplyByScalar(camera.directionWC,range,new Cartesian3()),new Cartesian3());
  }
  function perform(intent:NavigationIntent,point?:Cartesian2) {
    if(intent.kind==='zoom'){
      const middle=centre();
      const target=zoomAnchor??(point?surfacePoint(point):undefined)??surfacePoint(middle)??fallbackPoint(middle);
      zoomAnchor=target;
      const destination=zoomDestination(camera.positionWC,target,intent.logScale);
      setPosition(limitTerrainMotion(camera.positionWC,destination,surfaceHeight));
      orbitAnchor=null;
      return;
    }
    const orbit=orbitAnchor??readOrbit();orbitAnchor=orbit;
    if(intent.kind==='pan'){
      const middle=centre(),from=planePoint(middle,orbit.target);
      const to=planePoint(new Cartesian2(middle.x+intent.x,middle.y+intent.y),orbit.target);
      if(!from||!to)return;
      const offset=Cartesian3.subtract(to,from,new Cartesian3());
      // Bound momentum near the horizon so a small scroll cannot jump across a city.
      const length=Cartesian3.magnitude(offset),limit=orbit.range*.2;
      if(length>limit)Cartesian3.multiplyByScalar(offset,limit/length,offset);
      // Translate on the current tangent plane, rather than snapping the target to each terrain tile.
      orbit.target=Cartesian3.add(orbit.target,offset,new Cartesian3());apply(orbit);
    } else {
      Object.assign(orbit,orbitAngles(orbit.heading,orbit.pitch,intent.x,intent.y));apply(orbit);
    }
  }
  function schedule(intent:NavigationIntent,point?:Cartesian2) {
    camera.cancelFlight();options.onInteraction();
    if(!hasMotion(pending)){
      orbitAnchor=null;zoomAnchor=null;previousFrame=performance.now();
    }
    if(intent.kind==='zoom'&&!zoomAnchor)zoomAnchor=(point?surfacePoint(point):undefined)??surfacePoint(centre())??fallbackPoint(centre());
    pending=addMotion(pending,intent);
    if(!frame)frame=requestAnimationFrame(animate);
  }
  function animate(now:number) {
    frame=0;if(disposed)return;
    const {step,remaining}=consumeMotion(pending,(now-previousFrame)/1000);
    previousFrame=now;pending=remaining;
    if(step.panX||step.panY)perform({kind:'pan',x:step.panX,y:step.panY});
    if(step.orbitX||step.orbitY)perform({kind:'orbit',x:step.orbitX,y:step.orbitY});
    if(step.zoom)perform({kind:'zoom',logScale:step.zoom});
    if(hasMotion(pending))frame=requestAnimationFrame(animate);
    else{orbitAnchor=null;zoomAnchor=null;}
  }
  function localPoint(event:{clientX:number;clientY:number}) {
    const rect=canvas.getBoundingClientRect();return new Cartesian2(event.clientX-rect.left,event.clientY-rect.top);
  }
  const wheel=(event:WheelEvent)=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(safariActive||(event.ctrlKey&&performance.now()-safariEnded<120))return;
    const intent=wheelIntent(event,options.input(),canvas.clientHeight);
    if(intent)schedule(intent,localPoint(event));
  };
  const gestureStart=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();
    stopQueue();safariActive=true;safariPrevious={scale:1,rotation:0};camera.cancelFlight();options.onInteraction();
  };
  const gestureChange=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(!safariActive)return;
    const gesture=event as SafariGesture;
    const next={scale:gesture.scale,rotation:gesture.rotation};
    const delta=safariGestureDelta(safariPrevious,next);
    if(!delta)return;
    safariPrevious=next;
    if(delta.logScale){
      const location=event as Event & {clientX?:number;clientY?:number};
      const point=Number.isFinite(location.clientX)&&Number.isFinite(location.clientY)
        ?localPoint(location as {clientX:number;clientY:number}):undefined;
      schedule({kind:'zoom',logScale:delta.logScale*.7},point);
    }
    if(delta.rotation)schedule({kind:'orbit',x:delta.rotation*.7*Math.PI/180/ORBIT_HEADING_RATE,y:0});
  };
  const gestureEnd=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();safariActive=false;safariEnded=performance.now();
  };
  const stopQueue=()=>{pending=emptyMotion();cancelAnimationFrame(frame);frame=0;safariActive=false;orbitAnchor=null;zoomAnchor=null;};
  const blur=()=>{stopQueue();releaseDrag();pointers.clear();camera.cancelFlight();};
  const hidden=()=>{if(document.hidden)blur();};
  const releaseDrag=()=>{
    const id=drag?.id;drag=null;
    if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  };
  const pointer=(event:PointerEvent)=>{
    pointers.add(event.pointerId);
    stopQueue();camera.cancelFlight();options.onInteraction();
    if(pointers.size>1){releaseDrag();return;}
    if(event.button>2)return;
    const point=localPoint(event);
    drag={id:event.pointerId,kind:event.button===0&&!event.shiftKey&&!event.ctrlKey?'pan':'orbit',point,start:point,moved:false};
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove=(event:PointerEvent)=>{
    if(!drag||drag.id!==event.pointerId)return;
    const point=localPoint(event),x=point.x-drag.point.x,y=point.y-drag.point.y;
    drag.point=point;
    if(!drag.moved&&Cartesian2.distance(point,drag.start)<3)return;
    drag.moved=true;
    schedule({kind:drag.kind,x:drag.kind==='pan'?-x*.55:x,y:drag.kind==='pan'?-y*.55:y});
  };
  const pointerUp=(event:PointerEvent)=>{
    pointers.delete(event.pointerId);
    if(drag?.id===event.pointerId)releaseDrag();
  };
  const pointerCancel=(event:PointerEvent)=>{pointerUp(event);stopQueue();};
  const captureLost=(event:PointerEvent)=>{if(drag?.id===event.pointerId)pointerCancel(event);};
  const contextMenu=(event:Event)=>event.preventDefault();
  // Capture avoids both Cesium wheel zoom and page/browser zoom processing this event.
  canvas.addEventListener('wheel',wheel,{passive:false,capture:true});
  canvas.addEventListener('gesturestart',gestureStart,{passive:false,capture:true});
  canvas.addEventListener('gesturechange',gestureChange,{passive:false,capture:true});
  canvas.addEventListener('gestureend',gestureEnd,{passive:false,capture:true});
  canvas.addEventListener('pointerdown',pointer);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',pointerCancel);
  canvas.addEventListener('lostpointercapture',captureLost);
  canvas.addEventListener('contextmenu',contextMenu);
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);
  return {
    zoom:(logScale)=>schedule({kind:'zoom',logScale}),
    north:()=>{stopQueue();camera.cancelFlight();options.onInteraction();const orbit=readOrbit();orbit.heading=0;apply(orbit);},
    topDown:()=>{stopQueue();camera.cancelFlight();options.onInteraction();const orbit=readOrbit();orbit.pitch=MIN_EARTH_PITCH;apply(orbit);},
    cancel:blur,
    dispose:()=>{
      disposed=true;stopQueue();
      releaseDrag();pointers.clear();
      canvas.removeEventListener('wheel',wheel,true);
      canvas.removeEventListener('gesturestart',gestureStart,true);
      canvas.removeEventListener('gesturechange',gestureChange,true);
      canvas.removeEventListener('gestureend',gestureEnd,true);
      canvas.removeEventListener('pointerdown',pointer);canvas.removeEventListener('contextmenu',contextMenu);
      canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerCancel);
      canvas.removeEventListener('lostpointercapture',captureLost);
      window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);
      if(savedTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',savedTabIndex);
    },
  };
}
