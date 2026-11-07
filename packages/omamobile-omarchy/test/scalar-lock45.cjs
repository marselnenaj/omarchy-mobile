// SPDX-License-Identifier: MIT
// Execute the actual patched private store, never a mirror implementation.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const shell=process.argv[2],source=fs.readFileSync(path.join(shell,'services/AuthServiceStore.js'),'utf8');
function store(){const context={};vm.createContext(context);vm.runInContext(source,context);return context;}
function scalar(snapshot,known,locked){assert.deepEqual(Object.keys(snapshot).sort(),['known','locked']);assert.strictEqual(snapshot.known,known);assert.strictEqual(snapshot.locked,locked);for(const value of Object.values(snapshot))assert.strictEqual(typeof value,'boolean');}
const trusted=store(),untrusted=store();let locked=false;
scalar(trusted.lockSnapshot(),false,true);
const credential={secret:'synthetic fixture secret',currentlyLocked:()=>locked};trusted.put('private.lock',credential);
scalar(trusted.lockSnapshot(),true,false);scalar(untrusted.lockSnapshot(),false,true);
locked=true;scalar(trusted.lockSnapshot(),true,true);
assert(!JSON.stringify(trusted.lockSnapshot()).includes('secret'));assert.notStrictEqual(trusted.lockSnapshot(),credential);
trusted.put('second.lock',{currentlyLocked:()=>false});scalar(trusted.lockSnapshot(),false,true);
trusted.destroy('second.lock');scalar(trusted.lockSnapshot(),true,true);
trusted.destroy('private.lock');scalar(trusted.lockSnapshot(),false,true);
for(const value of [undefined,null,'false',0,{},[]]){trusted.put('malformed',{currentlyLocked:()=>value});scalar(trusted.lockSnapshot(),false,true);trusted.destroy('malformed');}
trusted.put('throwing',{currentlyLocked:()=>{throw Error('unavailable')}});scalar(trusted.lockSnapshot(),false,true);
const host=fs.readFileSync(path.join(shell,'shell.qml'),'utf8'),api=fs.readFileSync(path.join(shell,'services/PluginBarStateApi.qml'),'utf8');
assert(host.includes('api._sessionLockState = AuthServiceStore.lockSnapshot()'));assert(!host.includes('api._sessionLockState = Qt.binding('));assert(host.includes('AuthServiceStore.lockSnapshot()'));assert(host.includes('function refreshAuthenticationState()'));assert(host.includes('api._sessionLockState = { known: snapshot.known === true, locked: snapshot.locked !== false }'));
assert(api.includes('readonly property bool sessionLockKnown:'));assert(api.includes('readonly property bool sessionLocked: !sessionLockKnown || _sessionLockState.locked !== false'));
assert(!api.includes('AuthServiceStore')&&!api.includes('authServices')&&!api.includes('credential'));
console.log('PASS actual scalar lock API: isolated contexts, no credential object, event binding, unknown/ambiguous/malformed/throwing fail closed');

// Exercise actual observer implementation, including replacement/destruction.
function event(){const listeners=new Set();return {connect:fn=>listeners.add(fn),disconnect:fn=>listeners.delete(fn),emit(){for(const fn of [...listeners])fn();},count:()=>listeners.size};}
function provider(state){const lockedChanged=event(),lockRequestedChanged=event();return {lockedChanged,lockRequestedChanged,currentlyLocked:()=>state.value,destroy(){lockedChanged.emit();lockRequestedChanged.emit();}};}
const observed=store(),cold={value:true};let revision=0;
const first=provider(cold),changed=()=>revision++;
observed.put('lock',first,changed);scalar(observed.lockSnapshot(),true,true);
assert.strictEqual(first.lockedChanged.count(),1);assert.strictEqual(first.lockRequestedChanged.count(),1);
cold.value=false;first.lockedChanged.emit();assert.strictEqual(revision,1);scalar(observed.lockSnapshot(),true,false);
cold.value=true;first.lockRequestedChanged.emit();assert.strictEqual(revision,2);scalar(observed.lockSnapshot(),true,true);
const nextState={value:false},next=provider(nextState);observed.put('lock',next,changed);
assert.strictEqual(revision,2,'old destroy signals must be disconnected before destroy');
assert.strictEqual(first.lockedChanged.count(),0);assert.strictEqual(first.lockRequestedChanged.count(),0);
first.lockedChanged.emit();assert.strictEqual(revision,2);next.lockedChanged.emit();assert.strictEqual(revision,3);
observed.put('lock',next,changed);assert.strictEqual(next.lockedChanged.count(),1,'same-object replacement must not duplicate listeners');
observed.destroy('lock');assert.strictEqual(revision,3);assert.strictEqual(next.lockedChanged.count(),0);assert.strictEqual(next.lockRequestedChanged.count(),0);
next.lockedChanged.emit();scalar(observed.lockSnapshot(),false,true);assert.strictEqual(revision,3);
const a=provider({value:true}),b=provider({value:true});observed.put('a',a,changed);observed.put('b',b,changed);observed.destroyAll();
assert.strictEqual(a.lockedChanged.count()+b.lockedChanged.count(),0);assert.strictEqual(revision,3);
scalar(untrusted.lockSnapshot(),false,true);
assert(host.includes('AuthServiceStore.put(key, inst, function() { shell.refreshAuthenticationState() })'));
console.log('PASS actual lock notifications: cold locked→unlock, both signals, replacement/same-object/destroy/destroyAll disconnect, isolated untrusted store');

// Canonical native-event fallback must refresh even when aggregate stays stale.
const nativeStore=store(),nativeState={value:true};let nativeCallbacks=0;
const nativeEvent=event(),nativeProvider={lastEventChanged:nativeEvent,currentlyLocked:()=>nativeState.value};
nativeStore.put('native',nativeProvider,()=>nativeCallbacks++);nativeState.value=false;nativeEvent.emit();
assert.strictEqual(nativeCallbacks,1);scalar(nativeStore.lockSnapshot(),true,false);
nativeStore.destroy('native');assert.strictEqual(nativeEvent.count(),0);scalar(untrusted.lockSnapshot(),false,true);
console.log('PASS actual canonical native-event observer refreshes fresh scalar without aggregate notifier');
