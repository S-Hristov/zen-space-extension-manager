import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../src/controller.mjs';
import {blankState,validateConfig,sensitiveExtension} from '../src/policy.mjs';
const rule=(kind='allow',spaces=['work'],sensitiveAcknowledged=false)=>({kind,spaces,sensitiveAcknowledged});
const config=rules=>({...blankState().config,enabled:true,acknowledgedGlobalScope:true,rules});
async function setup({disabled=false,raw=null,name='Fixture extension',supported=true}={}){
 const map=new Map([['fixture@test',{id:'fixture@test',name,userDisabled:disabled,isActive:!disabled,supported,canEnable:true,canDisable:true,apiPermissions:[]}]]);
 let context={count:1,privateCount:0,ready:true,pending:false,spaceId:'personal',spaces:[{uuid:'personal',name:'Personal'},{uuid:'work',name:'Work'},{uuid:'work2',name:'Work 2'}],externalSuspend:false};
 const store={raw:raw?structuredClone(raw):null,writes:[],fail:false,async read(){return this.raw;},async write(state){if(this.fail)throw new Error('disk full with secret must not be logged');this.raw=structuredClone(state);this.writes.push(this.raw);}};
 const addons={map,calls:[],active:0,max:0,failBefore:false,failAfter:false,gate:null,
  async get(id){return map.has(id)?structuredClone(map.get(id)):null;},
  async change(id,to,expected){
   assert.equal(store.raw.journal[id].pending.to,to,'write-ahead journal precedes native mutation');
   assert.equal(map.get(id).userDisabled,expected);
   this.active++;this.max=Math.max(this.max,this.active);this.calls.push({id,to});
   try{if(this.gate)await this.gate;if(this.failBefore){this.failBefore=false;throw new Error('denied');}map.get(id).userDisabled=to;map.get(id).isActive=!to;core.observeAddon(id,to);if(this.failAfter){this.failAfter=false;throw new Error('late failure');}}
   finally{this.active--;}
  },
 };
 const core=new Controller({store,addons,context:()=>context});await core.initialize();
 return {core,store,addons,setContext(patch){context={...context,...patch};return core.request();},context:()=>context};
}

