import QtQuick
import QtTest
TestCase {
 id:test
 name:"ActualHostFactoryAsyncColdLock"
 Component{id:hostFactory;Host{}}
 Component {id:loaderFactory;Loader {property var target;property var provider:null;asynchronous:true;source:"ProviderFactory.qml";onLoaded:{provider=item.createProvider();target.registerProvider(provider)}}}
 Untrusted{id:untrusted}
 property var pending:null
 function test_async_provider_then_cold_unlock_imperative(){
  var host=hostFactory.createObject(test)
  var api=host.pluginBarStateFor("launcher","mobile")
  compare(api.sessionLockKnown,false)
  // Provider registration happens AFTER API creation, as in an async loader.
  var loader=loaderFactory.createObject(test,{target:host})
  tryVerify(function(){return loader.status===Loader.Ready&&api.sessionLockKnown},1000)
  pending=loader.provider
  compare(api.sessionLocked,true)
  compare(untrusted.snapshot().known,false)
  var second=host.pluginBarStateFor("home","mobile")
  compare(second.sessionLocked,true)
  Qt.callLater(function(){pending.unlock()})
  tryCompare(api,"sessionLocked",false,1000)
  compare(second.sessionLocked,false)
  compare(untrusted.snapshot().known,false)
  compare(pending.locked,true,"stale aggregate must not dictate fresh scalar snapshot")
  host.removeProvider();compare(api.sessionLockKnown,false);compare(api.sessionLocked,true)
  pending=null;loader.destroy();host.destroy()
 }
}
