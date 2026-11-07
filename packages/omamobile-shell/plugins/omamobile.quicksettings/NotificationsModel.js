// SPDX-License-Identifier: MIT
// The notification shade under the quick-settings sheet: Omarchy's
// notification history, read from the files its notification service keeps.
// Pure functions, so QuickSettings.qml can render plain objects and Node can
// test them in test/notifications-model.js through module.exports.
//
// Omarchy4.5 stores keyed arrays in live.json and history.json. Live includes
// a heads-up that has hidden while its sender/payload is still alive; history
// has closed_ts and cannot assert a live sender action. Read both atomically
// written files, deduplicate by logical key, and forget through service IPC.
// The legacy single-row shape remains readable for an older stored entry.

var LIMIT = 10

function str(value) {
  return value === undefined || value === null ? "" : String(value)
}

// The body as one line of plain text. Omarchy keeps the sender's markup
// (b, i, u, a and entities) and styles it when it draws a toast; the shade
// shows text only.
function plainBody(body) {
  return str(body)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

// Omarchy's own toasts carry their click action as a JSON argv (the
// omarchy-exec-argv hint), which the files keep. The same structural check
// as Omarchy's parseExecArgv: a non-empty array of strings whose program is
// not empty and doesn't start with a dash. Null for anything else.
function execArgv(value) {
  var text = str(value)
  if (!text) return null
  var list = null
  try { list = JSON.parse(text) } catch (error) { return null }
  if (!Array.isArray(list) || list.length === 0) return null
  for (var i = 0; i < list.length; i++)
    if (typeof list[i] !== "string") return null
  if (list[0] === "" || list[0].charAt(0) === "-") return null
  return list
}

// Reader emits this prefix independently of payload rows. Presence of either
// keyed store prevents fallback to leftover legacy files, even for empty arrays.
function storeKind(raw) {
  var first = str(raw).split("\n")[0]
  try {
    var mode = JSON.parse(first).omamobileStore
    return mode === "keyed" || mode === "legacy" ? mode : ""
  } catch (error) { return "" }
}

function entry(value) {
  var v = value || {}
  var keyed = typeof v.key === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(v.key)
  var timestamp = Number(keyed ? Number(v.ts || 0) * 1000 : v.timestamp || 0)
  if (!isFinite(timestamp) || timestamp < 0) timestamp = 0
  var id = v.originalId || v.id || 0
  return {
    key: keyed ? str(v.key) : String(timestamp) + "-" + String(id),
    keyed: keyed,
    live: keyed && !v.closed_ts,
    // The service's own name for the file (popupFileName: <timestamp>-
    // <originalId>.json), which its forget call takes.
    file: keyed ? str(v.key) : String(timestamp) + "-" + String(Number(v.originalId) || 0) + ".json",
    app: str(v.app),
    summary: str(v.summary).trim(),
    body: plainBody(v.body),
    glyph: str(v.glyph),
    execArgv: str(v.execArgv),
    urgency: typeof v.urgency === "number" ? v.urgency : 1,
    timestamp: timestamp
  }
}

// Both keyed state arrays, newest first and deduplicated by logical key.
// A row moving between atomic files can be observed twice; prefer live input.
// Malformed or partially read lines are ignored.
function parse(raw, limit) {
  var max = typeof limit === "number" ? Math.max(0, limit) : LIMIT
  var lines = str(raw).split("\n")
  var seen = Object.create(null)
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    var value = null
    try { value = JSON.parse(line) } catch (error) { continue }
    if (!value || typeof value !== "object") continue
    var values = Array.isArray(value) ? value : [value]
    for (var j = 0; j < values.length; j++) {
      if (!values[j] || typeof values[j] !== "object" || Array.isArray(values[j])) continue
      if ((Array.isArray(value) || values[j].key !== undefined)
          && (typeof values[j].key !== "string"
            || !/^[A-Za-z0-9_-]{1,120}$/.test(values[j].key))) continue
      var e = entry(values[j])
      if (!e.summary && !e.body) continue
      if (seen[e.key]) continue
      seen[e.key] = true
      out.push(e)
    }
  }
  out.sort(function(a, b) { return b.timestamp - a.timestamp })
  return out.slice(0, max)
}