test('fresh install makes no extension or persistent-state change',async()=>{
 const h=await setup();await h.core.request();await h.core.idle();assert.equal(h.addons.calls.length,0);assert.equal(h.store.writes.length,0);assert.equal(h.core.state.config.enabled,false);
});
test('explicit per-Space rules use stable IDs and only needed native changes',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 await h.setContext({spaceId:'work'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
 const count=h.addons.calls.length;await h.setContext({spaceId:'work'});await h.core.idle();assert.equal(h.addons.calls.length,count);
 await h.setContext({spaceId:'work2'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 await h.core.configure({...h.core.state.config,enabled:false});assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.deepEqual(h.core.state.journal,{});
});
test('globally enabled state does not imply isolation and sensitive rules require acknowledgement',async()=>{
 const h=await setup({name:'Company 1Password'});await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.calls.length,0);assert.equal(h.core.state.conflicts['fixture@test'],'sensitive-acknowledgement-required');
 await h.core.configure(config({'fixture@test':rule('allow',['work'],true)}));assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 assert.throws(()=>validateConfig({...config({}),mode:'isolation'}),/isolation-not-supported/);
 assert.throws(()=>validateConfig({...config({}),acknowledgedGlobalScope:false}),/acknowledgement/);
});
test('rapid 20 Space switches converge to newest intent without concurrent operations',async()=>{
 const h=await setup();let release;h.addons.gate=new Promise(r=>release=r);
 const first=h.core.configure(config({'fixture@test':rule()}));
 while(h.addons.calls.length===0)await new Promise(r=>setImmediate(r));
 for(let i=0;i<20;i++)h.setContext({spaceId:i%2?'work':'personal'});
 release();h.addons.gate=null;await first;await h.core.idle();
 assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.addons.max,1);assert.ok(h.addons.calls.length<=2);
});
test('new window appearing in-flight undoes owned disables, then pauses',async()=>{
 const h=await setup();let release;h.addons.gate=new Promise(r=>release=r);
 const operation=h.core.configure(config({'fixture@test':rule()}));while(!h.addons.calls.length)await new Promise(r=>setImmediate(r));
 h.setContext({count:2});release();h.addons.gate=null;await operation;await h.core.idle();
 assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.phase,'paused-multiple-or-unready-windows');
 const count=h.addons.calls.length;await h.setContext({spaceId:'work2'});await h.core.idle();assert.equal(h.addons.calls.length,count);
});
test('multi-window pause NEVER disables an extension another window may be using',async()=>{
 const h=await setup({disabled:true});await h.setContext({spaceId:'work'});await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
 const before=h.addons.calls.length;await h.setContext({count:2,spaceId:'personal'});await h.core.idle();assert.equal(h.addons.calls.length,before);assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
 await h.setContext({count:1,spaceId:'personal'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
});
test('private or unready windows block automatic switching',async()=>{
 const h=await setup();await h.setContext({privateCount:1});await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.calls.length,0);
 await h.setContext({privateCount:0,pending:true});await h.core.idle();assert.equal(h.addons.calls.length,0);
 await h.setContext({pending:false,ready:false});await h.core.idle();assert.equal(h.addons.calls.length,0);
});
test('manual extension changes win, are not fought, and reset keeps manual state',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule()}));h.addons.map.get('fixture@test').userDisabled=false;h.core.observeAddon('fixture@test',false);await h.core.idle();
 const count=h.addons.calls.length;await h.setContext({spaceId:'work2'});await h.core.idle();assert.equal(h.addons.calls.length,count);assert.equal(h.core.state.conflicts['fixture@test'],'manual-change');
 await h.core.resetRule('fixture@test');assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.config.rules['fixture@test'],undefined);
});
test('reset ordinary rule restores its original state and no other ownership is lost',async()=>{
 const h=await setup();h.addons.map.set('second@test',{...h.addons.map.get('fixture@test'),id:'second@test'});
 await h.core.configure(config({'fixture@test':rule(),'second@test':rule()}));await h.core.resetRule('fixture@test');
 assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.ok(h.core.state.journal['second@test']);
 await h.core.restore();assert.equal(h.addons.map.get('second@test').userDisabled,false);
});
test('startup interrupted-operation journal restores original states and disables automation',async()=>{
 const raw=blankState();raw.config=config({'fixture@test':rule()});raw.journal['fixture@test']={baselineDisabled:false,expectedDisabled:false,owned:true,pending:{from:false,to:true}};
 const h=await setup({disabled:true,raw});assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.config.enabled,false);assert.deepEqual(h.core.state.journal,{});
});
test('startup journal with native mutation not yet applied produces no unnecessary toggle',async()=>{
 const raw=blankState();raw.config=config({'fixture@test':rule()});raw.journal['fixture@test']={baselineDisabled:false,expectedDisabled:false,owned:true,pending:{from:false,to:true}};
 const h=await setup({disabled:false,raw});assert.equal(h.addons.calls.length,0);assert.equal(h.core.state.config.enabled,false);
});
test('normal stop restores original disabled baseline while preserving saved opt-in for next clean startup',async()=>{
 const h=await setup({disabled:true});await h.setContext({spaceId:'work'});await h.core.configure(config({'fixture@test':rule()}));await h.core.restore('normal-shutdown',{preserveEnabled:true});
 assert.equal(h.addons.map.get('fixture@test').userDisabled,true);assert.equal(h.core.state.config.enabled,true);assert.deepEqual(h.core.state.journal,{});
});
test('native failure stops automation and restores completed partial changes once',async()=>{
 const h=await setup();h.addons.failAfter=true;await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.core.state.config.enabled,false);assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.fault,'automation-stopped-after-error');
 const count=h.addons.calls.length;for(let i=0;i<5;i++)await h.setContext({spaceId:'work2'});await h.core.idle();assert.equal(h.addons.calls.length,count);
});
test('journal write failure prevents extension mutation and freezes future automation',async()=>{
 const h=await setup();h.store.fail=true;await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.calls.length,0);assert.equal(h.core.readOnly,true);assert.equal(h.core.state.config.enabled,false);
});
test('corrupt/unknown state is not overwritten or used to disable extensions',async()=>{
 const raw={version:99,password:'never inspect'};const h=await setup({raw});await h.core.request();assert.equal(h.core.readOnly,true);assert.equal(h.store.writes.length,0);assert.equal(h.addons.calls.length,0);assert.deepEqual(h.store.raw,raw);
});
test('missing Spaces block rules, unsupported add-ons are untouched, no default deny',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule('allow',['deleted-space'])}));assert.equal(h.addons.calls.length,0);assert.equal(h.core.state.conflicts['fixture@test'],'missing-space');
 const blocked=await setup({supported:false});await blocked.core.configure(config({'fixture@test':rule()}));assert.equal(blocked.addons.calls.length,0);
 assert.throws(()=>validateConfig({...config({}),defaultPolicy:'deny'}),/unmanaged-default/);
});
test('emergency Sine suspension restores originals, resume only affects explicit rules',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule()}));await h.setContext({externalSuspend:true});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.phase,'suspended');
 await h.setContext({externalSuspend:false});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
});
test('all/deny rules and sensitive detection remain explicit',()=>{
 assert.equal(sensitiveExtension({id:'x@test',name:'uBlock Origin',apiPermissions:[]}),true);
 assert.equal(sensitiveExtension({id:'x@test',name:'Developer tool',apiPermissions:['nativeMessaging']}),true);
 assert.throws(()=>validateConfig({...config({}),rules:JSON.parse('{"__proto__":{"kind":"all","spaces":[],"sensitiveAcknowledged":true}}')}),/invalid-rule/);
});
test('corrupt state stays byte-equivalent even on reset, recovery, configuration and unload',async()=>{
 const raw={version:99,keep:'untouched'};const h=await setup({raw});
 await h.core.resetRule('fixture@test');await h.core.recover();await h.core.configure(config({}));await h.core.restore('unload');
 assert.deepEqual(h.store.raw,raw);assert.equal(h.store.writes.length,0);assert.equal(h.addons.calls.length,0);
});
test('lost Space or revoked sensitive acknowledgement restores owned disable and stops automation',async()=>{
 for(const revoke of [false,true]){
  const h=await setup({name:revoke?'1Password fixture':'Fixture extension'});
  await h.core.configure(config({'fixture@test':rule('allow',['work'],true)}));
  if(revoke)await h.core.configure(config({'fixture@test':rule()}));
  else await h.setContext({spaces:[{uuid:'personal',name:'Personal'}]});
  await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.config.enabled,false);
 }
});
test('failed reset restoration retains durable recovery gate; explicit recovery retries once',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule()}));h.addons.failBefore=true;
 await h.core.resetRule('fixture@test');assert.equal(h.core.state.conflicts['fixture@test'],'restore-blocked');assert.ok(h.core.state.journal['fixture@test']);assert.equal(h.core.state.config.enabled,false);
 const n=h.addons.calls.length;await h.setContext({spaceId:'work'});await h.core.idle();assert.equal(h.addons.calls.length,n);
 await h.core.recover();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.deepEqual(h.core.state.journal,{});
});
test('unknown active Space pauses instead of applying a deny default',async()=>{
 const h=await setup();await h.setContext({spaceId:'unknown'});await h.core.configure(config({'fixture@test':rule()}));assert.equal(h.addons.calls.length,0);assert.equal(h.core.phase,'paused-multiple-or-unready-windows');
});
test('rules stay saved through clean restart and original baselines are recaptured',async()=>{
 const h=await setup();await h.core.configure(config({'fixture@test':rule()}));await h.core.restore('clean',{preserveEnabled:true});
 const next=await setup({raw:h.store.raw});await next.core.request();await next.core.idle();assert.equal(next.addons.map.get('fixture@test').userDisabled,true);assert.deepEqual(next.core.state.config.rules,h.core.state.config.rules);
});
test('queued off request compensates an already-running native disable',async()=>{
 const h=await setup();let release;h.addons.gate=new Promise(r=>release=r);const first=h.core.configure(config({'fixture@test':rule()}));
 while(!h.addons.calls.length)await new Promise(r=>setImmediate(r));
 const off=h.core.configure({...config({'fixture@test':rule()}),enabled:false});release();h.addons.gate=null;await first;await off;await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.addons.max,1);
});
test('configuration drops unrecognized fields instead of persisting arbitrary input',()=>{
 assert.equal(Object.hasOwn(validateConfig({...config({}),secret:'not retained'}),'secret'),false);
});
const guard=rules=>({...config(rules),multiWindowPolicy:'disable'});
test('privacy guard disables an owned enable across two windows and resumes current Space rule',async()=>{
 const h=await setup({disabled:true});await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule()}));assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
 await h.setContext({count:2});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);assert.equal(h.core.phase,'multi-window-guard-disabled');
 await h.setContext({count:1,spaceId:'work'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
});
test('privacy guard does not blindly restore ON in a different remaining Space',async()=>{
 const h=await setup({disabled:true});await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule()}));await h.setContext({count:2});await h.core.idle();
 await h.setContext({count:1,spaceId:'personal'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
});
test('privacy guard covers private/Little-Zen-counted windows, and never touches unmanaged extensions',async()=>{
 const h=await setup();h.addons.map.set('unmanaged@test',{...h.addons.map.get('fixture@test'),id:'unmanaged@test'});await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule()}));await h.setContext({privateCount:1});await h.core.idle();
 assert.equal(h.addons.map.get('fixture@test').userDisabled,true);assert.equal(h.addons.map.get('unmanaged@test').userDisabled,false);await h.setContext({privateCount:0});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
});
test('privacy guard requires critical acknowledgement and honors manual overrides',async()=>{
 const h=await setup({name:'1Password fixture'});await h.setContext({count:2});await h.core.configure(guard({'fixture@test':rule()}));assert.equal(h.addons.calls.length,0);
 await h.core.configure(guard({'fixture@test':rule('allow',['work'],true)}));assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 h.addons.map.get('fixture@test').userDisabled=false;h.core.observeAddon('fixture@test',false);await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.conflicts['fixture@test'],'manual-change');
});
test('guard failure freezes automation without re-enabling completed disables or retrying',async()=>{
 const h=await setup();h.addons.map.set('second@test',{...h.addons.map.get('fixture@test'),id:'second@test'});await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule(),'second@test':rule()}));
 const original=h.addons.change.bind(h.addons);h.addons.change=async(id,...args)=>{if(id==='second@test')throw Error('policy denied');return original(id,...args);};
 await h.setContext({count:2});await h.core.idle();assert.equal(h.core.state.fault,'privacy-guard-error-review-required');assert.equal(h.core.state.config.enabled,false);assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 const n=h.addons.calls.length;await h.setContext({count:1});await h.core.idle();assert.equal(h.addons.calls.length,n);assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
});
test('interrupted guard startup retains journal without automatic broad re-enable',async()=>{
 const raw=blankState();raw.config=guard({'fixture@test':rule()});raw.journal['fixture@test']={baselineDisabled:false,expectedDisabled:true,owned:true,pending:null};
 const h=await setup({disabled:true,raw});assert.equal(h.core.state.fault,'multi-window-recovery-required');assert.equal(h.addons.calls.length,0);assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 await h.core.recover();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.core.state.fault,null);
});
test('privacy guard keeps disables during unknown window model and serializes rapid window churn',async()=>{
 const h=await setup();await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule()}));await h.setContext({count:2});await h.core.idle();await h.setContext({count:1,ready:false});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 for(let i=0;i<20;i++)h.setContext({count:i%2?1:2,ready:true,spaceId:'work'});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);assert.equal(h.addons.max,1);
});
test('old configurations migrate to availability-preserving pause; invalid guard mode rejected',()=>{
 const old=config({});delete old.multiWindowPolicy;assert.equal(validateConfig(old).multiWindowPolicy,'pause');assert.throws(()=>validateConfig({...old,multiWindowPolicy:'isolation'}),/invalid-multi-window-policy/);
});
test('privacy-guard errors remain held through normal Sine/browser unload until explicit review',async()=>{
 const h=await setup();await h.setContext({spaceId:'work'});await h.core.configure(guard({'fixture@test':rule()}));h.addons.failAfter=true;await h.setContext({count:2});await h.core.idle();assert.equal(h.addons.map.get('fixture@test').userDisabled,true);
 const n=h.addons.calls.length;await h.core.restore('sine-unload',{preserveEnabled:true});assert.equal(h.addons.calls.length,n);assert.ok(h.core.state.journal['fixture@test']);
 await h.core.recover();assert.equal(h.addons.map.get('fixture@test').userDisabled,false);
});
