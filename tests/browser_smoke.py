#!/usr/bin/env python3
"""Native Zen tests. Empty disposable signed-out profile; only own synthetic add-ons.
No live profile, real password manager, or installed mod is opened or changed.
"""
import argparse,functools,http.server,json,os,socket,subprocess,tempfile,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Marionette:
 def __init__(self,port):
  self.sock=socket.create_connection(('127.0.0.1',port),timeout=2);self.sock.settimeout(90);self.seq=0;self.read()
 def read(self):
  size=b''
  while (x:=self.sock.recv(1))!=b':':
   if not x:raise EOFError('disconnected')
   size+=x
  data=b''
  while len(data)<int(size):data+=self.sock.recv(int(size)-len(data))
  return json.loads(data)
 def call(self,name,params=None):
  self.seq+=1;data=json.dumps([0,self.seq,name,params or {}]).encode();self.sock.sendall(str(len(data)).encode()+b':'+data);r=self.read()
  if r[2]:raise RuntimeError(r[2])
  return r[3]
 def js(self,source,args=None):
  r=self.call('WebDriver:ExecuteAsyncScript',{'script':source,'args':args or [],'newSandbox':False,'sandbox':'system','line':0,'filename':'space-extension-test'})
  r=r.get('value',r)
  if isinstance(r,dict) and 'error' in r:raise RuntimeError(json.dumps(r))
  return r
 def context(self,name):self.call('Marionette:SetContext',{'value':name})
class Handler(http.server.SimpleHTTPRequestHandler):
 events=[]
 def log_message(self,*args):pass
 def do_POST(self):
  self.events.append(json.loads(self.rfile.read(int(self.headers.get('content-length',0)))));self.send_response(200);self.send_header('Access-Control-Allow-Origin','*');self.end_headers()
 def do_GET(self):
  if self.path=='/events':
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(self.events).encode())
  else:super().do_GET()
