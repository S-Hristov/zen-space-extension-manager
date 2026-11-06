// MIT. One serialized lifecycle queue per profile; native operations injected.
import {blankState,validateState,validateConfig,desiredDisabled,sensitiveExtension} from './policy.mjs';
export class Controller{
 constructor({store,addons,context,onChange=()=>{},now=()=>Date.now()}){
  Object.assign(this,{store,addons,context,onChange,now});this.state=blankState();this.phase='starting';this.readOnly=false;this.epoch=0;this.tail=Promise.resolve();this.queued=false;this.initialized=false;
 }
 _emit(){this.onChange();}
 _log(action,id='',code=''){this.state.history.push({at:this.now(),action,id,code});this.state.history=this.state.history.slice(-100);this._emit();}
 async _save(){if(this.readOnly)throw new Error('storage-unreadable');await this.store.write(structuredClone(this.state));}
 _enqueue(task){const p=this.tail.then(task).catch(error=>this._fatal(error));this.tail=p;return p;}
 async idle(){let p;do{p=this.tail;await p;}while(p!==this.tail);}
 async initialize(){
  try{const raw=await this.store.read();if(raw)this.state=validateState(raw);}
  catch{this.readOnly=true;this.phase='storage-unreadable';this.state.fault='storage-unreadable';this.initialized=true;this._emit();return;}
  if(Object.keys(this.state.journal).length){
   // Any surviving journal is conservatively treated as interrupted shutdown.
   if(this.state.config.multiWindowPolicy==='disable'){
    // A surviving privacy-guard journal must not auto-enable anything before
    // all browser windows/Spaces are classified. Require explicit review.
    this.state.config.enabled=false;this.state.fault='multi-window-recovery-required';this.phase='faulted';this._log('guard-startup-recovery-required');
    try{await this._save();}catch{this.readOnly=true;}this.initialized=true;this._emit();return;
   }
   this.state.config.enabled=false;this.state.fault=null;for(const id of Object.keys(this.state.conflicts))if(this.state.conflicts[id]==='restore-blocked')delete this.state.conflicts[id];this.phase='startup-recovery';this._log('startup-recovery');
   try{await this._save();await this._restore(false);await this._save();}catch(error){await this._fatal(error);}
  }
  this.initialized=true;this.phase=this.state.fault?'faulted':'ready';this._emit();
 }
 request(reason='context'){
  this.epoch++;this.reason=reason;
  if(!this.queued){this.queued=true;this._enqueue(async()=>{this.queued=false;await this._reconcile(this.epoch);});}
  return this.tail;
 }
 configure(config){
  const checked=validateConfig(config);this.epoch++;
  return this._enqueue(async()=>{
   if(this.readOnly)throw new Error('storage-unreadable');
   const previous=this.state.config;this.state.config=checked;this.state.fault=null;
   for(const id of Object.keys(this.state.conflicts))if(!['manual-change','removed','restore-blocked'].includes(this.state.conflicts[id]))delete this.state.conflicts[id];
   this._log('configuration-saved');await this._save();
   for(const id of Object.keys(previous.rules))if(!Object.hasOwn(checked.rules,id))await this._release(id);
   await this._reconcile(this.epoch);
  });
 }
 observeAddon(id,disabled){
  const e=this.state.journal[id];if(!e)return;
  if(e.pending ? e.pending.to===disabled : e.expectedDisabled===disabled)return;
  this.state.conflicts[id]='manual-change';this._log('manual-override',id);this.request('manual-change');
 }
 removed(id){
  if(Object.hasOwn(this.state.config.rules,id) || Object.hasOwn(this.state.journal,id)){
   this.state.conflicts[id]='removed';delete this.state.journal[id];this._log('extension-removed',id);this.request('extension-removed');
  }
 }
 async _transition(id,disabled,epoch,restoring=false){
  let a=await this.addons.get(id),e=this.state.journal[id];
  if(!a){this.state.conflicts[id]='removed';return;}
  if(a.userDisabled===disabled)return;
  if(!a.supported || (disabled ? !a.canDisable : !a.canEnable))throw new Error('lifecycle-operation-not-permitted');
  if(!e){e={baselineDisabled:a.userDisabled,expectedDisabled:a.userDisabled,owned:false,pending:null};this.state.journal[id]=e;}
  if(a.userDisabled!==e.expectedDisabled && !e.pending){this.state.conflicts[id]='manual-change';return;}
  const previous=a.userDisabled;
  e.pending={from:previous,to:disabled};e.owned=true;
  await this._save(); // Durable original/pending state BEFORE native mutation.
  if(epoch!==null && epoch!==this.epoch){e.pending=null;e.owned=e.expectedDisabled!==e.baselineDisabled;await this._save();return;}
  await this.addons.change(id,disabled,previous);
  a=await this.addons.get(id);
  if(!a || a.userDisabled!==disabled){this.state.conflicts[id]='manual-change';throw new Error('state-changed-during-operation');}
  e.expectedDisabled=disabled;e.pending=null;e.owned=disabled!==e.baselineDisabled;
  this._log(restoring?'original-state-restored':disabled?'extension-disabled':'extension-enabled',id);
  await this._save();
 }
 async _restore(liftOnly=false,epoch=null,ids=Object.keys(this.state.journal)){
  for(const id of ids){
   if(epoch!==null && epoch!==this.epoch)return;
   const e=this.state.journal[id];if(!e)continue;
   const a=await this.addons.get(id);
   if(!a){this.state.conflicts[id]='removed';delete this.state.journal[id];continue;}
   if(a.userDisabled===e.baselineDisabled){delete this.state.journal[id];continue;}
   // On multiple windows: undo OWNED disables, but NEVER newly disable an
   // extension that another window might be using. Owned enables stay held.
   if(liftOnly && e.baselineDisabled)continue;
   if(['manual-change','removed','restore-blocked'].includes(this.state.conflicts[id]))continue;
   if(a.userDisabled!==e.expectedDisabled && a.userDisabled!==e.pending?.to){this.state.conflicts[id]='manual-change';continue;}
   try{await this._transition(id,e.baselineDisabled,epoch,true);if((await this.addons.get(id))?.userDisabled===e.baselineDisabled)delete this.state.journal[id];}
   catch{
    // Some native lifecycle failures occur after the durable enabled flag has
    // changed (e.g. extension context startup during browser shutdown).
    const final=await this.addons.get(id).catch(()=>null);
    if(final && final.userDisabled===e.baselineDisabled){delete this.state.journal[id];this._log('original-flag-restored',id);continue;}
    this.state.config.enabled=false;this.state.fault='restoration-incomplete';this.state.conflicts[id]='restore-blocked';this._log('restoration-blocked',id);}
  }
 }
 async _disableForMultipleWindows(epoch){
  this.disablingMultiple=true;
  for(const [id,rule] of Object.entries(this.state.config.rules)){
   if(epoch!==this.epoch)break;
   if(Object.hasOwn(this.state.conflicts,id))continue;
   const a=await this.addons.get(id);if(epoch!==this.epoch)break;
   if(!a){this.state.conflicts[id]='not-installed';continue;}
   if(!a.supported){this.state.conflicts[id]='unsupported-or-policy-blocked';continue;}
   if(sensitiveExtension(a) && !rule.sensitiveAcknowledged){this.state.conflicts[id]='sensitive-acknowledgement-required';continue;}
   if(!this.state.journal[id])this.state.journal[id]={baselineDisabled:a.userDisabled,expectedDisabled:a.userDisabled,owned:false,pending:null};
   await this._save();if(epoch!==this.epoch)break;
   await this._transition(id,true,epoch);
  }
  await this._save();this.disablingMultiple=false;
  this.phase=Object.keys(this.state.conflicts).length?'multi-window-guard-conflicts':'multi-window-guard-disabled';this._emit();
 }
 async _reconcile(epoch){
  if(!this.initialized || this.readOnly)return;
  const c=this.state.config,ctx=this.context();
  if(['privacy-guard-error-review-required','multi-window-recovery-required'].includes(this.state.fault)){this.phase='faulted-review-required';this._emit();return;}
  if(!c.enabled || c.suspended || ctx.externalSuspend){
   this.phase=c.suspended || ctx.externalSuspend?'suspended':'disabled';await this._restore(false,epoch);
   if(Object.keys(this.state.journal).length || this.state.history.length)await this._save();this._emit();return;
  }
  if(ctx.pending){this.phase='waiting-for-window';this._emit();return;}
  if(c.multiWindowPolicy==='disable' && (ctx.count>1 || ctx.privateCount>0)){await this._disableForMultipleWindows(epoch);return;}
  if(c.multiWindowPolicy==='disable' && (ctx.count!==1 || !ctx.ready || !ctx.spaceId || !ctx.spaces.some(s=>s.uuid===ctx.spaceId))){this.phase='waiting-for-known-single-window';this._emit();return;}
  if(ctx.count!==1 || ctx.privateCount || !ctx.ready || !ctx.spaceId || !ctx.spaces.some(s=>s.uuid===ctx.spaceId)){
   this.phase='paused-multiple-or-unready-windows';await this._restore(true,epoch);await this._save();this._emit();return;
  }
  this.phase='applying';this._emit();
  const known=ctx.spaces.map(s=>s.uuid);
  // Removed/unmanaged rules restore only still-owned state. Manual overrides
  // are preserved and released when the user explicitly resets that rule.
  for(const id of Object.keys(this.state.journal))if(!Object.hasOwn(c.rules,id))await this._release(id,epoch);
  for(const [id,rule] of Object.entries(c.rules)){
   if(epoch!==this.epoch || !c.enabled)break;
   if(Object.hasOwn(this.state.conflicts,id))continue;
   const a=await this.addons.get(id);if(epoch!==this.epoch)break;
   if(!a){this.state.conflicts[id]='not-installed';continue;}
   const target=desiredDisabled(rule,ctx.spaceId,known);
   const blocked=!a.supported?'unsupported-or-policy-blocked':sensitiveExtension(a) && !rule.sensitiveAcknowledged?'sensitive-acknowledgement-required':target.blocked;
   if(blocked){
    this.state.conflicts[id]=blocked;
    // A policy that becomes invalid must not strand an owned disable.
    if(this.state.journal[id]){c.enabled=false;if(c.multiWindowPolicy==='disable')this.state.fault='privacy-guard-error-review-required';else{this.state.fault='policy-changed';await this._restore(false,epoch);}break;}
    continue;
   }
   if(!this.state.journal[id])this.state.journal[id]={baselineDisabled:a.userDisabled,expectedDisabled:a.userDisabled,owned:false,pending:null};
   await this._save();
   if(epoch!==this.epoch)break;
   await this._transition(id,target.disabled,epoch);
  }
  this.phase=this.state.fault?'faulted':Object.keys(this.state.conflicts).length?'conflicts':'active';await this._save();this._emit();
 }
 async _release(id,epoch=null){
  if(this.state.conflicts[id]==='manual-change' || this.state.conflicts[id]==='removed'){
   delete this.state.journal[id];delete this.state.conflicts[id];this._log('manual-state-preserved',id);
  }else await this._restore(false,epoch,[id]);
 }
 resetRule(id){
  this.epoch++;return this._enqueue(async()=>{if(this.readOnly)return;delete this.state.config.rules[id];await this._release(id);if(!this.state.journal[id])delete this.state.conflicts[id];await this._save();await this._reconcile(this.epoch);});
 }
 recover(){
  this.epoch++;return this._enqueue(async()=>{
   if(this.readOnly)throw new Error('storage-unreadable');
   this.state.config.enabled=false;this.state.fault=null;
   for(const id of Object.keys(this.state.conflicts))if(this.state.conflicts[id]==='restore-blocked')delete this.state.conflicts[id];
   await this._save();await this._restore(false);await this._save();this.phase=this.state.fault?'faulted':'disabled';this._emit();
  });
 }
 async _fatal(error){
  if(this.readOnly){this.phase='storage-unreadable';this._emit();return;}
  const hold=this.disablingMultiple || this.state.config.multiWindowPolicy==='disable';this.disablingMultiple=false;
  this.epoch++;this.state.config.enabled=false;this.state.fault=hold?'privacy-guard-error-review-required':'automation-stopped-after-error';this.phase='faulted';this._log('failsafe-stopped');
  try{await this._save();}catch{this.readOnly=true;this.state.fault='storage-write-failed';}
  // Best-effort single restoration pass; no retry loop. Durable pending
  // entries remain available for recovery if native restoration is blocked.
  if(!hold){try{await this._restore(false);}catch{}}
  try{await this._save();}catch{this.readOnly=true;}
  this._emit();
 }
 restore(reason='restore-originals',{preserveEnabled=false}={}){
  this.epoch++;
  return this._enqueue(async()=>{if(this.readOnly)return;if(preserveEnabled && ['privacy-guard-error-review-required','multi-window-recovery-required'].includes(this.state.fault)){this._log('guard-held-on-unload');await this._save();return;}if(!preserveEnabled)this.state.config.enabled=false;this._log(reason);await this._save();await this._restore(false);await this._save();this.phase=this.state.fault?'faulted':'disabled';this._emit();});
 }
}
