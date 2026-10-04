import {
  CameraEventType, Cartesian2, Cartesian3, Cartographic, Ellipsoid,
  HeadingPitchRange, IntersectionTests, KeyboardEventModifier, Matrix4,
  Plane, Transforms, type Viewer,
} from 'cesium';
import {
  clamp, MAX_EARTH_RANGE, MIN_EARTH_RANGE, MAX_EARTH_PITCH, MIN_EARTH_PITCH,
  orbitAngles, safariGestureDelta, wheelIntent, zoomRange,
  type NavigationInput, type NavigationIntent,
} from './earthNavigationMath';

type Orbit={target:Cartesian3;heading:number;pitch:number;range:number};
type SafariGesture=Event & {scale:number;rotation:number};
export type EarthNavigation={zoom:(logScale:number)=>void;north:()=>void;topDown:()=>void;cancel:()=>void;dispose:()=>void};

/** Adds trackpad input without replacing Cesium's mouse-drag and touch controls. */
export function attachEarthNavigation(viewer:Viewer,options:{
  input:()=>NavigationInput;groundHeight:()=>number;fallbackTarget:()=>Cartesian3;
  onInteraction:()=>void;onChange:()=>void;
}):EarthNavigation {
  const {camera,scene}=viewer,canvas=scene.canvas;
  const controller=scene.screenSpaceCameraController;
  controller.zoomEventTypes=[CameraEventType.PINCH];
  controller.tiltEventTypes=[CameraEventType.RIGHT_DRAG,CameraEventType.MIDDLE_DRAG,
    {eventType:CameraEventType.LEFT_DRAG,modifier:KeyboardEventModifier.SHIFT}];
  controller.lookEventTypes=undefined;
  controller.minimumZoomDistance=MIN_EARTH_RANGE;
  controller.maximumZoomDistance=MAX_EARTH_RANGE;
  controller.maximumTiltAngle=Math.PI/2+MAX_EARTH_PITCH;
  // The trackpad already supplies momentum. Keep native drag inertia modest.
  controller.inertiaSpin=.55;controller.inertiaTranslate=.55;controller.inertiaZoom=0;
  const savedTabIndex=canvas.getAttribute('tabindex');
  canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Satellite map. Two-finger scroll to pan, pinch to zoom, Shift and scroll to orbit.');
  let frame=0,disposed=false,safariActive=false,safariEnded=-Infinity;
  let safariPrevious={scale:1,rotation:0};
  const queue:{intent:NavigationIntent;point?:Cartesian2}[]=[];

  function centre(){return new Cartesian2(canvas.clientWidth/2,canvas.clientHeight/2);}
  function planePoint(point:Cartesian2,target:Cartesian3) {
    const ray=camera.getPickRay(point);
    if(!ray)return undefined;
    const normal=Ellipsoid.WGS84.geodeticSurfaceNormal(target);
    return IntersectionTests.rayPlane(ray,Plane.fromPointNormal(target,normal));
  }
  function readOrbit():Orbit {
    const point=centre();
    // Pick geographic ground, not the animated contact at the reticle.
    const ray=camera.getPickRay(point);
    const ground=ray?scene.globe.pick(ray,scene):undefined;
    const picked=ground||camera.pickEllipsoid(point,Ellipsoid.WGS84);
    let target=options.fallbackTarget();
    if(picked){const c=Cartographic.fromCartesian(picked);target=Cartesian3.fromRadians(c.longitude,c.latitude,options.groundHeight());}
    const transform=Transforms.eastNorthUpToFixedFrame(target);
    const local=Matrix4.multiplyByPoint(Matrix4.inverseTransformation(transform,new Matrix4()),camera.positionWC,new Cartesian3());
    const distance=Cartesian3.magnitude(local);
    return {target,range:clamp(distance,MIN_EARTH_RANGE,MAX_EARTH_RANGE),
      heading:Math.atan2(-local.x,-local.y),
      pitch:clamp(-Math.asin(clamp(local.z/Math.max(distance,1),-1,1)),MIN_EARTH_PITCH,MAX_EARTH_PITCH)};
  }
  function apply(orbit:Orbit) {
    camera.lookAt(orbit.target,new HeadingPitchRange(orbit.heading,orbit.pitch,orbit.range));
    camera.lookAtTransform(Matrix4.IDENTITY);
    scene.requestRender();options.onChange();
  }
  function moveTarget(target:Cartesian3,offset:Cartesian3) {
    const moved=Cartographic.fromCartesian(Cartesian3.add(target,offset,new Cartesian3()));
    return Cartesian3.fromRadians(moved.longitude,moved.latitude,options.groundHeight());
  }
  function perform(intent:NavigationIntent,point?:Cartesian2) {
    const orbit=readOrbit();
    if(intent.kind==='pan'){
      const middle=centre(),from=planePoint(middle,orbit.target);
      const to=planePoint(new Cartesian2(middle.x+intent.x,middle.y+intent.y),orbit.target);
      if(!from||!to)return;
      const offset=Cartesian3.subtract(to,from,new Cartesian3());
      // Bound momentum near the horizon so a small scroll cannot jump across a city.
      const length=Cartesian3.magnitude(offset),limit=orbit.range*.2;
      if(length>limit)Cartesian3.multiplyByScalar(offset,limit/length,offset);
      orbit.target=moveTarget(orbit.target,offset);apply(orbit);
    } else if(intent.kind==='orbit'){
      Object.assign(orbit,orbitAngles(orbit.heading,orbit.pitch,intent.x,intent.y));apply(orbit);
    } else {
      const anchor=point?planePoint(point,orbit.target):undefined;
      orbit.range=zoomRange(orbit.range,intent.logScale);apply(orbit);
      // Keep the ground below the pointer anchored while pinching.
      const after=point&&anchor?planePoint(point,orbit.target):undefined;
      if(anchor&&after){orbit.target=moveTarget(orbit.target,Cartesian3.subtract(anchor,after,new Cartesian3()));apply(orbit);}
    }
  }
  function schedule(intent:NavigationIntent,point?:Cartesian2) {
    camera.cancelFlight();options.onInteraction();
    queue.push({intent,point});
    if(!frame)frame=requestAnimationFrame(()=>{
      frame=0;if(disposed)return;
      for(const item of queue.splice(0))perform(item.intent,item.point);
    });
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
    safariActive=true;safariPrevious={scale:1,rotation:0};camera.cancelFlight();options.onInteraction();
  };
  const gestureChange=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(!safariActive)return;
    const gesture=event as SafariGesture;
    const next={scale:gesture.scale,rotation:gesture.rotation};
    const delta=safariGestureDelta(safariPrevious,next);
    if(!delta)return;
    safariPrevious=next;
    if(delta.logScale)schedule({kind:'zoom',logScale:delta.logScale});
    if(delta.rotation)schedule({kind:'orbit',x:delta.rotation*Math.PI/180/.004,y:0});
  };
  const gestureEnd=(event:Event)=>{
    event.preventDefault();event.stopImmediatePropagation();safariActive=false;safariEnded=performance.now();
  };
  const stopQueue=()=>{queue.length=0;cancelAnimationFrame(frame);frame=0;safariActive=false;};
  const blur=()=>stopQueue();
  const hidden=()=>{if(document.hidden)stopQueue();};
  const pointer=()=>{camera.cancelFlight();options.onInteraction();};
  const contextMenu=(event:Event)=>event.preventDefault();
  // Capture avoids both Cesium wheel zoom and page/browser zoom processing this event.
  canvas.addEventListener('wheel',wheel,{passive:false,capture:true});
  canvas.addEventListener('gesturestart',gestureStart,{passive:false,capture:true});
  canvas.addEventListener('gesturechange',gestureChange,{passive:false,capture:true});
  canvas.addEventListener('gestureend',gestureEnd,{passive:false,capture:true});
  canvas.addEventListener('pointerdown',pointer);
  canvas.addEventListener('contextmenu',contextMenu);
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);
  return {
    zoom:(logScale)=>schedule({kind:'zoom',logScale}),
    north:()=>{stopQueue();camera.cancelFlight();options.onInteraction();const orbit=readOrbit();orbit.heading=0;apply(orbit);},
    topDown:()=>{stopQueue();camera.cancelFlight();options.onInteraction();const orbit=readOrbit();orbit.pitch=MIN_EARTH_PITCH;apply(orbit);},
    cancel:stopQueue,
    dispose:()=>{
      disposed=true;stopQueue();
      canvas.removeEventListener('wheel',wheel,true);
      canvas.removeEventListener('gesturestart',gestureStart,true);
      canvas.removeEventListener('gesturechange',gestureChange,true);
      canvas.removeEventListener('gestureend',gestureEnd,true);
      canvas.removeEventListener('pointerdown',pointer);canvas.removeEventListener('contextmenu',contextMenu);
      window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);
      if(savedTabIndex===null)canvas.removeAttribute('tabindex');else canvas.setAttribute('tabindex',savedTabIndex);
    },
  };
}
