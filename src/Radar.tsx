import { useId, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import TrackChecklist from './TrackChecklist';
import { formatTime, visibleContacts, type Category, type Position, type Scenario, type TrackDecision } from './simulation';
import { contactReadout, contactTrail, DEFAULT_RADAR_OBSERVER, pickRadarContact, projectContact, radarRange, SCOPE_CENTER as C, SCOPE_RADIUS as R } from './radarMath';
type Props={scenario:Scenario;time:number;selected:boolean;paused:boolean;preview?:boolean;replay?:boolean;onTogglePreview?:()=>void;bearing?:number;metresPerUnit?:number;track:number;assessment?:Category|'';decisions?:TrackDecision[];observer?:Position;mapFollow?:boolean;onTrack:(id:number)=>void;onSelect?:(id:number)=>void};
// Track identity follows the operator's assessment, never the scenario's ground truth.
const identity=(assessment:Category|'')=>assessment==='Bird'?{key:'neutral',label:'NEUTRAL · BIO'}:assessment?{key:'suspect',label:`SUSPECT · ${assessment==='Drone group'?'UAS GRP':'UAS'}`}:{key:'unknown',label:'UNKNOWN'};
export default function Radar({scenario,time,selected,paused,preview=false,replay=false,onTogglePreview,bearing=0,metresPerUnit=1,track,assessment='',decisions,observer=DEFAULT_RADAR_OBSERVER,mapFollow=false,onTrack,onSelect}:Props) {
  const uid=useId().replaceAll(':','');
  const [range,setRange]=useState(60);
  const [headingUp,setHeadingUp]=useState(false);
  const [trails,setTrails]=useState(true);
  const contacts=visibleContacts(scenario,time);
  const activeId=Math.min(track,scenario.count-1);
  const orientation=headingUp?bearing:0;
  const readout=contacts.length?contactReadout(scenario,time,activeId,metresPerUnit,observer):null;
  const inRange=contacts.filter(({position})=>radarRange(position,observer)<=range);
  const rangeIndex=[30,60,120].indexOf(range);
  const state=preview?(paused?'PREVIEW · HOLD':'PREVIEW · PLAY'):replay?(paused?'REPLAY · HOLD':'REPLAY'):paused?'HOLD':'LIVE';
  const trackLabel=`T${(activeId+1).toString().padStart(2,'0')}`;
  const id=identity(decisions?.find(item=>item.id===activeId)?.answer ?? assessment);
  function inspect(contact:number){onTrack(contact);if(!paused&&!preview&&!replay)onSelect?.(contact);}
  return <div className={`radar-instrument radar-mfd identity-${id.key}`} data-time={time} data-paused={paused} data-observer={observer.join(",")} aria-label={`Simulated radar. ${inRange.length} contacts in range. ${state}.`}>
    <div className="radar-header"><span>PPI · SURVEILLANCE</span><span className={`radar-state ${paused?'':'radar-live'}`}>{state}</span></div>
    <div className="radar-controls"><button aria-label="Toggle radar orientation" aria-pressed={headingUp} onClick={()=>setHeadingUp(v=>!v)}>{headingUp?'HDG UP':'NORTH UP'}</button><button aria-label="Toggle radar trails" aria-pressed={trails} onClick={()=>setTrails(v=>!v)}>TRAIL</button><div className="radar-range-controls"><button aria-label="Decrease radar range" disabled={rangeIndex===0} onClick={()=>setRange([30,60,120][rangeIndex-1])}>−</button><span>{range*metresPerUnit}<small>m</small></span><button aria-label="Increase radar range" disabled={rangeIndex===2} onClick={()=>setRange([30,60,120][rangeIndex+1])}>+</button></div></div>
    {preview&&onTogglePreview&&<div className="radar-preview"><button aria-label={paused?'Play radar preview':'Pause radar preview'} onClick={onTogglePreview}>{paused?<Play size={12}/>:<Pause size={12}/>} {paused?'Play sample':'Pause sample'}</button><span>{formatTime(time)} · UNSCORED</span></div>}
    <div className="radar-scope">
      <svg viewBox="0 0 240 240" role="img" aria-label="Simulated radar scope with contact trails and bearing markings" onClick={event=>{
        const bounds=event.currentTarget.getBoundingClientRect();
        const point:[number,number]=[(event.clientX-bounds.left)*240/bounds.width,(event.clientY-bounds.top)*240/bounds.height];
        const contact=pickRadarContact(contacts,point,range,orientation,Math.max(8,12*240/bounds.width),observer);
        if(contact!==null)inspect(contact);
      }}>
        <defs><radialGradient id={`${uid}-glow`}><stop stopColor="#5ef0b0" stopOpacity=".07"/><stop offset="1" stopColor="#5ef0b0" stopOpacity="0"/></radialGradient><clipPath id={`${uid}-clip`}><circle cx={C} cy={C} r={R}/></clipPath></defs>
        <circle cx={C} cy={C} r={R} fill={`url(#${uid}-glow)`}/>
        {[R/3,R*2/3,R].map((r,i)=><g key={r}><circle cx={C} cy={C} r={r} fill="none" stroke="currentColor" strokeOpacity={i===2?.6:.22} strokeWidth=".7"/><text x={C+4} y={C-r+10} className="scope-range-label">{Math.round(range*(i+1)/3*metresPerUnit)}</text></g>)}
        <path d="M32 120h176M120 32v176" stroke="currentColor" strokeOpacity=".22" strokeWidth=".6" strokeDasharray="2 5"/>
        {Array.from({length:72},(_,i)=><line key={i} x1={C} y1="26" x2={C} y2={i%6===0?'33':i%2===0?'30':'28'} transform={`rotate(${i*5} ${C} ${C})`} stroke="currentColor" strokeOpacity={i%6===0?.8:.35} strokeWidth=".8"/>)}
        {Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return <text key={i} x={C+108*Math.sin(a)} y={C-108*Math.cos(a)+3} textAnchor="middle" className="scope-bearing-label">{Math.round((i*30+orientation)%360).toString().padStart(3,'0')}</text>;})}
        <g clipPath={`url(#${uid}-clip)`}>
          <g data-sweep transform={`rotate(${time*60-orientation} ${C} ${C})`}>
            {Array.from({length:14},(_,i)=><path key={i} d="M120 120V32A88 88 0 0 0 112.33 32.33Z" transform={`rotate(${-i*5} ${C} ${C})`} fill="#7dfcb8" opacity={(14-i)*.004}/>)}
            <path d="M120 120V32" stroke="#9fffc8" strokeWidth=".9" opacity=".7"/>
          </g>
          <path d="M120 120L90 43A88 88 0 0 1 150 43Z" fill="#a3f3c0" fillOpacity=".03" stroke="#8bdfab" strokeOpacity=".3" strokeWidth=".6" strokeDasharray="3 4" transform={`rotate(${bearing-orientation} ${C} ${C})`}/>
          {inRange.map(({id:contact,position})=>{
            const [x,y]=projectContact(position,range,orientation,observer);
            const active=contact===activeId;
            const trackIdentity=identity(decisions?.find(item=>item.id===contact)?.answer ?? assessment);
            const points=contactTrail(scenario,time,contact,range,orientation,observer);
            return <g key={contact}>
              {trails&&<polyline points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke="currentColor" className="radar-trail" strokeWidth="1" strokeOpacity=".4"/>}
              <g data-contact={contact} transform={`translate(${x} ${y})`} className={`radar-track ${active?'active-track':''}`} style={{color:trackIdentity.key==='suspect'?'#ff8073':trackIdentity.key==='neutral'?'#72e5ad':'#ffd25a'}}>
                <circle r="7" fill="currentColor" opacity=".08"/>
                {trackIdentity.key==='suspect'?<path d="M0-5L5 0 0 5-5 0Z" fill="none" stroke="currentColor" strokeWidth="1.3"/>:<path d="M-3.5-3.5h7v7h-7Z" fill="none" stroke="currentColor" strokeWidth="1.3"/>}
                {active&&(selected||preview||replay)&&<path d="M-8-3v-5h5M3-8h5v5M8 3v5H3M-3 8h-5V3" fill="none" stroke="currentColor" strokeWidth="1.1"/>}
                <text x="7" y="-5" className="scope-track-label">{contact+1}</text>
              </g>
            </g>;
          })}
        </g>
        <g transform={`rotate(${bearing-orientation} ${C} ${C})`}><path d="M120 114l-4 10 4-2 4 2Z" fill="#e3ffec"/><path d="M112 128h16" stroke="#e3ffec" strokeWidth="1"/></g>
      </svg>
      {!inRange.length&&<span className="radar-empty">{contacts.length?'NO RETURNS IN RANGE':'SCANNING'}</span>}
      <span className="radar-heading">HDG {bearing.toString().padStart(3,'0')}°</span><span className="radar-origin" title={mapFollow?'Radar and EO/IR observer follow map panning':'Observer at the training site'}>{mapFollow?'MAP FOLLOW':'SITE FIXED'}</span>
    </div>
    {contacts.length>0&&(decisions&&!replay?<TrackChecklist tracks={contacts.map(({id,position})=>({id,outside:radarRange(position,observer)>range}))} decisions={decisions} selected={activeId} onInspect={inspect}/>:<div className="radar-track-picker" role="group" aria-label="Radar tracks">{contacts.map(({id:contact,position})=>{
      const outside=radarRange(position,observer)>range;
      return <button key={contact} aria-label={`Inspect radar track ${contact+1}`} aria-pressed={contact===activeId} className={outside?'outside-range':''} title={`Slew EO/IR to track ${contact+1}${outside?' (outside scope range)':''}`} onClick={()=>inspect(contact)}>T{(contact+1).toString().padStart(2,'0')}{outside&&<small>OUT</small>}</button>;
    })}</div>)}
    <dl className="radar-track-data">
      <div><dt>TRK</dt><dd>{readout?trackLabel:'—'}</dd></div>
      <div><dt>BRG / RNG</dt><dd>{readout?`${Math.round(readout.bearing).toString().padStart(3,'0')}°/${Math.round(readout.range)}m`:'NO RTN'}</dd></div>
      <div><dt>ALT</dt><dd>{readout?`${Math.round(readout.altitude)}m`:'—'}</dd></div>
      <div><dt>GS m/s</dt><dd>{readout?readout.speed.toFixed(1):'—'}</dd></div>
      <div className="radar-identity"><dt>ID</dt><dd>{readout?id.label:'—'}</dd></div>
    </dl>
    <div className="radar-footer"><span>TRK <strong>{inRange.length.toString().padStart(2,'0')}</strong>{contacts.length>inRange.length&&` · ${contacts.length-inRange.length} OUT OF RANGE`}</span><span>SYNTHETIC RETURNS</span></div>
  </div>;
}
