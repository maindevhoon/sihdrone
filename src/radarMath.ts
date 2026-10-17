import { contactPosition, type Position, type Scenario } from './simulation';
import { sampleFlight } from './flightRuntime';
export const SCOPE_CENTER=120, SCOPE_RADIUS=88;
export const DEFAULT_RADAR_OBSERVER:Position=[0,0,12];
export const radarRange=(position:Position,observer:Position=DEFAULT_RADAR_OBSERVER)=>Math.hypot(position[0]-observer[0],position[2]-observer[2]);
export function projectContact(position:Position,range:number,heading=0,observer:Position=DEFAULT_RADAR_OBSERVER):[number,number] {
  const x=position[0]-observer[0],y=position[2]-observer[2],a=heading*Math.PI/180,scale=SCOPE_RADIUS/range;
  return [SCOPE_CENTER+(x*Math.cos(a)+y*Math.sin(a))*scale,SCOPE_CENTER+(y*Math.cos(a)-x*Math.sin(a))*scale];
}
/** Resolve clustered scope hits by distance instead of HTML button stacking order. */
export function pickRadarContact(contacts: {id:number;position:Position}[],point:[number,number],range:number,heading=0,tolerance=10,observer:Position=DEFAULT_RADAR_OBSERVER):number|null {
  let nearest:number|null=null,distance=tolerance;
  for(const {id,position} of contacts){
    if(radarRange(position,observer)>range)continue;
    const [x,y]=projectContact(position,range,heading,observer),delta=Math.hypot(x-point[0],y-point[1]);
    if(delta<=distance){nearest=id;distance=delta;}
  }
  return nearest;
}
export function contactReadout(scenario:Scenario,time:number,id:number,metresPerUnit=1,observer:Position=DEFAULT_RADAR_OBSERVER) {
  const p=contactPosition(scenario,time,id),previous=contactPosition(scenario,Math.max(scenario.arrival,time-.25),id);
  const delta=Math.min(.25,Math.max(0,time-scenario.arrival));
  return {
    range:radarRange(p,observer)*metresPerUnit,
    bearing:(Math.atan2(p[0]-observer[0],observer[2]-p[2])*180/Math.PI+360)%360,
    altitude:(p[1]-observer[1])*metresPerUnit,
    speed:scenario.version===4?Math.hypot(...sampleFlight(scenario,time,id).velocity.filter((_,i)=>i!==1)):delta>0?Math.hypot(p[0]-previous[0],p[2]-previous[2])*metresPerUnit/delta:0,
  };
}
export function contactTrail(scenario:Scenario,time:number,id:number,range:number,heading:number,observer:Position=DEFAULT_RADAR_OBSERVER) {
  return [5,4,3,2,1,0].map(age=>time-age*.6).filter(t=>t>=scenario.arrival).map(t=>projectContact(contactPosition(scenario,t,id),range,heading,observer));
}
