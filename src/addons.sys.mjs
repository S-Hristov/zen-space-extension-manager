// MIT. Privileged supported lifecycle adapter; never touches add-on storage/code.
import {AddonManager} from 'resource://gre/modules/AddonManager.sys.mjs';
export function describeAddon(a){
 const supported=a.type==='extension' && a.isWebExtension===true && !a.isSystem && !a.isBuiltin && !a.isPrivileged && !a.hidden && !a.appDisabled && a.isCompatible!==false && a.pendingOperations===AddonManager.PENDING_NONE && a.operationsRequiringRestart===AddonManager.OP_NEEDS_RESTART_NONE && a.blocklistState===Ci.nsIBlocklistService.STATE_NOT_BLOCKED && typeof a.userDisabled==='boolean';
 return {id:a.id,name:a.name,version:a.version,type:a.type,isActive:a.isActive,userDisabled:Boolean(a.userDisabled),supported,
  canEnable:supported && Boolean(a.permissions & AddonManager.PERM_CAN_ENABLE),
  canDisable:supported && Boolean(a.permissions & AddonManager.PERM_CAN_DISABLE),
  apiPermissions:Array.isArray(a.userPermissions?.permissions)?a.userPermissions.permissions.slice():[]};
}
export const Addons={
 async list(){return (await AddonManager.getAddonsByTypes(['extension'])).map(describeAddon);},
 async get(id){const a=await AddonManager.getAddonByID(id);return a?describeAddon(a):null;},
 async change(id,disabled,expected){
  const a=await AddonManager.getAddonByID(id);if(!a)throw new Error('not-installed');
  const info=describeAddon(a);
  if(info.userDisabled!==expected)throw new Error('manual-state-race');
  if(!info.supported || (disabled?!info.canDisable:!info.canEnable))throw new Error('lifecycle-operation-not-permitted');
  if(disabled)await a.disable({allowSystemAddons:false});else await a.enable({allowSystemAddons:false});
 },
};
export {AddonManager};
