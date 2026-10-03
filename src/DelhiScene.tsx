import { memo, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Sky } from '@react-three/drei';
import { CanvasTexture, Group, RepeatWrapping, Shape, SRGBColorSpace, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useThree } from '@react-three/fiber';
import { contactPosition, type Scenario, type CameraView } from './simulation';

type SceneProps = { scenario: Scenario; time: MutableRefObject<number>; selected: boolean; onSelect: () => void; cameraView: CameraView; onBearingChange:(bearing:number)=>void; highQuality:boolean };
function surfaceTexture(kind: 'stone' | 'road' | 'grass' | 'facade', dusk = false) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = {stone:'#c1a887',road:'#494d4c',grass:'#7d8562',facade:'#c5b9a3'}[kind];
  ctx.fillRect(0,0,256,256);
  let seed = 9271;
  for(let i=0;i<12000;i++) { seed=(seed*16807)%2147483647; const x=seed%256; seed=(seed*16807)%2147483647; const y=seed%256; ctx.fillStyle=i%2?'rgba(255,255,255,.05)':'rgba(0,0,0,.06)';ctx.fillRect(x,y,2,2); }
  if(kind==='stone') {ctx.strokeStyle='#78654a20';ctx.lineWidth=1;for(let y=0;y<256;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y%64?32:0);x<256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}}}
  if(kind==='facade') {
    for(let y=12;y<256;y+=64)for(let x=12;x<256;x+=64){
      ctx.fillStyle='#877d6b';ctx.fillRect(x-3,y-3,39,47);
      ctx.fillStyle=dusk&&((x+y)%3===0)?'#edc887':'#475a5e';ctx.fillRect(x,y,32,38);
      ctx.fillStyle='#c5b7a0';ctx.fillRect(x+15,y,2,38);
      ctx.fillStyle='#f3e5c630';ctx.fillRect(x+2,y+2,12,13);
      ctx.fillStyle='#746c5b';ctx.fillRect(x-5,y+39,44,4);
    }
  }
  const texture=new CanvasTexture(canvas);texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;
  texture.repeat.set(kind==='grass'?25:kind==='road'?12:kind==='stone'?2:1,kind==='grass'?25:kind==='road'?12:kind==='stone'?2:1);
  texture.anisotropy=4;return texture;
}
function Drone({ index, scenario, time, selected, onSelect }: Omit<SceneProps, 'cameraView'|'onBearingChange'|'highQuality'> & { index: number }) {
  const ref=useRef<Group>(null);
  useFrame(()=> {if(!ref.current)return;const t=time.current;ref.current.visible=t>=scenario.arrival;ref.current.position.set(...contactPosition(scenario,t,index));ref.current.rotation.set(0,.3+Math.sin(t*.12)*.5,Math.sin(t*.4+index)*.045);ref.current.traverse(c=>{if(c.name==='rotor')c.rotation.y=t*45;});});
  return <group ref={ref} onClick={e=>{e.stopPropagation();onSelect();}} onPointerOver={()=>document.body.style.cursor='crosshair'} onPointerOut={()=>document.body.style.cursor='auto'}>
    <RoundedBox args={[.72,.27,.9]} radius={.08} castShadow><meshStandardMaterial color="#3b4247" metalness={.65} roughness={.4}/></RoundedBox>
    <mesh position={[0,-.19,.34]}><sphereGeometry args={[.13,16,12]}/><meshStandardMaterial color="#111b24" metalness={.5}/></mesh>
    {[-1,1].flatMap(x=>[-1,1].map(z=><group key={`${x}${z}`} position={[x*.66,0,z*.66]}>
      <mesh rotation={[0,x*z*.78,0]} position={[-x*.25,0,-z*.25]} castShadow><boxGeometry args={[.12,.09,.8]}/><meshStandardMaterial color="#505454"/></mesh>
      <mesh><cylinderGeometry args={[.12,.13,.2,16]}/><meshStandardMaterial color="#252b30" metalness={.6}/></mesh>
      <mesh name="rotor" position={[0,.12,0]}><boxGeometry args={[.95,.025,.09]}/><meshStandardMaterial color="#17212a"/></mesh>
      <mesh position={[0,.125,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.48,24]}/><meshBasicMaterial color="#9da8aa" transparent opacity={.12} depthWrite={false}/></mesh>
      <mesh position={[0,-.09,0]}><sphereGeometry args={[.045,8,8]}/><meshBasicMaterial color={x===1?'#ff8f66':'#96ecd3'}/></mesh>
      <mesh position={[0,-.35,0]}><cylinderGeometry args={[.035,.035,.5,6]}/><meshStandardMaterial color="#303b42"/></mesh>
    </group>))}
    {selected&&<mesh rotation={[Math.PI/2,0,0]} position={[0,-.7,0]}><ringGeometry args={[1.3,1.33,48]}/><meshBasicMaterial color="#bceaa3" side={2}/></mesh>}
  </group>;
}
function Bird({index,scenario,time,selected,onSelect}: Omit<SceneProps,'cameraView'|'onBearingChange'|'highQuality'> & {index:number}) {
  const ref=useRef<Group>(null);
  const left=useRef<Group>(null),right=useRef<Group>(null);
  useFrame(()=>{if(!ref.current)return;const t=time.current;ref.current.visible=t>=scenario.arrival;ref.current.position.set(...contactPosition(scenario,t,index));ref.current.rotation.y=.6+Math.sin(t*.12)*.5;
    if(left.current)left.current.rotation.z=Math.sin(t*8+index)*.45;
    if(right.current)right.current.rotation.z=-Math.sin(t*8+index)*.45;
  });
  return <group ref={ref} onClick={e=>{e.stopPropagation();onSelect();}} onPointerOver={()=>document.body.style.cursor='crosshair'} onPointerOut={()=>document.body.style.cursor='auto'}>
    <mesh scale={[.2,.2,.65]} castShadow><sphereGeometry args={[.7,12,8]}/><meshStandardMaterial color="#48545c"/></mesh>
    <mesh position={[0,.07,.47]}><sphereGeometry args={[.16,12,8]}/><meshStandardMaterial color="#3d474d"/></mesh>
    <mesh position={[0,.05,.68]} rotation={[Math.PI/2,0,0]}><coneGeometry args={[.08,.22,8]}/><meshStandardMaterial color="#c9a05e"/></mesh>
    {[-1,1].map(side=><group ref={side<0?left:right} key={side} position={[side*.09,0,0]}>
      <mesh position={[side*.55,0,-.08]} rotation={[0,side*.2,side*.12]} scale={[1,.06,.5]}><sphereGeometry args={[.7,12,8]}/><meshStandardMaterial color="#747e83"/></mesh>
    </group>)}
    <mesh position={[0,0,-.6]} rotation={[0,0,Math.PI/2]}><coneGeometry args={[.18,.4,4]}/><meshStandardMaterial color="#606d75"/></mesh>
    {selected&&<mesh rotation={[Math.PI/2,0,0]} position={[0,-.6,0]}><ringGeometry args={[1.3,1.33,48]}/><meshBasicMaterial color="#bceaa3" side={2}/></mesh>}
  </group>;
}
const initialTarget:[number,number,number]=[0,7,-16];
const cameraPresets: Record<CameraView,{position:Vector3;target:Vector3}> = {
  overview:{position:new Vector3(28,22,42),target:new Vector3(0,7,-16)},
  rooftop:{position:new Vector3(19,15,20),target:new Vector3(0,14,-8)},
  street:{position:new Vector3(0,2.5,25),target:new Vector3(0,12,-16)},
};
function CameraRig({view,onBearingChange}: {view:CameraView;onBearingChange:(bearing:number)=>void}) {
  const {camera}=useThree();
  const controls=useRef<OrbitControlsImpl>(null);
  const moving=useRef(true);
  const direction=useMemo(()=>new Vector3(),[]);
  const updateBearing=useCallback(()=>{camera.getWorldDirection(direction);onBearingChange(Math.round((Math.atan2(direction.x,-direction.z)*180/Math.PI+360)%360)%360);},[camera,direction,onBearingChange]);
  useEffect(()=>{moving.current=true;updateBearing();},[view,updateBearing]);
  useFrame((_,delta)=>{if(!moving.current||!controls.current)return;const preset=cameraPresets[view];const ease=1-Math.exp(-delta*5);camera.position.lerp(preset.position,ease);controls.current.target.lerp(preset.target,ease);controls.current.update();
    if(camera.position.distanceTo(preset.position)<.05&&controls.current.target.distanceTo(preset.target)<.05)moving.current=false;
  });
  return <OrbitControls ref={controls} target={initialTarget} minDistance={8} maxDistance={85} maxPolarAngle={Math.PI*.495} minPolarAngle={.05} enablePan={false} onChange={updateBearing} onStart={()=>{moving.current=false;}}/>;
}
function Tree({x,z,scale=1}: {x:number;z:number;scale?:number}) {
  return <group position={[x,0,z]} scale={scale}>
    <mesh position={[0,2,0]} castShadow><cylinderGeometry args={[.16,.28,4,8]}/><meshStandardMaterial color="#6a5741"/></mesh>
    {[[-.8,3.8,0],[.8,4.3,.3],[0,5.3,0],[0,4,-.8]].map(([a,b,c],i)=><mesh key={i} position={[a,b,c]} scale={[1.5,1.3,1.35]} castShadow><icosahedronGeometry args={[1.3,2]}/><meshStandardMaterial color={['#506449','#596d4c','#617750','#495f43'][i]} roughness={.95}/></mesh>)}
  </group>;
}
function ShopSign({index,width,z}: {index:number;width:number;z:number}) {
  const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;ctx.fillStyle=['#446958','#a56b45','#586879'][index%3];ctx.fillRect(0,0,512,96);ctx.strokeStyle='#decba777';ctx.strokeRect(8,8,496,80);ctx.fillStyle='#f3e8cf';ctx.font='bold 37px sans-serif';ctx.textAlign='center';ctx.fillText(['DELHI CITY MART','CHAI & COFFEE','BOOKS / STATIONERY'][index%3],256,59);const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map;},[index]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={[0,2.9,z]}><planeGeometry args={[Math.min(width-1,7),.9]}/><meshStandardMaterial map={texture} roughness={.75}/></mesh>;
}
function Building({x,z,width,height,depth,stone,facade,index}: {x:number;z:number;width:number;height:number;depth:number;stone:CanvasTexture;facade:CanvasTexture;index:number}) {
  const map=useMemo(()=>{const copy=facade.clone();copy.repeat.set(width/8,height/9);return copy;},[facade,width,height]);
  useEffect(()=>()=>map.dispose(),[map]);
  return <group position={[x,0,z]}>
    <mesh position={[0,height/2,0]} castShadow receiveShadow><boxGeometry args={[width,height,depth]}/><meshStandardMaterial map={map} color={['#f4e6d2','#dec4a6','#dacfc0','#d3b89d'][index%4]} roughness={.85}/></mesh>
    <mesh position={[0,height+.14,0]} castShadow><boxGeometry args={[width+.3,.28,depth+.3]}/><meshStandardMaterial map={stone} color="#ddd3c0"/></mesh>
    {[-1,1].map(s=><mesh key={s} position={[s*width/2,height+.45,0]}><boxGeometry args={[.18,.6,depth]}/><meshStandardMaterial color="#c9baa2"/></mesh>)}
    {[-1,1].map(s=><mesh key={s} position={[0,height+.45,s*depth/2]}><boxGeometry args={[width,.6,.18]}/><meshStandardMaterial color="#c9baa2"/></mesh>)}
    <mesh position={[-width*.25,height+.85,0]} castShadow><cylinderGeometry args={[.6,.6,1.35,16]}/><meshStandardMaterial color="#414748" roughness={.8}/></mesh>
    <mesh position={[width*.25,height+.48,-depth*.2]}><boxGeometry args={[1.1,.55,.8]}/><meshStandardMaterial color="#a9aaa2" metalness={.3}/></mesh>
    <mesh position={[0,.25,depth/2+.7]} receiveShadow><boxGeometry args={[width+.4,.5,1.4]}/><meshStandardMaterial map={stone}/></mesh>
    {index<12&&<><mesh position={[0,1.3,depth/2+.04]}><boxGeometry args={[1.3,2.2,.07]}/><meshStandardMaterial color="#354c4a" roughness={.5}/></mesh><ShopSign index={index} width={width} z={depth/2+.06}/><mesh position={[0,3.5,depth/2+.4]} rotation={[.12,0,0]} castShadow><boxGeometry args={[width-.4,.14,1.1]}/><meshStandardMaterial color={index%2?'#7d987e':'#c39767'}/></mesh></>}
    {index%3===0&&<mesh position={[width*.2,height+.8,depth*.2]} rotation={[-Math.PI/2+.25,0,0]}><boxGeometry args={[2.6,1.6,.08]}/><meshStandardMaterial color="#324c60" metalness={.55} roughness={.3}/></mesh>}
    {index%4===1&&[4.6,7].filter(y=>y<height-.4).map(y=><group key={y} position={[0,y,depth/2+.5]}><mesh castShadow><boxGeometry args={[width-.6,.15,1.3]}/><meshStandardMaterial color="#c3b196"/></mesh><mesh position={[0,.55,.6]}><boxGeometry args={[width-.8,.7,.06]}/><meshStandardMaterial color="#5b675f" transparent opacity={.7}/></mesh></group>)}
  </group>;
}
function Gate({stone}: {stone:CanvasTexture}) {
  const shape=useMemo(()=>{const s=new Shape();s.moveTo(-5,0);s.lineTo(-5,12);s.lineTo(5,12);s.lineTo(5,0);s.lineTo(2.05,0);s.lineTo(2.05,5.8);s.absarc(0,5.8,2.05,0,Math.PI,false);s.lineTo(-2.05,0);s.closePath();return s;},[]);
  return <group position={[0,0,-26]}>
    <mesh position={[0,.2,0]} receiveShadow><boxGeometry args={[13,.4,7]}/><meshStandardMaterial map={stone}/></mesh>
    <mesh position={[0,.4,-1.7]} castShadow receiveShadow><extrudeGeometry args={[shape,{depth:3.4,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:2,steps:1}]}/><meshStandardMaterial color="#dcc4a2" map={stone} roughness={.88}/></mesh>
    {[9.1,10.8,12.4].map((y,i)=><mesh key={y} position={[0,y,0]} castShadow><boxGeometry args={[i===2?10.7:10.3,.3,3.9]}/><meshStandardMaterial map={stone} color="#c7a780"/></mesh>)}
    <mesh position={[0,13,0]} castShadow><boxGeometry args={[8.5,1,3.1]}/><meshStandardMaterial map={stone} color="#d4b896"/></mesh>
    <mesh position={[0,13.6,0]} castShadow><boxGeometry args={[9.2,.25,3.6]}/><meshStandardMaterial map={stone}/></mesh>
    {[-1,1].map(side=><group key={side} position={[side*3.4,0,1.82]}>
      <mesh position={[0,5.2,0]}><boxGeometry args={[.45,9.5,.15]}/><meshStandardMaterial map={stone} color="#b59a7c"/></mesh>
      <mesh position={[0,10,0]}><boxGeometry args={[.85,.25,.35]}/><meshStandardMaterial map={stone}/></mesh>
    </group>)}
  </group>;
}
function Car({ lane, start, color, time, variant='car' }: {lane:number;start:number;color:string;time:MutableRefObject<number>;variant?:'car'|'bus'|'rickshaw'}) {
  const ref=useRef<Group>(null);
  const bus=variant==='bus',rickshaw=variant==='rickshaw';
  useFrame(()=>{if(!ref.current)return;const z=((start+time.current*(lane>0?2:-2)+280)%140)-70;const distance=z+26;const x=Math.abs(distance)<11?Math.sign(lane)*Math.sqrt(11.5**2-distance**2):lane;ref.current.position.set(x,.1,z);ref.current.rotation.y=(lane<0?Math.PI:0)+(Math.abs(distance)<11?Math.atan2(-Math.sign(lane)*distance,Math.sqrt(11.5**2-distance**2)):0);});
  const width=bus?2.3:rickshaw?1.45:1.6,length=bus?7:rickshaw?2.2:3.1;
  return <group ref={ref}>
    <RoundedBox args={[width,bus?2.7:.65,length]} radius={.12} position={[0,bus?1.7:.6,0]} castShadow><meshStandardMaterial color={rickshaw?'#4b9661':color} roughness={.45} metalness={.2}/></RoundedBox>
    {bus?<><mesh position={[0,3.09,0]}><boxGeometry args={[2.15,.1,6.8]}/><meshStandardMaterial color="#d1d3c5"/></mesh>{[-1,1].flatMap(side=>Array.from({length:5},(_,i)=><mesh key={`${side}${i}`} position={[side*1.16,2.25,(i-2)*1.15]} rotation={[0,Math.PI/2,0]}><planeGeometry args={[.95,.85]}/><meshStandardMaterial color="#253c47" side={2} metalness={.5} roughness={.25}/></mesh>))}<mesh position={[0,2.2,3.51]}><planeGeometry args={[1.95,.9]}/><meshStandardMaterial color="#314652"/></mesh></>:rickshaw?<><RoundedBox args={[1.45,.18,1.7]} radius={.12} position={[0,1.65,-.2]}><meshStandardMaterial color="#d9b749"/></RoundedBox><mesh position={[0,1.25,.65]} rotation={[-.1,0,0]}><boxGeometry args={[1.2,.8,.04]}/><meshStandardMaterial color="#668888" transparent opacity={.7}/></mesh><mesh position={[0,1.2,-.9]}><boxGeometry args={[1.2,.75,.08]}/><meshStandardMaterial color="#333c34"/></mesh></>:<RoundedBox args={[1.35,.55,1.7]} radius={.16} position={[0,1.16,-.1]}><meshStandardMaterial color="#42535a" metalness={.6} roughness={.2}/></RoundedBox>}
    {[-1,1].flatMap(x=>[-1,1].map(z=><mesh key={`${x}${z}`} position={[x*width/2,.4,z*length*.3]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[bus?.42:.3,bus?.42:.3,.15,12]}/><meshStandardMaterial color="#202326"/></mesh>))}
    {[-1,1].map(side=><mesh key={side} position={[side*width*.32,.8,length/2+.02]}><boxGeometry args={[.22,.12,.035]}/><meshStandardMaterial color="#f1e1b1" emissive="#e0cb8e" emissiveIntensity={.6}/></mesh>)}
  </group>;
}
function Metro({time}: {time:MutableRefObject<number>}) {
  const ref=useRef<Group>(null);
  useFrame(()=>{if(ref.current)ref.current.position.x=(time.current*2.1+70)%230-115;});
  return <group position={[0,0,-58]}>
    <mesh position={[0,9.4,0]} castShadow receiveShadow><boxGeometry args={[160,.9,4.8]}/><meshStandardMaterial color="#9b9b8f" roughness={.9}/></mesh>
    {[-60,-40,-20,20,40,60].map(x=><group key={x} position={[x,0,0]}><mesh position={[0,4.3,0]} castShadow><boxGeometry args={[1.5,8.6,1.6]}/><meshStandardMaterial color="#a9a99a"/></mesh><mesh position={[0,8.7,0]}><boxGeometry args={[2.8,.7,4.5]}/><meshStandardMaterial color="#b5b5a5"/></mesh></group>)}
    {[-1,1].map(side=><mesh key={side} position={[0,10,side*2.3]}><boxGeometry args={[160,.55,.15]}/><meshStandardMaterial color="#b8b8a8"/></mesh>)}
    <group ref={ref} position={[0,10.2,0]}>{Array.from({length:4},(_,i)=><group key={i} position={[-i*9,0,0]}>
      <RoundedBox args={[8.5,2.35,3.1]} radius={.25} position={[0,1.2,0]} castShadow><meshStandardMaterial color="#d2d5cf" metalness={.45} roughness={.4}/></RoundedBox>
      {[-1,1].map(side=><group key={side}><mesh position={[0,1.35,side*1.57]}><boxGeometry args={[7.8,.9,.025]}/><meshStandardMaterial color="#3e5662" metalness={.35}/></mesh><mesh position={[0,.73,side*1.59]}><boxGeometry args={[8.1,.14,.02]}/><meshStandardMaterial color="#b44f59"/></mesh>{[-2.4,0,2.4].map(x=><mesh key={x} position={[x,1.35,side*1.59]}><boxGeometry args={[.16,1,.02]}/><meshStandardMaterial color="#c5cbc5"/></mesh>)}</group>)}
      <mesh position={[0,2.45,0]}><boxGeometry args={[2.4,.15,1.6]}/><meshStandardMaterial color="#9aaba9"/></mesh>
    </group>)}</group>
  </group>;
}
export default memo(function DelhiScene({scenario,time,selected,onSelect,cameraView,onBearingChange,highQuality}: SceneProps) {
  const dusk=scenario.dusk;
  const textures=useMemo(()=>({stone:surfaceTexture('stone'),road:surfaceTexture('road'),grass:surfaceTexture('grass'),facade:surfaceTexture('facade',dusk)}),[dusk]);
  useEffect(()=>()=>{Object.values(textures).forEach(texture=>texture.dispose());},[textures]);
  const buildings=useMemo(()=>Array.from({length:26},(_,i)=>({x:(i%2?1:-1)*(19+(Math.floor(i/2)%3)*13),z:-Math.floor(i/6)*19-8,width:8+i%3*1.4,height:5+i%4*2.3,depth:8+i%2*2,index:i})),[]);
  const roadPaint='#d3d2bb';
  return <>
    <color attach="background" args={[dusk?'#8c8b98':'#c8c8be']}/>
    <fog attach="fog" args={[dusk?'#8c8b98':'#d4ceb9',scenario.difficulty==='challenge'?30:65,scenario.difficulty==='challenge'?130:205]}/>
    <Sky distance={450000} sunPosition={dusk?[-70,3,-80]:[-60,22,-90]} turbidity={dusk?9:6} rayleigh={1.2} mieCoefficient={.008} mieDirectionalG={.8}/>
    <hemisphereLight args={['#d4deeb','#8e7e62',dusk?1.2:1.8]}/>
    <directionalLight position={[-35,35,5]} intensity={dusk?2:3.2} color={dusk?'#ffbf83':'#fff0d3'} castShadow shadow-mapSize={highQuality?[2048,2048]:[1024,1024]} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={160} shadow-normalBias={.08}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.03,0]} receiveShadow><planeGeometry args={[400,400]}/><meshStandardMaterial map={textures.grass} bumpMap={textures.grass} bumpScale={.07} roughness={1}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]} receiveShadow><planeGeometry args={[13,180]}/><meshStandardMaterial map={textures.road} bumpMap={textures.road} bumpScale={.025} roughness={.92}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.012,12]} receiveShadow><planeGeometry args={[140,10]}/><meshStandardMaterial map={textures.road}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,-26]} receiveShadow><circleGeometry args={[13,64]}/><meshStandardMaterial map={textures.road}/></mesh>
    {[-1,1].map(side=><group key={side}>
      <mesh position={[side*7.2,.13,0]} receiveShadow><boxGeometry args={[1.5,.25,180]}/><meshStandardMaterial map={textures.stone} color="#e5ded0"/></mesh>
      {Array.from({length:30},(_,i)=><mesh key={i} position={[side*6.55,.15,i*6-88]}><boxGeometry args={[.25,.3,3]}/><meshStandardMaterial color={i%2?'#bcb8a8':'#41463f'}/></mesh>)}
      {Array.from({length:10},(_,i)=><group key={i} position={[side*8.3,0,i*17-70]}>
        <mesh position={[0,3.4,0]} castShadow><cylinderGeometry args={[.055,.085,6.8,8]}/><meshStandardMaterial color="#546056" metalness={.5}/></mesh>
        <mesh position={[-side*.4,6.8,0]}><boxGeometry args={[1.1,.11,.3]}/><meshStandardMaterial color="#353d38"/></mesh>
        <mesh position={[-side*.75,6.72,0]}><boxGeometry args={[.4,.04,.23]}/><meshStandardMaterial color="#f1d6a3" emissive="#ffbd6e" emissiveIntensity={dusk?2:.1}/></mesh>
      </group>)}
    </group>)}
    {Array.from({length:32},(_,i)=><mesh key={i} rotation={[-Math.PI/2,0,0]} position={[0,.018,i*5-85]}><planeGeometry args={[.12,2.5]}/><meshStandardMaterial color={roadPaint}/></mesh>)}
    {[-1,1].map(side=><mesh key={side} rotation={[-Math.PI/2,0,0]} position={[side*5.8,.019,0]}><planeGeometry args={[.1,180]}/><meshStandardMaterial color={roadPaint}/></mesh>)}
    {buildings.map(b=><Building key={b.index} {...b} stone={textures.stone} facade={textures.facade}/>)}
    {Array.from({length:18},(_,i)=><group key={i} position={[(i-9)*11,0,-112-(i%3)*9]}><mesh position={[0,(15+i%5*5)/2,0]} castShadow><boxGeometry args={[7,15+i%5*5,9]}/><meshStandardMaterial map={textures.facade} color="#bfc0b6"/></mesh></group>)}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.035,-26]} receiveShadow><circleGeometry args={[8.4,64]}/><meshStandardMaterial map={textures.grass}/></mesh>
    <Gate stone={textures.stone}/>
    <Metro time={time}/>
    {Array.from({length:24},(_,i)=><Tree key={i} x={(i%2?1:-1)*(11.5+(i%3)*.7)} z={25-Math.floor(i/2)*9} scale={.65+(i%3)*.1}/>)}
    {Array.from({length:14},(_,i)=><Tree key={`park${i}`} x={(i%2?1:-1)*(37+i%3*7)} z={26-Math.floor(i/2)*11} scale={1.1}/>)}
    {[0,1,2,3,4,5,6,7].map(i=><Car key={i} lane={i%2?3.4:-3.4} start={i*18+5} variant={i===6?'bus':i===7?'rickshaw':'car'} color={['#e4dfd0','#b7c8c8','#b97553','#ede9df','#739288','#d4caaa','#bf5950','#4b9661'][i]} time={time}/>)}
    {Array.from({length:scenario.count},(_,index)=>scenario.category==='Bird'?<Bird key={index} index={index} scenario={scenario} time={time} selected={selected} onSelect={onSelect}/>:<Drone key={index} index={index} scenario={scenario} time={time} selected={selected} onSelect={onSelect}/>)}
    <CameraRig view={cameraView} onBearingChange={onBearingChange}/>
  </>;
});
