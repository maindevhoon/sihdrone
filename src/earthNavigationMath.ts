export type NavigationInput = 'trackpad' | 'mouse';
export type WheelInput = {deltaX:number;deltaY:number;deltaMode:number;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean};
export type NavigationIntent = {kind:'pan';x:number;y:number} | {kind:'orbit';x:number;y:number} | {kind:'zoom';logScale:number};
export const MIN_EARTH_RANGE=35, MAX_EARTH_RANGE=2_000_000;
export const MIN_EARTH_PITCH=-88*Math.PI/180, MAX_EARTH_PITCH=-12*Math.PI/180;
export const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export function wheelIntent(event:WheelInput,input:NavigationInput,pageHeight:number):NavigationIntent|null {
  if(!Number.isFinite(event.deltaX)||!Number.isFinite(event.deltaY))return null;
  const unit=event.deltaMode===1?16:event.deltaMode===2?pageHeight:1;
  const x=clamp(event.deltaX*unit,-160,160),y=clamp(event.deltaY*unit,-160,160);
  if(x===0&&y===0)return null;
  if(event.ctrlKey||event.metaKey)return {kind:'zoom',logScale:y*.009};
  if(input==='trackpad')return {kind:event.shiftKey?'pan':'orbit',x,y};
  if(event.shiftKey)return {kind:'orbit',x,y};
  return {kind:'zoom',logScale:y*.0025};
}
export function zoomRange(range:number,logScale:number):number {
  return clamp(range*Math.exp(clamp(logScale,-.6,.6)),MIN_EARTH_RANGE,MAX_EARTH_RANGE);
}
export function orbitAngles(heading:number,pitch:number,x:number,y:number) {
  return {heading:((heading-x*.004)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),pitch:clamp(pitch+y*.003,MIN_EARTH_PITCH,MAX_EARTH_PITCH)};
}
export function safariGestureDelta(previous:{scale:number;rotation:number},next:{scale:number;rotation:number}) {
  if(!Number.isFinite(next.scale)||next.scale<=0||!Number.isFinite(next.rotation))return null;
  return {logScale:Math.log(previous.scale/next.scale),rotation:next.rotation-previous.rotation};
}
