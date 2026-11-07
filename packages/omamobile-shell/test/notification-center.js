// SPDX-License-Identifier: MIT
// Actual center functions/process callbacks + actual adapter added functions.
// Processes are inert except the reader/legacy shell, run against private fixtures.
'use strict'
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert'),
      os = require('os'), cp = require('child_process')
const dir = path.join(__dirname, '../plugins/omamobile.quicksettings')
const source = fs.readFileSync(process.env.NOTIFICATION_SOURCE || path.join(dir, 'QuickSettings.qml'), 'utf8'),
      M = require(process.env.NOTIFICATION_MODEL || path.join(dir, 'NotificationsModel.js'))
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
function callback(id) {
  let a = source.indexOf('id: ' + id);
  assert(a >= 0);
  return 'function(code) ' + body(source, source.indexOf('onExited:', a))
}
let count = 0;
function test(name, f) {
  f();
  count++;
  console.log('PASS', name)
}
function center() {
  let c = {
    Object,
    Date,
    JSON,
    NotificationsModel: M,
    notifications: [],
    hiddenNotifications: {},
    notificationStore: '',
    notificationDeleteError: '',
    pendingClearKeys: [],
    pendingClearKeyed: false,
    clearProc: {running: false},
    notificationTap: {running: false},
    notificationTapResult: {text: ''},
    clearResult: {text: ''},
    Quickshell: {shellDir: '/fixture/config', execDetached: argv => c.executed.push(argv)},
    executed: [],
    dismiss() {
      this.dismissed = true
    },
    notificationsLater: {restart() {}},
    pendingNotificationTap: null
  };
  c.root = c;
  vm.createContext(c);
  vm.runInContext(
      fn(source, 'clearAllNotifications') + '\n' + fn(source, 'openNotification') +
          '\nthis.clearDone=' + callback('clearProc') +
          ';this.tapDone=' + callback('notificationTap'),
      c);
  return c
}
const old = {
  key: 'old',
  file: 'old',
  keyed: true,
  live: true,
  app: 'Fixture',
  summary: 'Old',
  timestamp: 1000
},
      fresh = {
        ...old,
        key: 'new',
        file: 'new',
        timestamp: 2000
      };
