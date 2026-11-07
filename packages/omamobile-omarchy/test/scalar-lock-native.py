#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run exact patched host API factory with real asynchronous provider loading."""
from pathlib import Path
import os,shutil,subprocess,sys,tempfile
shell=Path(sys.argv[1]);here=Path(__file__).resolve().parent;runner=shutil.which('qmltestrunner6') or '/usr/lib/qt6/bin/qmltestrunner'
assert Path(runner).is_file(),'qmltestrunner required (qt6-declarative)'
def function(source,name):
 start=source.index('  function '+name+'(');begin=source.index('{',start);depth=1;i=begin+1
 while depth:
  depth+=(source[i]=='{')-(source[i]=='}');i+=1
 return source[start:i]
def fixture(root,source):
 (root/'services').mkdir(parents=True)
 for p in (here/'scalar-lock-native').iterdir():shutil.copyfile(p,root/p.name)
 shutil.copyfile(shell/'services/PluginBarStateApi.qml',root/'services/PluginBarStateApi.qml')
 shutil.copyfile(shell/'services/AuthServiceStore.js',root/'AuthServiceStore.js')
 refresh=function(source,'refreshAuthenticationState') if 'function refreshAuthenticationState(' in source else 'function refreshAuthenticationState(){shell._authenticationRevision++}'
 (root/'Host.qml').write_text('''import QtQuick
import "AuthServiceStore.js" as AuthServiceStore
import "services"
Item {id:shell
property int _authenticationRevision:0
property var _pluginBarStateApis:({})
property var bar:null
Component{id:pluginBarStateApiComponent;PluginBarStateApi{}}
function detachedBarSizes(sizes){return ({})}
'''+function(source,'pluginBarStateFor')+'\n'+refresh+'''
function registerProvider(service){AuthServiceStore.put("private.lock",service,function(){shell.refreshAuthenticationState()});shell.refreshAuthenticationState()}
function removeProvider(){AuthServiceStore.destroy("private.lock");shell.refreshAuthenticationState()}
}
''')
with tempfile.TemporaryDirectory(prefix='scalar-native-') as d:
 root=Path(d);positive=root/'positive';source=(shell/'shell.qml').read_text();fixture(positive,source)
 env=dict(os.environ,QT_QPA_PLATFORM='offscreen',QT_QUICK_BACKEND='software')
 r=subprocess.run([runner,'-input',str(positive),'-o','-,txt'],env=env,capture_output=True,text=True,timeout=15);assert r.returncode==0,r.stdout+r.stderr[-500:]
 # Exact previous store and host factory via reverse application of0033.
 old=root/'old/shell';(old/'services').mkdir(parents=True);shutil.copyfile(shell/'shell.qml',old/'shell.qml');shutil.copyfile(shell/'services/AuthServiceStore.js',old/'services/AuthServiceStore.js')
 r=subprocess.run(['patch','-R','-p1','--fuzz=0','-i',str(here.parent/'patches/0033-shell-publish-lock-scalars-on-canonical-events.patch')],cwd=root/'old',capture_output=True,text=True);assert r.returncode==0,r.stdout+r.stderr
 negative=root/'negative';fixture(negative,(old/'shell.qml').read_text());shutil.copyfile(old/'services/AuthServiceStore.js',negative/'AuthServiceStore.js')
 r=subprocess.run([runner,'-input',str(negative),'-o','-,txt'],env=env,capture_output=True,text=True,timeout=15)
 assert r.returncode!=0 and 'property sessionLocked' in r.stdout and 'true' in r.stdout and 'false' in r.stdout,r.stdout
print('PASS native actual host factory +asyncLoader +two APIs +credential isolation; exact0032 negative control stays locked')
