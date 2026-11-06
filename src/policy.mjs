// MIT. Pure configuration/policy; never touches browser or extension storage.
export const DEFAULT_CONFIG=Object.freeze({enabled:false,suspended:false,acknowledgedGlobalScope:false,mode:'convenience',multiWindowPolicy:'pause',defaultPolicy:'unmanaged',rules:{}});
const forbidden=new Set(['__proto__','prototype','constructor']);
const validId=id=>typeof id==='string' && id.length>0 && id.length<=255 && !/[\s\x00-\x1f]/u.test(id) && !forbidden.has(id);
export function validateConfig(input){
 if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('invalid-config');
 const c=Object.fromEntries(Object.entries(DEFAULT_CONFIG).map(([key,value])=>[key,Object.hasOwn(input,key)?input[key]:structuredClone(value)]));c.rules={};
 for(const key of ['enabled','suspended','acknowledgedGlobalScope'])if(typeof c[key]!=='boolean')throw new Error('invalid-config');
 if(!['pause','disable'].includes(c.multiWindowPolicy))throw new Error('invalid-multi-window-policy');
 if(c.mode!=='convenience')throw new Error('isolation-not-supported');
 if(c.defaultPolicy!=='unmanaged')throw new Error('unmanaged-default-required');
 if(c.enabled && !c.acknowledgedGlobalScope)throw new Error('convenience-acknowledgement-required');
 if(!input.rules || typeof input.rules!=='object' || Array.isArray(input.rules))throw new Error('invalid-rules');
 if(Object.keys(input.rules).length>500)throw new Error('too-many-rules');
 for(const [id,rule] of Object.entries(input.rules)){
  if(!validId(id) || !rule || !['all','allow','deny'].includes(rule.kind) || !Array.isArray(rule.spaces) || rule.spaces.length>200 || rule.spaces.some(x=>!validId(x)) || typeof rule.sensitiveAcknowledged!=='boolean')throw new Error('invalid-rule');
  c.rules[id]={kind:rule.kind,spaces:[...new Set(rule.spaces)],sensitiveAcknowledged:rule.sensitiveAcknowledged};
 }
 return c;
}
export function blankState(){return {version:1,config:structuredClone(DEFAULT_CONFIG),journal:{},conflicts:{},history:[],fault:null};}
export function validateState(raw){
 if(!raw || raw.version!==1)throw new Error('unsupported-state');
 const s=blankState();s.config=validateConfig(raw.config);
 for(const name of ['journal','conflicts'])if(!raw[name] || typeof raw[name]!=='object' || Array.isArray(raw[name]))throw new Error('invalid-state');
 for(const [id,e] of Object.entries(raw.journal)){
  if(!validId(id) || !e || typeof e.baselineDisabled!=='boolean' || typeof e.expectedDisabled!=='boolean' || typeof e.owned!=='boolean' || e.pending && (typeof e.pending.from!=='boolean' || typeof e.pending.to!=='boolean'))throw new Error('invalid-journal');
  s.journal[id]={baselineDisabled:e.baselineDisabled,expectedDisabled:e.expectedDisabled,owned:e.owned,pending:e.pending?{from:e.pending.from,to:e.pending.to}:null};
 }
 for(const [id,value] of Object.entries(raw.conflicts))if(validId(id) && typeof value==='string')s.conflicts[id]=value.slice(0,100);else throw new Error('invalid-conflict');
 if(!Array.isArray(raw.history))throw new Error('invalid-history');
 s.history=raw.history.slice(-100).filter(e=>e && typeof e.action==='string').map(e=>({at:Number(e.at)||0,action:e.action.slice(0,80),id:validId(e.id)?e.id:'',code:typeof e.code==='string'?e.code.slice(0,80):''}));
 s.fault=typeof raw.fault==='string'?raw.fault.slice(0,100):null;return s;
}
export function sensitiveExtension(addon){
 return /1password|password|bitwarden|lastpass|dashlane|ublock|adblock|noscript|privacy|security|antivirus|authenticator|firewall|\bvpn\b/iu.test(`${addon.id} ${addon.name}`) || (addon.apiPermissions||[]).some(x=>['nativeMessaging','privacy','webRequestBlocking'].includes(x));
}
export function desiredDisabled(rule,spaceId,knownIds){
 if(rule.kind!=='all' && rule.spaces.some(id=>!knownIds.includes(id)))return {blocked:'missing-space'};
 if(rule.kind==='all')return {disabled:false};
 const selected=rule.spaces.includes(spaceId);
 return {disabled:rule.kind==='allow'?!selected:selected};
}
