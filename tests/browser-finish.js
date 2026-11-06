const done=arguments[arguments.length-1];
(async()=>{
 const {M,r,ids,original,passed,check,settle}=window.__spaceExtensionTest;const previous=passed.length;
 await M.AddonManager.getAddonByID(ids[0]).then(a=>a.enable());await settle();
 check(r.core.state.conflicts[ids[0]]==='manual-change','native manual enable is detected and not fought');
 await r.resetRule(ids[0]);check(!(await M.Addons.get(ids[0])).userDisabled,'reset releases manual state unchanged');
 await r.configure({...r.core.state.config,enabled:true,rules:{[ids[0]]:{kind:'deny',spaces:[gZenWorkspaces.activeWorkspace],sensitiveAcknowledged:false}}});await settle();
 check((await M.Addons.get(ids[0])).userDisabled,'explicit new rule takes ownership only after reset');
 const stat=await IOUtils.stat(r.statePath);check((stat.permissions & 0o777)===0o600,'own durable configuration journal has owner-only file permissions');
 const current=await M.Addons.list();check(original.every(([id,disabled])=>current.find(a=>a.id===id)?.userDisabled===disabled),'unmanaged native extension states are unchanged');
 done({passed:passed.slice(previous)});
})().catch(e=>done({error:String(e),stack:e.stack}));
