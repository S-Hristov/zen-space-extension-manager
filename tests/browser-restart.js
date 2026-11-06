const done=arguments[arguments.length-1];
(async()=>{
 const passed=[],check=(ok,name)=>{if(!ok)throw new Error(name);passed.push(name);};
 await gZenWorkspaces.promiseInitialized;
 const {FileUtils}=ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');Components.manager.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(new FileUtils.File(arguments[0]));
 const M=ChromeUtils.importESModule(`resource://space-extension-test/manager-${arguments[3]}.sys.mjs`);
 // Temporary test fixtures are reinstalled ONLY by harness, never by manager.
 await M.AddonManager.installTemporaryAddon(new FileUtils.File(arguments[1]+'/lifecycle'));
 const r=new M.Runtime({statePath:PathUtils.join(PathUtils.profileDir,'zen-space-extension-manager-test.json')});await r.ready;
 check(!!r.core.state.config.rules['lifecycle@space-test.invalid'],'configuration and stable Space mappings survive actual browser restart');
 check(Object.keys(r.core.state.journal).length===0,'clean shutdown left no interrupted native mutation journal');
 await r.attach(window);await r.configure({...r.core.state.config,enabled:true});await new Promise(resolve=>setTimeout(resolve,250));await r.core.idle();
 check(['active','conflicts'].includes(r.core.phase),'saved explicit automation can resume after clean startup');
 await r.configure({...r.core.state.config,enabled:false});check(!(await M.Addons.get('lifecycle@space-test.invalid')).userDisabled,'original fixture enabled state restored after restarted session');
 await r.clients.get(window).detach();check(r.disposed && !document.getElementById('zen-space-extension-manager-menu'),'Sine-style unload removes UI and lifecycle observers');
 const unload=[];window.addUnloadListener=cb=>unload.push(cb);
 Services.scriptloader.loadSubScriptWithOptions('resource://space-extension-test/bootstrap.uc.js',{target:window,ignoreCache:true});
 const until=Date.now()+5000;while(!document.getElementById('zen-space-extension-manager-menu') && Date.now()<until)await new Promise(resolve=>setTimeout(resolve,50));
 check(!!window.ZenSpaceExtensionManager && unload.length===1 && !!document.getElementById('zen-space-extension-manager-menu'),'generated Sine bootstrap resolves versioned module and mounts Tools UI');
 await unload[0]();delete window.addUnloadListener;
 check(!window.ZenSpaceExtensionManager && !document.getElementById('zen-space-extension-manager-menu'),'awaited Sine bootstrap unload cleans singleton/UI');
 done({passed});
})().catch(e=>done({error:String(e),stack:e.stack}));
