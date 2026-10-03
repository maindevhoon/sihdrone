import { useId, useState } from 'react';
import { visibleContacts, type Scenario } from './simulation';
import { contactReadout, contactTrail, projectContact, SCOPE_CENTER as C, SCOPE_RADIUS as R } from './radarMath';
type Props={scenario:Scenario;time:number;selected:boolean;paused:boolean;preview?:boolean;replay?:boolean;bearing?:number;metresPerUnit?:number;onSelect?:()=>void};
export default function Radar({scenario,time,selected,paused,preview=false,replay=false,bearing=0,metresPerUnit=1,onSelect}:Props) {
  const uid=useId().replaceAll(':','');
  const [range,setRange]=useState(60);
  const [headingUp,setHeadingUp]=useState(false);
  const [trails,setTrails]=useState(true);
  const [track,setTrack]=useState(0);
  const contacts=visibleContacts(scenario,time);
  const activeId=Math.min(track,scenario.count-1);
  const orientation=headingUp?bearing:0;
  const readout=contacts.length?contactReadout(scenario,time,activeId,metresPerUnit):null;
  const inRange=contacts.filter(({position})=>Math.hypot(position[0],position[2]-12)<=range);
  const rangeIndex=[30,60,120].indexOf(range);
  const state=preview?'PREVIEW':replay?'REPLAY':paused?'HOLD':'LIVE';
  const trackLabel=`T${(activeId+1).toString().padStart(2,'0')}`;
  return <div className="radar-instrument radar-mfd" aria-label={`Simulated radar. ${inRange.length} contacts in range. ${state}.`}>
    <div className="radar-header"><span>SITUATION DISPLAY</span><span className={`radar-state ${paused?'':'radar-live'}`}>{state}</span></div>
    <div className="radar-controls"><button aria-label="Toggle radar orientation" aria-pressed={headingUp} onClick={()=>setHeadingUp(v=>!v)}>{headingUp?'HDG UP':'NORTH UP'}</button><span>SIM / PPI</span><button aria-label="Toggle radar trails" aria-pressed={trails} onClick={()=>setTrails(v=>!v)}>TRAIL</button></div>
    <div className="radar-scope">
      <svg viewBox="0 0 240 240" role="img" aria-label="Simulated radar scope with contact trails and bearing markings">
        <defs><radialGradient id={`${uid}-glow`}><stop stopColor="#72e9a8" stopOpacity=".08"/><stop offset="1" stopColor="#72e9a8" stopOpacity="0"/></radialGradient><clipPath id={`${uid}-clip`}><circle cx={C} cy={C} r={R}/></clipPath></defs>
        <circle cx={C} cy={C} r={R} fill={`url(#${uid}-glow)`}/>
        {[R/3,R*2/3,R].map((r,i)=><g key={r}><circle cx={C} cy={C} r={r} fill="none" stroke="currentColor" strokeOpacity={i===2?.65:.28} strokeWidth=".7"/><text x={C+4} y={C-r+10} className="scope-range-label">{Math.round(range*(i+1)/3*metresPerUnit)}</text></g>)}
        <path d="M32 120h176M120 32v176" stroke="currentColor" strokeOpacity=".3" strokeWidth=".6" strokeDasharray="2 5"/>
        {Array.from({length:72},(_,i)=><line key={i} x1={C} y1="26" x2={C} y2={i%6===0?'33':i%2===0?'30':'28'} transform={`rotate(${i*5} ${C} ${C})`} stroke="currentColor" strokeOpacity={i%6===0?.85:.4} strokeWidth=".8"/>)}
        {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <text key={i} x={C+108*Math.sin(a)} y={C-108*Math.cos(a)+3} textAnchor="middle" className="scope-bearing-label">{Math.round((i*30+orientation)%360).toString().padStart(3,'0')}</text>;})}
        <g clipPath={`url(#${uid}-clip)`}>
          <g data-sweep transform={`rotate(${time*60-orientation} ${C} ${C})`}>
            {Array.from({length:14},(_,i)=><path key={i} d="M120 120V32A88 88 0 0 0 112.33 32.33Z" transform={`rotate(${-i*5} ${C} ${C})`} fill="#8cfdad" opacity={(14-i)*.004}/>)}
            <path d="M120 120V32" stroke="#9fffc4" strokeWidth=".9" opacity=".7"/>
          </g>
          <path d="M120 120L90 43A88 88 0 0 1 150 43Z" fill="#a3f3c0" fillOpacity=".025" stroke="#8bdfab" strokeOpacity=".3" strokeWidth=".6" strokeDasharray="3 4" transform={`rotate(${bearing-orientation} ${C} ${C})`}/>
          {inRange.map(({id,position})=>{
            const [x,y]=projectContact(position,range,orientation);
            const active=selected&&id===activeId;
            const points=contactTrail(scenario,time,id,range,orientation);
            return <g key={id}>
              {trails&&<polyline points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#9df8bb" strokeWidth="1" strokeOpacity=".4"/>}
              <g data-contact={id} transform={`translate(${x} ${y})`} className={active?'radar-track active-track':'radar-track'}>
                <circle r="7" fill="currentColor" opacity=".09"/>
                <path d="M-3.5-3.5h7v7h-7Z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                {active&&<path d="M-8-3v-5h5M3-8h5v5M8 3v5H3M-3 8h-5V3" fill="none" stroke="currentColor" strokeWidth="1.2"/>}
                <text x="7" y="-5" className="scope-track-label">{id+1}</text>
              </g>
            </g>;
          })}
        </g>
        <g transform={`rotate(${bearing-orientation} ${C} ${C})`}><path d="M120 114l-4 10 4-2 4 2Z" fill="#e3ffec"/><path d="M112 128h16" stroke="#e3ffec" strokeWidth="1"/></g>
        <text x="120" y="237" textAnchor="middle" className="scope-heading-label">HDG {bearing.toString().padStart(3,'0')}°</text>
      </svg>
      {inRange.map(({id,position})=>{const [x,y]=projectContact(position,range,orientation);return <button key={id} className="radar-hit" style={{left:`${x/2.4}%`,top:`${y/2.4}%`}} aria-label={`Inspect radar track ${id+1}`} title={`Inspect track ${id+1}`} onClick={()=>{setTrack(id);if(!paused&&!preview&&!replay)onSelect?.();}}/>;})}
      {!contacts.length&&<span className="radar-empty">SCANNING</span>}
    </div>
    <div className="radar-range-controls"><button aria-label="Decrease radar range" disabled={rangeIndex===0} onClick={()=>setRange([30,60,120][rangeIndex-1])}>−</button><span>RNG <strong>{range*metresPerUnit}</strong> m</span><button aria-label="Increase radar range" disabled={rangeIndex===2} onClick={()=>setRange([30,60,120][rangeIndex+1])}>+</button></div>
    <div className="radar-track-data"><span>{readout?trackLabel:'T––'} <strong>{readout?`${Math.round(readout.bearing).toString().padStart(3,'0')}° / ${Math.round(readout.range)}m`:'NO RETURNS'}</strong></span><span>ALT <strong>{readout?Math.round(readout.altitude):'––'}m</strong> SPD <strong>{readout?readout.speed.toFixed(1):'––'}</strong></span></div>
    <div className="radar-footer"><span>TRK <strong>{inRange.length.toString().padStart(2,'0')}</strong>{contacts.length>inRange.length&&` / ${contacts.length-inRange.length} OUT`}</span><span>SYNTHETIC · m/s</span></div>
  </div>;
}
