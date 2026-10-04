import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  ArcGisMapServerImageryProvider, CallbackPositionProperty, CallbackProperty,
  BoundingSphere, Cartesian2, Cartesian3, Color, ConstantProperty, HeadingPitchRange, HeadingPitchRoll, ImageryLayer,
  Ion, JulianDate, Math as CesiumMath, Matrix4, NodeTransformationProperty, PropertyBag, Quaternion, ScreenSpaceEventHandler,
  ScreenSpaceEventType, Transforms, Viewer, createGooglePhotorealistic3DTileset,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { contactPosition, type CameraView, type Scenario } from './simulation';
import { birdAttitude, contactKinematics, droneAttitude, wingBeat } from './kinematics';
import { airframeFor } from './airframes';

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
