// ==UserScript==
// @name Zen Per-Space Extension Manager (Convenience Mode)
// @version 0.1.1
// @include chrome://browser/content/browser.xhtml
// ==/UserScript==
// MIT. No security isolation, installation or credential interception.
(() => {
 const win=window;
 if(win.location.href!=='chrome://browser/content/browser.xhtml' || typeof win.addUnloadListener!=='function')return;
 if(win.ZenSpaceExtensionManager)return;
 let detached=false,handle=null;
 const controller={async destroy(){if(detached)return;detached=true;if(handle)await handle.detach();if(win.ZenSpaceExtensionManager===controller)delete win.ZenSpaceExtensionManager;}};
 win.ZenSpaceExtensionManager=controller;
 win.addUnloadListener(()=>controller.destroy());
 const base=Services.io.newURI(Components.stack.filename.split('?')[0]);
 const uri=Services.io.newURI('src/runtime.sys.mjs',null,base).spec;
 (async()=>{
  const {attachWindow}=ChromeUtils.importESModule(uri);handle=await attachWindow(win);
  if(detached)await handle.detach();
 })().catch(()=>{void controller.destroy();win.console.warn('[Zen Space Extension Manager] Initialization failed. No isolation is provided.');});
})();
