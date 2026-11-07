// SPDX-License-Identifier: MIT
// Actual center functions/process callbacks + actual adapter added functions.
// Processes are inert except the reader/legacy shell, run against private fixtures.
'use strict'
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert'),
      os = require('os'), cp = require('child_process')
function body(s, start) {
  let a = s.indexOf('{', start), i = a + 1, d = 1;
  while (d) {
    if (s[i] === '{') d++;
    if (s[i] === '}') d--;
    i++
  }
  return s.slice(a, i)
}
function fn(s, name) {
  let a = s.indexOf('function ' + name + '(');
  assert(a >= 0, name);
  return s.slice(a, s.indexOf('{', a)) + body(s, a)
}

let count = 0;
function test(name, f) {
  f();
  count++;
  console.log('PASS', name)
}
const adapter =
    path.join(__dirname, '../patches/0019-notifications-forget-one-notification-by-ipc.patch')
const patch = fs.readFileSync(adapter, 'utf8')
                  .split('\n')
                  .filter(x => !x.startsWith('---') && !x.startsWith('+++') && !x.startsWith('-'))
                  .map(x => x.startsWith('+') ? x.slice(1) : x)
                  .join('\n')
function service() {
  let c = {
    Object,
    JSON,
    Store: {KEY: /^[A-Za-z0-9_-]{1,120}$/, liveEntry: (rows, key) => rows.find(x => x.key === key)},
    liveLoaded: true,
    historyLoaded: true,
    liveKeys: {old: {}},
    liveEntries: [{key: 'old'}],
    historyEntries: [{key: 'history'}],
    refs: {old: {}},
    rowIndexFor: key => key === 'old' ? 0 : -1,
    saves: [],
    closed: [],
    activated: [],
    storeDrop(key) {
      this.liveEntries = this.liveEntries.filter(x => x.key !== key)
    },
    saveSoon(which) {
      this.saves.push(which)
    },
    closeToast(key, reason) {
      this.closed.push([key, reason]);
      delete this.liveKeys[key]
    },
    activate(key) {
      this.activated.push(key)
    }
  };
  c.service = c;
  for (let n of ['storeDrop', 'saveSoon', 'closeToast', 'activate']) c[n] = c[n].bind(c);
  vm.createContext(c);
  let activate =
      fn(patch, 'activateLive').replace('name: string', 'name').replace('): string', ')');
  vm.runInContext(
      fn(patch, 'forgetNotification') + '\n' + fn(patch, 'forgetAllNotifications') + '\n' +
          activate,
      c);
  return c
}
test('adapter unloaded stores refuse mutation and cleanup', () => {
  let c = service();
  c.historyLoaded = false;
  assert.equal(c.forgetNotification('old'), 'busy');
  assert.equal(JSON.parse(c.forgetAllNotifications()).result, 'busy');
  assert.equal(c.liveEntries.length, 1);
  assert.equal(c.saves.length, 0)
})
test('adapter clear snapshots keys and new arrival survives', () => {
  let c = service();
  let r = JSON.parse(c.forgetAllNotifications());
  assert.deepEqual(r.keys, ['old', 'history']);
  c.liveEntries.push({key: 'new'});
  assert.deepEqual(c.liveEntries.map(x => x.key), ['new']);
  assert.equal(c.historyEntries.length, 0);
  assert(c.closed.every(x => x[1] === 'forget'));
  assert(patch.includes('reason !== "forget"'))
})
test('adapter activation requires current live reference plus row', () => {
  let c = service();
  assert.equal(c.activateLive('old'), 'ok');
  for (let key of ['history', 'unknown', '../x']) assert.equal(c.activateLive(key), 'none');
  delete c.refs.old;
  assert.equal(c.activateLive('old'), 'none');
  assert.deepEqual(c.activated, ['old'])
})
console.log('PASS', count, 'adapter center cases')
