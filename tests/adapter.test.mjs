import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Import the exact adapter with only Gecko imports replaced by synthetic native wrappers.
const source=await readFile(new URL('../src/addons.sys.mjs',import.meta.url),'utf8');
const map=new Map(),calls=[];
const native={PENDING_NONE:0,OP_NEEDS_RESTART_NONE:0,PERM_CAN_ENABLE:2,PERM_CAN_DISABLE:4,async getAddonByID(id){return map.get(id)||null;},async getAddonsByTypes(){return [...map.values()];}};
globalThis.__nativeAddonManager=native;
globalThis.Ci={nsIBlocklistService:{STATE_NOT_BLOCKED:0}};
const adapter=await import('data:text/javascript;base64,'+Buffer.from(source.replace(/import \{AddonManager\} from '[^']+';/,"const AddonManager=globalThis.__nativeAddonManager;")).toString('base64'));
const fixture=(extra={})=>({id:'test@fixture.invalid',name:'Fixture',version:'1',type:'extension',isWebExtension:true,isSystem:false,isBuiltin:false,isPrivileged:false,hidden:false,appDisabled:false,isCompatible:true,pendingOperations:0,operationsRequiringRestart:0,blocklistState:0,userDisabled:false,isActive:true,permissions:6,userPermissions:{permissions:['storage']},async enable(options){calls.push(['enable',options]);this.userDisabled=false;},async disable(options){calls.push(['disable',options]);this.userDisabled=true;},...extra});
test('adapter rejects policy/system/privileged/hidden/blocklisted/incompatible/pending/restart states',()=>{
 for(const bad of [{type:'theme'},{isWebExtension:false},{isSystem:true},{isBuiltin:true},{isPrivileged:true},{hidden:true},{appDisabled:true},{isCompatible:false},{pendingOperations:1},{operationsRequiringRestart:1},{blocklistState:1}])assert.equal(adapter.describeAddon(fixture(bad)).supported,false,JSON.stringify(bad));
});
test('adapter native permission flags are honored and expected-state races rejected',async()=>{
 calls.length=0;const a=fixture({permissions:0});map.set(a.id,a);
 await assert.rejects(adapter.Addons.change(a.id,true,false),/not-permitted/);assert.equal(calls.length,0);
 a.permissions=6;await assert.rejects(adapter.Addons.change(a.id,true,true),/manual-state-race/);assert.equal(calls.length,0);
 await adapter.Addons.change(a.id,true,false);await adapter.Addons.change(a.id,false,true);
 assert.deepEqual(calls,[['disable',{allowSystemAddons:false}],['enable',{allowSystemAddons:false}]]);
});
test('adapter only requests names/flags/API permission metadata and has no runtime install/storage operations',async()=>{
 const a=fixture();Object.defineProperty(a,'storage',{get(){throw new Error('must not read private storage');}});map.set(a.id,a);
 assert.equal((await adapter.Addons.get(a.id)).name,'Fixture');assert.equal((await adapter.Addons.list()).length,1);
 assert.doesNotMatch(source,/installTemporaryAddon|\.uninstall\(|storage\.local|storage\.sync|cookies\./);
});
