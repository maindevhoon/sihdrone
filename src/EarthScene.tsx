import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  ArcGisMapServerImageryProvider, ArcGISTiledElevationTerrainProvider, CallbackPositionProperty, CallbackProperty,
  BoundingSphere, Cartesian2, Cartesian3, Cartographic, Color, ConstantProperty, HeadingPitchRange, HeadingPitchRoll, ImageryLayer,
  Ion, JulianDate, LabelStyle, Math as CesiumMath, Matrix4, NodeTransformationProperty, PropertyBag, Quaternion, ScreenSpaceEventHandler,
  ScreenSpaceEventType, Transforms, VerticalOrigin, Viewer, createGooglePhotorealistic3DTileset, sampleTerrainMostDetailed,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { contactPosition, type CameraView, type Scenario } from './simulation';
import { birdAttitude, contactKinematics, droneAttitude, wingBeat } from './kinematics';
import { airframeFor } from './airframes';
import { cameraFraming, groundSamplePoints, type Theatre } from './theatres';

type Props = {
  scenario: Scenario; time: MutableRefObject<number>; selected: boolean; theatre: Theatre; labels: boolean;
  cameraView: CameraView; highQuality: boolean; onSelect: () => void;
  onBearingChange: (bearing: number) => void; onStatus: (status: string) => void; onGround?: (height: number) => void;
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
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 25;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 18000000;
    viewer.cesiumWidget.creditContainer.classList.add('earth-credits');
    viewer.scene.postProcessStages.fxaa.enabled = true;
    // Sun-lit relief shading makes ridgelines and valleys read like a real aerial view.
    viewer.scene.globe.enableLighting = true;
    viewer.clock.currentTime = JulianDate.fromIso8601('2026-10-04T06:00:00Z');

    const anchor = () => { const t = current.current.theatre; return Cartesian3.fromDegrees(t.longitude ?? 0, t.latitude ?? 0, groundHeight.current); };
    const frame = () => Transforms.eastNorthUpToFixedFrame(anchor());
    const contactPoint = (index: number, result?: Cartesian3) => {
      const [x,y,z] = contactPosition(current.current.scenario, current.current.time.current, index);
      // One training-space unit represents eight real-world metres in Earth mode.
      return Matrix4.multiplyByPoint(frame(), new Cartesian3(x*8,-z*8,y*8), result || new Cartesian3());
    };
    // Real-size airframes; Cesium enlarges them to a minimum on-screen size so they stay detectable.
    const modelUri = () => {const airframe=airframeFor(current.current.scenario);return `/models/${airframe?`drone-${airframe.id}`:'bird'}.glb`;};
    const attitude = (index: number) => {
      const {scenario,time} = current.current, k = contactKinematics(scenario, time.current, index);
      return {k, a: scenario.category==='Bird' ? birdAttitude(k) : droneAttitude(k)};
    };
    // Wing elevation is applied to the named glTF wing nodes, about the airframe's forward axis.
    const wing = (index: number, side: 1 | -1) => new NodeTransformationProperty({rotation: new CallbackProperty(() => {
      const {scenario,time} = current.current;
      return Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, side*(scenario.category==='Bird' ? wingBeat(time.current, index).angle : 0));
    }, false)});
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
            uri: modelUri(), scale: 1, minimumPixelSize: 0, maximumScale: 24,
            silhouetteColor: Color.fromCssColorString('#ffd25a'), silhouetteSize: 0,
            nodeTransformations: new PropertyBag({'wing-left': wing(index, 1), 'wing-right': wing(index, -1)}),
          },
        }));
      }
    };
    let contactConfig = '';
    const update = viewer.scene.preRender.addEventListener(() => {
      const {scenario,time,selected} = current.current;
      ensureContacts(scenario.count);
      const signature=`${modelUri()}/${scenario.difficulty}/${selected}/${scenario.count}`;
      for (let index=0;index<contacts.length;index++) {
        const contact=contacts[index];
        contact.show=index<scenario.count && time.current>=scenario.arrival;
        if (contact.model && signature!==contactConfig) {
          contact.model.uri = new ConstantProperty(modelUri());
          contact.model.minimumPixelSize = new ConstantProperty(scenario.difficulty==='guided'?22:12);
          contact.model.silhouetteSize = new ConstantProperty(selected?1.5:0);
        }
      }
      contactConfig=signature;
    });
    const changed = viewer.camera.changed.addEventListener(() => {
      current.current.onBearingChange(Math.round(CesiumMath.toDegrees(viewer.camera.heading))%360);
    });
    viewer.camera.percentageChanged = .01;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: {position: Cartesian2}) => {
      const pick=viewer.scene.pick(event.position);
      if(pick?.id instanceof Object && typeof pick.id.id==='string' && pick.id.id.startsWith('training-contact-')) current.current.onSelect();
    }, ScreenSpaceEventType.LEFT_CLICK);

    frameCamera(viewer, current.current.theatre, current.current.cameraView, groundHeight.current, 0);
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
      disposed=true;update();changed();handler.destroy();
      viewerRef.current=null;
      if(!viewer.isDestroyed())viewer.destroy();
    };
  }, []);

  // Moving to a theatre: jump near its nominal elevation at once, then settle on the sampled ground.
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    let cancelled=false;
    const theatre=props.theatre;
    groundHeight.current=theatre.elevation ?? 0;
    frameCamera(viewer, theatre, current.current.cameraView, groundHeight.current, 0);
    void ready.current.then(async tiles => {
      const ground = await sampleGround(viewer, theatre, tiles);
      if(cancelled||viewer.isDestroyed())return;
      groundHeight.current=ground;
      current.current.onGround?.(ground);
      frameCamera(viewer, theatre, current.current.cameraView, ground, 1);
    });
    return () => { cancelled=true; };
  },[props.theatre]);
  useEffect(() => {
    const viewer=viewerRef.current;
    if(viewer)frameCamera(viewer, current.current.theatre, props.cameraView, groundHeight.current, 1.2);
  },[props.cameraView]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    viewer.resolutionScale=props.highQuality?1:.85;
    viewer.scene.globe.maximumScreenSpaceError=props.highQuality?1.5:2.5;
  },[props.highQuality]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    viewer.clock.currentTime=JulianDate.fromIso8601(props.scenario.dusk?'2026-10-04T12:15:00Z':'2026-10-04T06:00:00Z');
    viewer.scene.fog.density=props.scenario.difficulty==='challenge'?.0002:.00008;
  },[props.scenario.dusk,props.scenario.difficulty]);
  return <div ref={container} className="earth-canvas" aria-label={`Interactive 3D Earth view of ${props.theatre.name}, ${props.theatre.region}`}/>;
}