def run(binary):
 with tempfile.TemporaryDirectory(prefix='zen-space-extensions-') as temp:
  tmp=Path(temp);profile=tmp/'profile';profile.mkdir();site=tmp/'site';site.mkdir();(site/'index.html').write_text('<!doctype html><title>Extension fixture</title><p id="original">Persistent page fixture</p>')
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=site));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
  fixtures=tmp/'fixtures';fixtures.mkdir()
  for key,name in [('lifecycle','Lifecycle fixture'),('toolbar','Toolbar fixture'),('developer','Developer fixture'),('sensitive','Company 1Password fixture (not real product)')]:
   p=fixtures/key;p.mkdir();manifest={'manifest_version':2,'name':name,'version':'1.0','browser_specific_settings':{'gecko':{'id':key+'@space-test.invalid'}}}
   if key in ['lifecycle','toolbar']:manifest['browser_action']={'default_title':name}
   if key=='developer':manifest['devtools_page']='devtools.html';(p/'devtools.html').write_text('<!doctype html><title>Synthetic devtools</title>')
   if key=='lifecycle':
    manifest.update(permissions=['storage','http://127.0.0.1/*'],background={'scripts':['background.js']},content_scripts=[{'matches':['http://127.0.0.1/*'],'js':['content.js']}])
    (p/'background.js').write_text('''const endpoint=ORIGIN+'/events';
const report=data=>fetch(endpoint,{method:'POST',body:JSON.stringify(data)});
(async()=>{const old=await browser.storage.local.get('starts');const starts=(old.starts||0)+1;await browser.storage.local.set({starts,sentinel:'fixture-preserved'});await report({kind:'background',starts});})();
browser.runtime.onMessage.addListener(async message=>{const data=await browser.storage.local.get(['starts','sentinel']);await report({kind:'content',url:message.url,...data});return data;});'''.replace('ORIGIN',json.dumps(origin)))
    (p/'content.js').write_text("document.documentElement.dataset.spaceExtensionFixture='injected';browser.runtime.sendMessage({url:location.href}).then(data=>{document.documentElement.dataset.fixtureStorage=data.sentinel;});")
   (p/'manifest.json').write_text(json.dumps(manifest))
  version=json.loads((ROOT/'package.json').read_text())['version'];manifest=tmp/'chrome.manifest';manifest.write_text('resource space-extension-test '+ROOT.as_uri()+'/\n')
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  prefs={'marionette.enabled':True,'marionette.log.level':'Trace','marionette.port':port,'browser.aboutwelcome.enabled':False,'browser.shell.checkDefaultBrowser':False,'zen.welcome-screen.seen':True,'zen.workspaces.skip-workspace-switch-animation':True,'datareporting.policy.dataSubmissionEnabled':False,'toolkit.telemetry.enabled':False,'browser.startup.page':0,'browser.sessionstore.resume_from_crash':False}
  (profile/'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)},{json.dumps(v)});' for k,v in prefs.items()))
  results={'passed':[],'realProductCompatibilityVerified':False,'liveProfileTouched':False}
  process=None
  def start():
   nonlocal process
   log=(tmp/'process.log').open('a');process=subprocess.Popen([binary,'--headless','--no-remote','--new-instance','--remote-allow-system-access','--profile',str(profile),'--marionette'],env={**os.environ,'MOZ_REMOTE_ALLOW_SYSTEM_ACCESS':'1','MOZ_MARIONETTE':'1','MOZ_DISABLE_UPDATE_PROCESSING':'1'},stdout=log,stderr=log);log.close()
   deadline=time.monotonic()+50;client=None
   while time.monotonic()<deadline:
    try:client=Marionette(port);break
    except (OSError,EOFError):time.sleep(.2)
   if not client:
    raise RuntimeError('Disposable browser failed to start: '+str(process.poll())+' files '+str(list(profile.iterdir())))
   client.call('WebDriver:NewSession',{'capabilities':{'alwaysMatch':{}}});client.call('WebDriver:SetTimeouts',{'script':90000});client.context('chrome');return client
  try:
   client=start();args=[str(manifest),str(fixtures),origin,version]
   r=client.js((ROOT/'tests/browser-scenario.js').read_text(),args);results['passed']+=r['passed'];results['nativeMetadata']=r['metadata'];results['rapidSwitchMs']=r['rapidSwitchMs']
   # Observe only the synthetic page via standard WebDriver content execution.
   client.context('content')
   handles=client.call('WebDriver:GetWindowHandles');handles=handles.get('value',handles) if isinstance(handles,dict) else handles
   for handle in handles:
    client.call('WebDriver:SwitchToWindow',{'handle':handle})
    url=client.call('WebDriver:GetCurrentURL');url=url.get('value',url) if isinstance(url,dict) else url
    if url.startswith(origin):break
   dom=client.js("const done=arguments[arguments.length-1];done({marker:document.documentElement.dataset.spaceExtensionFixture,storage:document.documentElement.dataset.fixtureStorage,original:!!document.getElementById('original')});")
   assert dom=={'marker':'injected','storage':'fixture-preserved','original':True},dom
   results['passed'].append('previous injected DOM remains after disable: confirms no isolation / no page reload')
   client.context('chrome');r=client.js((ROOT/'tests/browser-finish.js').read_text());results['passed']+=r['passed']
   # Exercise real AddonManager.beforeShutdown restoration, not simulated process death.
   client.js("const done=arguments[arguments.length-1];done(true);setTimeout(()=>Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit),50);")
   process.wait(timeout=25);process=None
   state=json.loads((profile/'zen-space-extension-manager-test.json').read_text());assert (state['journal']=={} and state['config']['enabled'] is True) or (state['config']['enabled'] is False and state['fault']=='restoration-incomplete'),state
   results['shutdownOutcome']='restored' if not state['journal'] else 'native-lifecycle-blocked-durable-recovery'
   results['passed'].append('actual browser shutdown either restores originals or durably freezes automation for recovery')
   client=start();r=client.js((ROOT/'tests/browser-restart.js').read_text(),args);results['passed']+=r['passed']
   results['backgroundEvents']=Handler.events
   (ROOT/'docs/browser-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
  except Exception:
   print('Fixture events: '+json.dumps(Handler.events));print((tmp/'process.log').read_text()[-5000:]);raise
  finally:
   if process:
    process.terminate()
    try:process.wait(timeout=8)
    except subprocess.TimeoutExpired:process.kill();process.wait()
   server.shutdown()
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--binary',default='/Applications/Zen.app/Contents/MacOS/zen');run(p.parse_args().binary)
