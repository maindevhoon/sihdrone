import { contactPosition, type Position, type Scenario } from './simulation';
export const SCOPE_CENTER=120, SCOPE_RADIUS=88;
export function projectContact([x,,z]:Position,range:number,heading=0):[number,number] {
  const y=z-12,a=heading*Math.PI/180,scale=SCOPE_RADIUS/range;
  return [SCOPE_CENTER+(x*Math.cos(a)+y*Math.sin(a))*scale,SCOPE_CENTER+(y*Math.cos(a)-x*Math.sin(a))*scale];
}
/** Resolve clustered scope hits by distance instead of HTML button stacking order. */
export function pickRadarContact(contacts: {id:number;position:Position}[],point:[number,number],range:number,heading=0,tolerance=10):number|null {
  let nearest:number|null=null,distance=tolerance;
  for(const {id,position} of contacts){
    if(Math.hypot(position[0],position[2]-12)>range)continue;
    const [x,y]=projectContact(position,range,heading),delta=Math.hypot(x-point[0],y-point[1]);
    if(delta<=distance){nearest=id;distance=delta;}
  }
  return nearest;
}
export function contactReadout(scenario:Scenario,time:number,id:number,metresPerUnit=1) {
  const p=contactPosition(scenario,time,id),previous=contactPosition(scenario,Math.max(scenario.arrival,time-.25),id);
  const delta=Math.min(.25,Math.max(0,time-scenario.arrival));
  return {
    range:Math.hypot(p[0],p[2]-12)*metresPerUnit,
    bearing:(Math.atan2(p[0],12-p[2])*180/Math.PI+360)%360,
    altitude:p[1]*metresPerUnit,
    speed:delta>0?Math.hypot(p[0]-previous[0],p[2]-previous[2])*metresPerUnit/delta:0,
  };
}
export function contactTrail(scenario:Scenario,time:number,id:number,range:number,heading:number) {
  return [5,4,3,2,1,0].map(age=>time-age*.6).filter(t=>t>=scenario.arrival).map(t=>projectContact(contactPosition(scenario,t,id),range,heading));
}