const json = x => JSON.parse(JSON.stringify(x))
test('legacy parsing/actions remain compatible', () => {
  let e = M.parse(
      '{"timestamp":1000,"id":1,"summary":"Legacy","execArgv":"[\\"fixture-tool\\",\\"x\\"]"}')[0];
  assert.equal(e.key, '1000-1');
  assert.deepEqual(M.tapArgv(e), ['fixture-tool', 'x'])
})
test('keyed arrays parse live/history and deduplicate', () => {
  let raw = JSON.stringify([{key: 'x', ts: 2, summary: 'Live'}]) + '\n' + JSON.stringify([
    {key: 'x', ts: 2, closed_ts: 3, summary: 'Old'},
    {key: 'y', ts: 1, closed_ts: 2, summary: 'History'}
  ]);
  let e = M.parse(raw);
  assert.deepEqual(e.map(x => x.key), ['x', 'y']);
  assert(e[0].live);
  assert(!e[1].live)
})
test('malformed keyed records cannot become executable legacy rows', () => {
  for (let row
           of [{key: '../x', summary: 'Bad', execArgv: '["must-not-run"]'},
               {summary: 'Missing key', execArgv: '["must-not-run"]'}])
    assert.equal(M.parse(JSON.stringify([row])).length, 0);
  assert.equal(M.parse(JSON.stringify({key: '../x', summary: 'Bad'})).length, 0)
})
test('numeric and object keys cannot become keyed or executable legacy records', () => {
  for (const key of [123, {value: 'owned'}]) {
    const row = {key, summary: 'Malformed', execArgv: '["must-not-run"]'};
    assert.equal(M.entry(row).keyed, false);
    assert.equal(M.parse(JSON.stringify([row])).length, 0);
    assert.equal(M.parse(JSON.stringify(row)).length, 0);
  }
  const key = {toString() { throw Error('must not coerce an object key') }};
  assert.equal(M.entry({key}).keyed, false);
})
test('keyed history never executes persisted argv', () => {
  let e = M.entry({key: 'x', ts: 1, closed_ts: 2, app: 'Fixture', execArgv: '["must-not-run"]'});
  assert.deepEqual(M.tapArgv(e), ['omarchy-hyprland-focus-app', 'Fixture'])
})
test('keyed live tap asks current service, lost reference only focuses', () => {
  let c = center();
  c.openNotification(old);
  assert.deepEqual(
      json(c.notificationTap.command),
      ['qs', 'ipc', '-p', '/fixture/config', 'call', 'notifications', 'activateLive', 'old']);
  assert.equal(c.executed.length, 0);
  c.tapDone(0);
  assert.deepEqual(json(c.executed), [['omarchy-hyprland-focus-app', 'Fixture']])
})
test('acknowledged live tap does not execute client-side action', () => {
  let c = center();
  c.openNotification({...old, execArgv: '["must-not-run"]'});
  c.notificationTapResult.text = 'ok';
  c.tapDone(0);
  assert.equal(c.executed.length, 0)
})
test('unknown store refuses clear until first read', () => {
  let c = center();
  c.clearAllNotifications();
  assert.equal(c.clearProc.running, false);
  assert(c.notificationDeleteError)
})
test('keyed clear waits for acknowledgment and preserves new arrival', () => {
  let c = center();
  c.notificationStore = 'keyed';
  c.notifications = [old];
  c.clearAllNotifications();
  assert.equal(c.notifications.length, 1);
  assert.equal(c.clearProc.command.at(-1), 'forgetAll');
  c.notifications.push(fresh);
  c.clearResult.text = '{"result":"ok","keys":["old"]}';
  c.clearDone(0);
  assert.deepEqual(c.notifications.map(x => x.key), ['new']);
  assert(c.hiddenNotifications.old);
  assert.deepEqual(
      M.shown(
           JSON.stringify(
               [{key: 'old', ts: 1, summary: 'Old'}, {key: 'new', ts: 2, summary: 'New'}]),
           c.hiddenNotifications, Date.now())
          .entries.map(x => x.key),
      ['new'])
})
test('busy failed malformed replies preserve all rows and report error', () => {
  for (let reply of ['', 'ok', '{"result":"busy","keys":[]}', '{"result":"ok","keys":["../x"]}']) {
    let c = center();
    c.notificationStore = 'keyed';
    c.notifications = [old];
    c.clearAllNotifications();
    c.clearResult.text = reply;
    c.clearDone(0);
    assert.equal(c.notifications.length, 1);
    assert(c.notificationDeleteError)
  }
  let c = center();
  c.notificationStore = 'keyed';
  c.notifications = [old];
  c.clearAllNotifications();
  c.clearResult.text = '{"result":"ok","keys":["old"]}';
  c.clearDone(1);
  assert.equal(c.notifications.length, 1)
})
test('clear process overlap cannot overwrite in-flight mode/snapshot', () => {
  let c = center();
  c.notificationStore = 'keyed';
  c.notifications = [old];
  c.clearAllNotifications();
  c.notificationStore = 'legacy';
  c.notifications = [fresh];
  c.clearAllNotifications();
  assert.equal(c.pendingClearKeyed, true);
  assert.deepEqual(json(c.pendingClearKeys), ['old'])
})
test('valid dictionary-like keys do not poison tombstone maps', () => {
  let keys = ['hasOwnProperty', '__proto__', 'constructor', 'hasOwnProperty'];
  assert.deepEqual(M.clearResult(JSON.stringify({result: 'ok', keys}), 0).keys, keys.slice(0, 3));
  let c = center();
  c.notificationStore = 'keyed';
  c.clearAllNotifications();
  c.clearResult.text = JSON.stringify({result: 'ok', keys});
  c.clearDone(0);
  let raw = JSON.stringify(keys.map(key => ({key, ts: 1, summary: 'Fixture'})));
  assert.equal(M.shown(raw, c.hiddenNotifications, Date.now()).entries.length, 0)
})
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-center-'))
try {
  const readStart = source.indexOf('    command:', source.indexOf('id: notificationsRead')),
        readEnd = source.indexOf('\n    stdout:', readStart)
  const expression = source.slice(readStart, readEnd).replace(/^\s*command:\s*/, '')
  const read = () => {
    let argv = vm.runInNewContext(expression, {root: {notificationsDir: tmp}});
    let r = cp.spawnSync(argv[0], argv.slice(1), {encoding: 'utf8'});
    assert.equal(r.status, 0, r.stderr);
    return r.stdout
  };
  test('actual reader selects legacy files and never quiet state', () => {
    fs.mkdirSync(path.join(tmp, 'history'));
    fs.writeFileSync(path.join(tmp, '1.json'), '{"timestamp":1,"summary":"Legacy"}\n');
    fs.writeFileSync(path.join(tmp, 'quiet.json'), '{"doNotDisturb":true}\n');
    let raw = read();
    assert.equal(M.storeKind(raw), 'legacy');
    assert.deepEqual(M.parse(raw).map(x => x.summary), ['Legacy'])
  })
  test('empty keyed stores never fall back to leftover legacy history', () => {
    fs.writeFileSync(path.join(tmp, 'live.json'), '[]');
    let raw = read();
    assert.equal(M.storeKind(raw), 'keyed');
    assert.equal(M.parse(raw).length, 0)
  })
  test('keyed reader includes closed history, not quiet configuration', () => {
    fs.writeFileSync(
        path.join(tmp, 'history.json'), '[{"key":"saved","ts":2,"closed_ts":3,"summary":"Saved"}]');
    assert.deepEqual(M.parse(read()).map(x => x.key), ['saved'])
  })
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(tmp, 'calls');
  fs.writeFileSync(
      path.join(bin, 'qs'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FIXTURE_LOG"\n[ "$6" != dismissAll ] || exit "${DISMISS_RESULT:-0}"\n');
  fs.chmodSync(path.join(bin, 'qs'), 0o700)
  test('legacy keeps dismissAll and clear, propagating failure', () => {
    let c = center();
    c.notificationStore = 'legacy';
    c.notifications = [old];
    c.clearAllNotifications();
    let argv = json(c.clearProc.command);
    assert(argv[2].includes('&&'));
    for (let fail of ['0', '7']) {
      fs.writeFileSync(log, '');
      let r = cp.spawnSync(argv[0], argv.slice(1), {
        env: {PATH: bin + ':' + process.env.PATH, FIXTURE_LOG: log, DISMISS_RESULT: fail},
        encoding: 'utf8'
      });
      assert.equal(r.status, Number(fail));
      let calls = fs.readFileSync(log, 'utf8');
      assert(calls.includes('dismissAll'));
      if (fail === '7') assert(!calls.includes('notifications clear'))
    }
  })
} finally {
  fs.rmSync(tmp, {recursive: true, force: true})
}
console.log('PASS', count, 'universal center cases')
