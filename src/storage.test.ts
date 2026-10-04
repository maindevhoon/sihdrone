import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readSessions, saveSessions, STORAGE_KEY } from './storage';
import { createScenario, scoreSession, type Session } from './simulation';
class MemoryStorage {values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}clear(){this.values.clear();}}
const storage=new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
beforeEach(()=>storage.clear());
function session(index=1):Session {const scenario=createScenario('skyline',index,'guided',false);const detection=scenario.arrival+2;return {version:1,id:`session-${index}`,createdAt:'2026-10-03T18:00:00.000Z',scenario,duration:30,detection,answer:'Drone group',...scoreSession(scenario,detection,'Drone group',30),events:[{time:0,type:'start',label:'Exercise started'},{time:detection,type:'observation',label:'Observed'},{time:30,type:'finish',label:'Completed'}]};}
test('completed sessions survive serialization with their original variation',()=>{const original=session();assert.equal(saveSessions([original]),true);assert.deepEqual(readSessions(),[original]);});
test('history retains only the most recent twenty sessions',()=>{const items=Array.from({length:25},(_,i)=>session(i+1));saveSessions(items);assert.equal(readSessions().length,20);assert.equal(readSessions()[0].id,'session-1');assert.equal(readSessions().at(-1)?.id,'session-20');});
test('malformed browser storage cannot crash the application',()=>{for(const value of ['{broken','null','{}','[null,2,"text",{}]']){storage.setItem(STORAGE_KEY,value);assert.deepEqual(readSessions(),[]);}});
test('a tampered score or category is rejected while valid records are retained',()=>{const valid=session(1),changed=session(2),wrongScene=session(3);changed.score=999;wrongScene.scenario.category='Bird';storage.setItem(STORAGE_KEY,JSON.stringify([changed,valid,wrongScene]));assert.deepEqual(readSessions(),[valid]);});
test('storage failure reports failure without losing the in-memory session',()=>{const original=session();const previous=storage.setItem;storage.setItem=()=>{throw new Error('Quota');};try{assert.equal(saveSessions([original]),false);assert.equal(original.score,98);}finally{storage.setItem=previous;}});

test('legacy version-one results retain their original seed and motion',()=>{const original=session();original.scenario=createScenario('skyline',1,'guided',false,1);original.detection=original.scenario.arrival+2;Object.assign(original,scoreSession(original.scenario,original.detection,original.answer,original.duration));saveSessions([original]);assert.deepEqual(readSessions(),[original]);});
test('tampered trajectory fields are rejected',()=>{const original=session();original.scenario.radius=900;storage.setItem(STORAGE_KEY,JSON.stringify([original]));assert.deepEqual(readSessions(),[]);});
