import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  ArcGisMapServerImageryProvider, CallbackPositionProperty, CallbackProperty,
  BoundingSphere, Cartesian2, Cartesian3, Color, ConstantProperty, HeadingPitchRange, HeadingPitchRoll, ImageryLayer,
  Ion, JulianDate, Math as CesiumMath, Matrix4, ScreenSpaceEventHandler,
  ScreenSpaceEventType, Transforms, Viewer, createGooglePhotorealistic3DTileset,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { contactPosition, type CameraView, type Scenario } from './simulation';

type Props = {
  scenario: Scenario; time: MutableRefObject<number>; selected: boolean;
  cameraView: CameraView; highQuality: boolean; onSelect: () => void;
  onBearingChange: (bearing: number) => void; onStatus: (status: string) => void;
};
const env = (import.meta as ImportMeta & {env: Record<string, string | undefined>}).env;
const googleKey = env.VITE_GOOGLE_MAPS_API_KEY;
const ionToken = env.VITE_CESIUM_ION_TOKEN;
const hasPhotorealisticAccess = Boolean(googleKey || ionToken);
const longitude = 77.2268, latitude = 28.6126;
const presets = {
  overview: { heading: 30, pitch: -42, range: 1500 },
  rooftop: { heading: 25, pitch: -18, range: 360 },
  street: { heading: 0, pitch: -3, range: 200 },
};
export default function EarthScene(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const current = useRef(props);
  const groundHeight = useRef(0);
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
    viewer.clock.currentTime = JulianDate.fromIso8601('2026-10-04T06:00:00Z');

    const frame = () => Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(longitude, latitude, groundHeight.current));
    const contactPoint = (index: number, result?: Cartesian3) => {
      const [x,y,z] = contactPosition(current.current.scenario, current.current.time.current, index);
      // One training-space unit represents eight real-world metres in Earth mode.
      return Matrix4.multiplyByPoint(frame(), new Cartesian3(x*8,-z*8,y*8), result || new Cartesian3());
    };
    const contacts: Entity[] = Array.from({length:4}, (_, index) => viewer.entities.add({
      id: `training-contact-${index}`,
      position: new CallbackPositionProperty((_time, result) => contactPoint(index,result), false),
      orientation: new CallbackProperty(() => Transforms.headingPitchRollQuaternion(contactPoint(index),new HeadingPitchRoll(.3+Math.sin(current.current.time.current*.12)*.5,0,Math.sin(current.current.time.current*.4+index)*.045)),false),
      model: {
        uri: '/models/drone.glb', scale: 2,
        minimumPixelSize: 0, maximumScale: 6,
        silhouetteColor: Color.fromCssColorString('#bceaa3'), silhouetteSize: 0,
      },
    }));
    let contactConfig = '';
    const update = viewer.scene.preRender.addEventListener(() => {
      const {scenario,time,selected} = current.current;
      const signature=`${scenario.category}/${scenario.difficulty}/${selected}`;
      for (let index=0;index<contacts.length;index++) {
        const contact=contacts[index];
        contact.show=index<scenario.count && time.current>=scenario.arrival;
        if (contact.model && signature!==contactConfig) {
          contact.model.uri = new ConstantProperty(`/models/${scenario.category==='Bird'?'bird':'drone'}.glb`);
          contact.model.minimumPixelSize = new ConstantProperty(scenario.difficulty==='guided'?20:10);
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

    function moveCamera() {
      const preset=presets[current.current.cameraView];
      viewer.camera.lookAt(Cartesian3.fromDegrees(longitude,latitude,groundHeight.current+70),new HeadingPitchRange(CesiumMath.toRadians(preset.heading),CesiumMath.toRadians(preset.pitch),preset.range));
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }
    moveCamera();
    async function loadWorld() {
      current.current.onStatus(hasPhotorealisticAccess?'Loading photorealistic 3D tiles…':'Loading Delhi satellite imagery…');
      try {
        if (hasPhotorealisticAccess) {
          const tiles = await createGooglePhotorealistic3DTileset({key:googleKey,onlyUsingWithGoogleGeocoder:true},{maximumScreenSpaceError:12,cacheBytes:256*1024*1024,maximumCacheOverflowBytes:128*1024*1024});
          if(disposed){tiles.destroy();return;}
          viewer.scene.primitives.add(tiles);
          viewer.scene.globe.show = false;
          groundHeight.current = 215;
          moveCamera();
          current.current.onStatus('GOOGLE PHOTOREALISTIC 3D / NEW DELHI');
          tiles.tileFailed.addEventListener(() => {if(!disposed)current.current.onStatus('Some 3D tiles could not load — check coverage and API access.');});
          return;
        }
      } catch {
        if(disposed)return;
        current.current.onStatus('3D service unavailable — using satellite imagery.');
      }
      try {
        const provider = await ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',{enablePickFeatures:false});
        if(disposed)return;
        viewer.imageryLayers.add(new ImageryLayer(provider));
        current.current.onStatus(hasPhotorealisticAccess?'SATELLITE FALLBACK / 3D SERVICE UNAVAILABLE':'SATELLITE IMAGERY / 3D BUILDINGS REQUIRE API ACCESS');
        provider.errorEvent.addEventListener(() => {if(!disposed)current.current.onStatus('Imagery connection interrupted — try the offline training scene.');});
      } catch {
        if(!disposed)current.current.onStatus('Satellite imagery unavailable — choose the training scene.');
      }
    }
    void loadWorld();
    return () => {
      disposed=true;update();changed();handler.destroy();
      viewerRef.current=null;
      if(!viewer.isDestroyed())viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer=viewerRef.current;
    if(!viewer)return;
    const preset=presets[props.cameraView];
    viewer.camera.flyToBoundingSphere(
      // The same anchor keeps every camera preset looking at the exercise airspace.
      new BoundingSphere(Cartesian3.fromDegrees(longitude,latitude,groundHeight.current+70),10),
      {duration:1.2,offset:new HeadingPitchRange(CesiumMath.toRadians(preset.heading),CesiumMath.toRadians(preset.pitch),preset.range)},
    );
  },[props.cameraView]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    viewer.resolutionScale=props.highQuality?1:.85;
    viewer.scene.globe.maximumScreenSpaceError=props.highQuality?1.5:3;
  },[props.highQuality]);
  useEffect(() => {
    const viewer=viewerRef.current;if(!viewer)return;
    viewer.clock.currentTime=JulianDate.fromIso8601(props.scenario.dusk?'2026-10-04T12:15:00Z':'2026-10-04T06:00:00Z');
    viewer.scene.globe.enableLighting=props.scenario.dusk;
    viewer.scene.fog.density=props.scenario.difficulty==='challenge'?.0002:.00008;
  },[props.scenario.dusk,props.scenario.difficulty]);
  return <div ref={container} className="earth-canvas" aria-label="Interactive satellite Earth view of New Delhi"/>;
}
