// MIT. Profile-global queue; each browser window owns only its UI/client handle.
import {Controller} from './controller.mjs';
import {Addons,AddonManager} from './addons.sys.mjs';
import {PrivateBrowsingUtils} from 'resource://gre/modules/PrivateBrowsingUtils.sys.mjs';
import {setTimeout,clearTimeout} from 'resource://gre/modules/Timer.sys.mjs';
import {mountUI} from './ui.mjs';

const PREF='zen-space-extension-manager.';
export class Runtime{
 constructor({statePath=PathUtils.join(PathUtils.profileDir,'zen-space-extension-manager.json')}={}){
  this.statePath=statePath;this.clients=new Map();this.attaching=new Map();this.pending=new Map();this.subscribers=new Set();this.disposed=false;this.disposing=null;this.timer=null;this.attached=false;this.closing=false;
  const store={
   read:async()=>await IOUtils.exists(this.statePath)?await IOUtils.readJSON(this.statePath):null,
   write:async state=>{await IOUtils.writeJSON(this.statePath,state,{tmpPath:this.statePath+'.tmp'});await IOUtils.setPermissions(this.statePath,0o600);},
  };
  this.core=new Controller({store,addons:Addons,context:()=>this.context(),onChange:()=>this.notify()});
  this.ready=this.core.initialize().then(()=>this.installListeners());
 }
 context(){
  const windows=Array.from(Services.wm.getEnumerator('navigator:browser')).filter(w=>!w.closed && w.location?.href==='chrome://browser/content/browser.xhtml');
  const normals=windows.filter(w=>!PrivateBrowsingUtils.isWindowPrivate(w));
  const first=normals[0],ready=!!first?.gBrowser && first.gZenWorkspaces?.workspaceEnabled && !first.gZenWorkspaces.isChangingWorkspace;
  let spaces=[];try{spaces=first?.gZenWorkspaces?.getWorkspaces?.() || [];}catch{}
  let externalSuspend=true;try{externalSuspend=Services.prefs.getBoolPref(PREF+'suspend',false);}catch{}
  return {count:normals.length,privateCount:windows.length-normals.length,ready,pending:this.pending.size>0,
   spaceId:first?.gZenWorkspaces?.activeWorkspace || '',spaces:spaces.map(s=>({uuid:s.uuid,name:s.name})),externalSuspend};
 }
 notify(){for(const fn of this.subscribers){try{fn();}catch{}}}
 subscribe(fn){this.subscribers.add(fn);return()=>this.subscribers.delete(fn);}
 schedule(){
  if(this.closing || this.disposed)return;
  this.core.epoch++;if(this.timer)clearTimeout(this.timer);
  this.timer=setTimeout(()=>{this.timer=null;this.core.request('browser-context');},75);
 }
 installListeners(){
  if(this.attached || this.disposed)return;this.attached=true;
  this.addonListener={
   onEnabled:a=>{this.core.observeAddon(a.id,false);this.notify();},
   onDisabled:a=>{this.core.observeAddon(a.id,true);this.notify();},
   onUninstalled:a=>{this.core.removed(a.id);this.notify();},
   onInstalled:()=>{this.schedule();this.notify();},
   onPropertyChanged:(a,props)=>{if(props.some(p=>['appDisabled','permissions','blocklistState'].includes(p)))this.schedule();this.notify();},
  };
  AddonManager.addAddonListener(this.addonListener);
  this.prefObserver={observe:()=>this.schedule()};Services.prefs.addObserver(PREF,this.prefObserver);
  this.windowObserver={observe:(subject,topic)=>{
   if(topic==='domwindowclosed'){this.pending.get(subject)?.();this.schedule();return;}
   if(topic!=='domwindowopened')return;
   const loaded=()=>{subject.removeEventListener('load',loaded);subject.removeEventListener('unload',loaded);this.pending.delete(subject);this.schedule();};
   this.pending.set(subject,loaded);subject.addEventListener('load',loaded,{once:true});subject.addEventListener('unload',loaded,{once:true});this.schedule();
  }};
  Services.ww.registerNotification(this.windowObserver);
  this.shutdownBlocker=()=>{this.appShuttingDown=true;return this.destroy('browser-shutdown');};
  AddonManager.beforeShutdown.addBlocker('Zen Space Extension Manager: restore original states',this.shutdownBlocker);
  this.schedule();
 }
 attach(win){
  if(this.clients.has(win))return Promise.resolve(this.clients.get(win).detach);
  if(this.attaching.has(win))return this.attaching.get(win);
  const pending=this._attach(win).finally(()=>this.attaching.delete(win));this.attaching.set(win,pending);return pending;
 }
 async _attach(win){
  await this.ready;
  if(this.disposed)throw new Error('runtime-disposed');
  // Private windows do not initialize a usable Space model. They must still
  // be tracked/cleaned up immediately for the profile-global window guard.
  if(!PrivateBrowsingUtils.isWindowPrivate(win) && win.gZenWorkspaces?.workspaceEnabled)await win.gZenWorkspaces.promiseInitialized;
  if(win.closed)return async()=>{};
  const onSpace=()=>{this.schedule();}; // MUST return immediately; Zen awaits listeners.
  win.gZenWorkspaces?.addChangeListeners?.(onSpace);
  const onActivate=()=>this.schedule();win.addEventListener('activate',onActivate);
  const onUI=()=>{this.schedule();this.notify();};win.addEventListener('ZenWorkspacesUIUpdate',onUI);win.addEventListener('ZenWorkspaceDataChanged',onUI);
  const ui=mountUI(win,this);
  let detached=false;
  const detach=async()=>{
   if(detached)return;detached=true;
   win.gZenWorkspaces?.removeChangeListeners?.(onSpace);win.removeEventListener('activate',onActivate);win.removeEventListener('ZenWorkspacesUIUpdate',onUI);win.removeEventListener('ZenWorkspaceDataChanged',onUI);
   win.removeEventListener('unload',onUnload);ui.destroy();this.clients.delete(win);
   if(!this.clients.size)await this.destroy('sine-unload');else this.schedule();
  };
  const onUnload=()=>{void detach();};win.addEventListener('unload',onUnload,{once:true});
  this.clients.set(win,{detach,ui});this.schedule();return detach;
 }
 async snapshot(){return {state:structuredClone(this.core.state),phase:this.core.phase,readOnly:this.core.readOnly,context:this.context(),addons:await Addons.list()};}
 configure(config){return this.core.configure(config);}
 resetRule(id){return this.core.resetRule(id);}
 recover(){return this.core.recover();}
 destroy(reason='sine-unload'){
  if(this.disposing)return this.disposing;
  this.closing=true;if(this.timer)clearTimeout(this.timer);this.timer=null;this.core.epoch++;
  this.disposing=(async()=>{
   await this.ready;
   await this.core.restore(reason,{preserveEnabled:true});await this.core.idle();
   if(this.clients.size && !this.appShuttingDown){this.closing=false;this.disposing=null;this.schedule();return;}
   if(this.attached){
    AddonManager.removeAddonListener(this.addonListener);Services.prefs.removeObserver(PREF,this.prefObserver);Services.ww.unregisterNotification(this.windowObserver);
    AddonManager.beforeShutdown.removeBlocker(this.shutdownBlocker);this.attached=false;
   }
   for(const [w,fn] of this.pending){try{w.removeEventListener('load',fn);w.removeEventListener('unload',fn);}catch{}}this.pending.clear();
   this.disposed=true;this.subscribers.clear();
  })();return this.disposing;
 }
}
let singleton=null;
export async function attachWindow(win){
 if(!singleton || singleton.disposed)singleton=new Runtime();
 const detach=await singleton.attach(win);return {detach,runtime:singleton};
}
