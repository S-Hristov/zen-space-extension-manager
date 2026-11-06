// MIT. Browser-chrome UI only. No innerHTML, web messaging or page DOM access.
import {sensitiveExtension} from './policy.mjs';
export function mountUI(win,runtime){
 const doc=win.document,tools=doc.getElementById('menu_ToolsPopup');
 let dialog=null,style=null,disposed=false,unsubscribe=null,sequence=0,refreshQueued=false;
 const menu=doc.createXULElement('menuitem');menu.id='zen-space-extension-manager-menu';menu.setAttribute('label','Space Extension Manager (Convenience Mode)…');tools?.append(menu);
 const make=(tag,attrs={},text='')=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);node.textContent=text;return node;};
 const close=()=>{sequence++;unsubscribe?.();unsubscribe=null;dialog?.close();dialog?.remove();style?.remove();dialog=null;style=null;};
 const open=async()=>{
  close();const generation=sequence;
  style=make('style',{},'#zen-space-extension-manager{color-scheme:light dark;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:12px;width:min(1180px,92vw);max-height:88vh;overflow:auto;padding:22px;font:13px system-ui}#zen-space-extension-manager h2{margin-top:0}#zen-space-extension-manager .warning{padding:12px;border:2px solid #b77729;border-radius:8px}#zen-space-extension-manager label{display:flex;align-items:center;gap:7px;margin:8px 0}#zen-space-extension-manager table{border-collapse:collapse;width:100%;margin:14px 0}#zen-space-extension-manager td,#zen-space-extension-manager th{padding:9px;border-bottom:1px solid GrayText;vertical-align:top;text-align:left}#zen-space-extension-manager .id{display:block;font:11px monospace;overflow-wrap:anywhere;max-width:230px}#zen-space-extension-manager .sensitive{font-size:12px;color:light-dark(#954e00,#ffd193)}#zen-space-extension-manager .actions{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0}#zen-space-extension-manager button{padding:7px 12px}#zen-space-extension-manager select{max-width:155px}#zen-space-extension-manager .space-title{max-width:135px;overflow-wrap:anywhere}');
  dialog=make('dialog',{id:'zen-space-extension-manager','aria-label':'Space Extension Manager — Convenience Mode'});
  dialog.append(make('h2',{},'Space Extension Manager — Convenience Mode'));
  dialog.append(make('p',{class:'warning',role:'note'},'NOT SECURITY ISOLATION. Extension enablement is profile-global. An enabled extension may access permitted tabs in every Space, including hidden Spaces. Separate profiles remain necessary for a genuine company/personal security boundary.'));
  dialog.append(make('p',{},'No passwords, vaults or extension storage are read. Native disable/enable restarts extension contexts; previous page modifications/data cannot be undone and password managers may require unlocking again.'));
  const status=make('p',{role:'status','aria-live':'polite'},'Reading installed extension metadata…');dialog.append(status);
  const content=make('div'),details=make('div');dialog.append(content,details);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});doc.documentElement.append(style,dialog);dialog.showModal();
  let draftRows=[],enabled=null,suspended=null,ack=null,multi=null;
  const updateStatus=async()=>{
   if(!dialog || disposed || generation!==sequence)return;
   const snap=await runtime.snapshot();if(!dialog || generation!==sequence)return;
   status.textContent=`${snap.phase}. ${snap.context.count} normal window(s), ${snap.context.privateCount} private window(s). Active Space: ${snap.context.spaces.find(s=>s.uuid===snap.context.spaceId)?.name || 'not ready'}. Multi-window policy: ${snap.state.config.multiWindowPolicy==='disable'?'disable managed extensions globally; resume current Space rules with one ready window':'pause and preserve availability'}. This is asynchronous convenience behavior, not isolation.${snap.context.externalSuspend?' Emergency suspension is ON in Sine settings.':''}${snap.state.fault?' Failsafe: '+snap.state.fault+'.':''}${snap.readOnly?' Storage unreadable: automation is blocked; repair the local journal before proceeding.':''}`;
   for(const row of draftRows){const a=snap.addons.find(x=>x.id===row.id);row.current.textContent=a?`${a.userDisabled?'Disabled':'Enabled'}${a.isActive?' · active':''}${!a.supported?' · unsupported/policy-blocked':''}`:'Not installed';}
   details.replaceChildren(make('h3',{},'Detected conflicts / recovery'));
   const conflicts=Object.entries(snap.state.conflicts);
   details.append(make('p',{},conflicts.length?conflicts.map(([id,reason])=>`${id}: ${reason}`).join(' · '):'No conflicts detected.'));
   details.append(make('p',{},'A manual extension change wins: the manager pauses that rule rather than fighting it. Reset the rule to release ownership. The optional multi-window privacy guard globally disables only configured extensions, including enabled-everywhere rules. Protection may pause in every window. It resumes the remaining window’s current Space rules, not a stale enabled flag. Manual/policy conflicts still win; native failures freeze until explicit review.'));
   details.append(make('h3',{},'Recent state changes'));
   const history=make('ul');for(const entry of snap.state.history.slice(-20).reverse())history.append(make('li',{},`${new Date(entry.at).toLocaleTimeString()} · ${entry.action}${entry.id?' · '+entry.id:''}${entry.code?' · '+entry.code:''}`));details.append(history);
  };
  try{
   const snap=await runtime.snapshot();if(!dialog || generation!==sequence)return;
   const checkbox=(label,value)=>{const input=make('input',{type:'checkbox'});input.checked=value;const row=make('label');row.append(input,make('span',{},label));content.append(row);return input;};
   enabled=checkbox('Enable automatic Convenience Mode (only explicitly configured rules)',snap.state.config.enabled);
   suspended=checkbox('Temporarily suspend and restore original states globally',snap.state.config.suspended);
   multi=checkbox('Multi-window privacy guard: disable configured extensions globally with extra normal/private/Little Zen browser windows (may pause protection)',snap.state.config.multiWindowPolicy==='disable');multi.setAttribute('data-setting','multiWindowPolicy');
   ack=checkbox('I understand this is global convenience switching, NOT per-Space security isolation',snap.state.config.acknowledgedGlobalScope);
   content.append(make('p',{},'Unmanaged is the default for every extension. Rule resets / automation off restore original states globally unless a manual change or browser policy prevents safe restoration. Changes never install/remove extensions or reload tabs.'));
   const table=make('table'),head=make('tr');
   for(const text of ['Extension / ID','Current global state','Convenience rule',...snap.context.spaces.map(s=>s.name),'Sensitive handling / Reset'])head.append(make('th',{scope:'col',class:'space-title'},text));
   const thead=make('thead');thead.append(head);table.append(thead);const tbody=make('tbody');
   for(const a of snap.addons){
    const rule=snap.state.config.rules[a.id],tr=make('tr'),name=make('td'),current=make('td');
    name.append(make('strong',{},a.name),make('span',{class:'id'},a.id),make('span',{},'Permission mode: Convenience / profile-global'));
    if(a.apiPermissions.length)name.append(make('p',{},'API permissions: '+a.apiPermissions.join(', ')));
    const select=make('select',{'aria-label':`Rule for ${a.name}`});
    for(const [value,label] of [['unmanaged','Unmanaged'],['all','Enabled in all Spaces'],['allow','Allow selected Spaces'],['deny','Disable in selected Spaces']])select.append(make('option',{value},label));
    select.value=rule?.kind || 'unmanaged';select.disabled=!a.supported || snap.readOnly;
    const policy=make('td');policy.append(select);tr.append(name,current,policy);
    const spaces=new Set(rule?.spaces || []),checks=[];
    for(const space of snap.context.spaces){
     const td=make('td'),input=make('input',{type:'checkbox','aria-label':`${a.name} — ${space.name}`,title:space.uuid});input.checked=spaces.has(space.uuid);input.disabled=!a.supported || snap.readOnly;td.append(input);tr.append(td);checks.push({id:space.uuid,input});
    }
    const end=make('td'),risk=sensitiveExtension(a),sensitive=make('input',{type:'checkbox','aria-label':`Allow sensitive lifecycle switching for ${a.name}`});sensitive.checked=!!rule?.sensitiveAcknowledged;sensitive.disabled=snap.readOnly;
    if(risk){const label=make('label',{class:'sensitive'});label.append(sensitive,make('span',{},'Security/password-manager: I explicitly allow global lifecycle switching; protection may pause / unlocking may be required.'));end.append(label);}
    const missing=[...spaces].filter(id=>!snap.context.spaces.some(s=>s.uuid===id));
    if(missing.length)end.append(make('p',{class:'sensitive'},`${missing.length} missing Space ID(s); this rule is blocked. Reset it or recreate its mapping.`));
    const reset=make('button',{type:'button'},'Reset rule');reset.disabled=snap.readOnly;
    reset.addEventListener('click',async()=>{await runtime.resetRule(a.id);select.value='unmanaged';for(const c of checks)c.input.checked=false;sensitive.checked=false;missing.length=0;await updateStatus();});end.append(reset);tr.append(end);tbody.append(tr);
    draftRows.push({id:a.id,current,select,checks,sensitive,risk,missing});
   }
   table.append(tbody);content.append(table);
   const actions=make('div',{class:'actions'}),save=make('button',{type:'button'},'Save & apply globally'),recover=make('button',{type:'button'},'Restore originals / retry recovery'),refresh=make('button',{type:'button'},'Refresh list (discard unsaved edits)'),exit=make('button',{type:'button'},'Close');
   save.disabled=snap.readOnly;recover.disabled=snap.readOnly;
   save.addEventListener('click',async()=>{
    const rules={};
    for(const row of draftRows){
     if(row.select.value==='unmanaged')continue;
     if(row.risk && !row.sensitive.checked){status.textContent='A security-sensitive rule requires its explicit acknowledgement. Nothing saved.';return;}
     rules[row.id]={kind:row.select.value,spaces:[...row.checks.filter(c=>c.input.checked).map(c=>c.id),...row.missing],sensitiveAcknowledged:row.sensitive.checked};
    }
    try{await runtime.configure({enabled:enabled.checked,suspended:suspended.checked,acknowledgedGlobalScope:ack.checked,mode:'convenience',multiWindowPolicy:multi.checked?'disable':'pause',defaultPolicy:'unmanaged',rules});await updateStatus();}
    catch{status.textContent='Configuration rejected. Confirm Convenience Mode acknowledgement and valid rules; nothing was silently broadened.';}
   });
   recover.addEventListener('click',async()=>{await runtime.recover();enabled.checked=false;await updateStatus();});
   refresh.addEventListener('click',()=>void open());exit.addEventListener('click',close);actions.append(save,recover,refresh,exit);content.append(actions);
   unsubscribe=runtime.subscribe(()=>{if(refreshQueued)return;refreshQueued=true;win.queueMicrotask(()=>{refreshQueued=false;void updateStatus().catch(()=>{});});});
   await updateStatus();
  }catch{status.textContent='Could not read extension metadata. No extension changes requested.';}
 };
 const show=()=>void open();menu.addEventListener('command',show);
 return {open,close,destroy(){if(disposed)return;disposed=true;close();menu.removeEventListener('command',show);menu.remove();}};
}