// What the shade shows: parse(), less the notifications swiped away.
// `hidden` maps an entry's key to when it was swiped (ms). The service
// deletes its file a moment later, so until a read no longer finds the
// file, the row stays out; a mark older than graceMs (a forget that never
// happened, say on an Omarchy without the forget call) lapses, and the row
// comes back rather than staying hidden for a notification that is still
// there. Returns the rows and the marks still needed.
function shown(raw, hidden, now, graceMs) {
  var marks = hidden || {}
  var grace = typeof graceMs === "number" ? graceMs : 15000
  var all = parse(raw, Infinity)
  var present = Object.create(null)
  for (var i = 0; i < all.length; i++) present[all[i].key] = true
  var kept = {}
  for (var key in marks) {
    if (!Object.prototype.hasOwnProperty.call(marks, key) || !present[key]) continue
    if (Number(now) - Number(marks[key]) <= grace)
      Object.defineProperty(kept, key, { value: marks[key], enumerable: true, configurable: true, writable: true })
  }
  var out = all.filter(function(e) { return !Object.prototype.hasOwnProperty.call(kept, e.key) })
  return { entries: out.slice(0, LIMIT), hidden: kept }
}

function without(entries, key) {
  return (entries || []).filter(function(e) { return e && e.key !== key })
}

// How a sideways swipe on a row ends: -1 or 1 to fly off that side and
// take the notification away, 0 to spring back. Past 35% of the row's
// width, or a flick the same way at flingSpeed px/s or faster once it has
// moved a tenth of the width (as Omarchy's toasts, patch 0017).
function swipeOutcome(offset, velocity, width, flingSpeed) {
  var w = Number(width), x = Number(offset), v = Number(velocity) || 0
  if (!(w > 0) || !isFinite(x) || x === 0) return 0
  var distance = Math.abs(x)
  var flung = v * x > 0 && Math.abs(v) >= Number(flingSpeed) && distance >= w * 0.1
  if (distance >= w * 0.35 || flung) return x < 0 ? -1 : 1
  return 0
}

function newest(entries) {
  var most = 0
  var list = entries || []
  for (var i = 0; i < list.length; i++)
    if (list[i] && list[i].timestamp > most) most = list[i].timestamp
  return most
}

// What a tap on a row runs: the toast's own action when Omarchy gave it one,
// otherwise Omarchy's focus helper for the sending app (what a click on a
// toast without a live action does). Null when there is nothing to do.
function tapArgv(e) {
  if (!e) return null
  // A persisted keyed row cannot assert a live sender capability.
  if (e.keyed) return e.app ? ["omarchy-hyprland-focus-app", e.app] : null
  var argv = execArgv(e.execArgv)
  if (argv) return argv
  if (e.app) return ["omarchy-hyprland-focus-app", e.app]
  return null
}

// How long ago, in a few characters: "now", "5 min", "3 h", "2 d".
function ago(timestamp, now) {
  var ms = Number(now) - Number(timestamp)
  if (!isFinite(ms) || Number(timestamp) <= 0) return ""
  var minutes = Math.floor(Math.max(0, ms) / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return minutes + " min"
  var hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + " h"
  return Math.floor(hours / 24) + " d"
}

function title(count) {
  return count > 0 ? "Notifications · " + count : "Notifications"
}

// Only service-acknowledged keys are hidden while its atomic file writes finish.
// A failed/unknown reply keeps the center visible; no masked shell exit code.
function clearResult(raw, code) {
  if (code !== 0) return { ok: false, keys: [] }
  var value
  try { value = JSON.parse(String(raw || "")) } catch (error) { return { ok: false, keys: [] } }
  if (!value || value.result !== "ok" || !Array.isArray(value.keys) || value.keys.length > 300)
    return { ok: false, keys: [] }
  var seen = Object.create(null), keys = []
  for (var i = 0; i < value.keys.length; i++) {
    var key = value.keys[i]
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(key)) return { ok: false, keys: [] }
    if (!seen[key]) { seen[key] = true; keys.push(key) }
  }
  return { ok: true, keys: keys }
}

if (typeof module !== "undefined") {
  module.exports = {
    LIMIT: LIMIT,
    storeKind: storeKind,
    clearResult: clearResult,
    plainBody: plainBody,
    execArgv: execArgv,
    entry: entry,
    parse: parse,
    shown: shown,
    without: without,
    swipeOutcome: swipeOutcome,
    newest: newest,
    tapArgv: tapArgv,
    ago: ago,
    title: title
  }
}
