// SPDX-License-Identifier: MIT
import QtQuick
import QtTest

TestCase {
    id: test
    name: "ToastSwipe45"
    width: 420
    height: 240
    visible: true
    when: windowShown

    Component { id: factory; Card { x: 20; y: 40 } }
    property var card
    property double dismissedAt: 0
    Connections {
        target: test.card
        function onDismissed() { test.dismissedAt = Date.now() }
    }
    SignalSpy { id: dismissSpy; signalName: "dismissed" }
    SignalSpy { id: actionSpy; signalName: "activated" }

    function init() {
        Style.reduceMotion = false
        card = createTemporaryObject(factory, test)
        verify(card !== null)
        dismissSpy.target = card
        actionSpy.target = card
        dismissedAt = 0
        dismissSpy.clear()
        actionSpy.clear()
        wait(30)
    }

    function test_release_data() {
        return [
            { tag: "long-right", offset: 150, speed: 0, dismiss: true },
            { tag: "long-left", offset: -150, speed: 0, dismiss: true },
            { tag: "short-right", offset: 60, speed: 0, dismiss: false },
            { tag: "short-left", offset: -60, speed: 0, dismiss: false },
            { tag: "flick-right", offset: 50, speed: 1100, dismiss: true },
            { tag: "flick-left", offset: -50, speed: -1100, dismiss: true },
            { tag: "opposite-velocity", offset: 50, speed: -1100, dismiss: false },
            { tag: "tiny-flick", offset: 20, speed: 1500, dismiss: false }
        ]
    }

    function test_release(data) {
        card.swipeOffset = data.offset
        card.swipeVelocity = data.speed
        var beforeOpacity = card.opacity
        verify(beforeOpacity < 1)
        var releasedAt = Date.now()
        card.finishSwipe()
        compare(dismissSpy.count, 0)
        compare(card.swipeOffset, data.offset)
        wait(50)
        compare(dismissSpy.count, 0)
        if (data.dismiss) {
            verify(Math.abs(card.swipeOffset) > Math.abs(data.offset))
            verify(card.opacity < beforeOpacity)
            tryCompare(dismissSpy, "count", 1, 250)
            verify(Math.abs(card.swipeOffset) >= card.width)
            verify(card.dismissing)
            verify(dismissedAt - releasedAt >= 125, "Dismiss waits for the 140ms fly-off")
        } else {
            verify(Math.abs(card.swipeOffset) < Math.abs(data.offset))
            tryCompare(card, "swipeOffset", 0, 300)
            compare(dismissSpy.count, 0)
            compare(card.opacity, 1)
        }
        compare(actionSpy.count, 0)
    }

    function test_touch_data() {
        return [
            { tag: "long-right", delta: 155, dismiss: true },
            { tag: "long-left", delta: -155, dismiss: true },
            { tag: "short-right", delta: 55, dismiss: false },
            { tag: "short-left", delta: -55, dismiss: false },
            { tag: "flick-right", delta: 125, dismiss: true, fast: true },
            { tag: "flick-left", delta: -125, dismiss: true, fast: true }
        ]
    }

    function test_touch(data) {
        var touch = touchEvent(test)
        touch.press(0, test, 210, 100).commit()
        for (var step = 1; step <= 10; ++step) {
            touch.move(0, test, 210 + data.delta * step / 10, 100).commit()
            wait(data.fast ? 1 : 30)
        }
        verify(Math.abs(card.swipeOffset) > 20)
        compare(dismissSpy.count, 0)
        if (data.fast) {
            verify(Math.abs(card.swipeOffset) < card.width * 0.35)
            verify(Math.abs(card.swipeOffset) >= card.width * 0.1)
            verify(Math.abs(card.swipeVelocity) >= 900, "Synthetic flick reached the velocity threshold")
        }
        wait(data.fast ? 1 : 150)
        touch.release(0, test, 210 + data.delta, 100).commit()
        compare(actionSpy.count, 0)
        compare(dismissSpy.count, 0)
        if (data.dismiss)
            tryCompare(dismissSpy, "count", 1, 300)
        else
            tryCompare(card, "swipeOffset", 0, 350)
        compare(actionSpy.count, 0)
        compare(dismissSpy.count, data.dismiss ? 1 : 0)
    }

    function test_replyAndLeaving_data() {
        return [
            { tag: "reply", reply: true, hidden: false, leaving: false },
            { tag: "hidden", reply: false, hidden: true, leaving: false },
            { tag: "leaving", reply: false, hidden: false, leaving: true }
        ]
    }

    function test_replyAndLeaving(data) {
        card.replyOpen = data.reply
        card.place = ({ hidden: data.hidden, leaving: data.leaving })
        var touch = touchEvent(test)
        touch.press(0, test, 210, 100).commit()
        touch.move(0, test, 370, 100).commit()
        touch.release(0, test, 370, 100).commit()
        wait(250)
        compare(card.swipeOffset, 0)
        compare(dismissSpy.count, 0)
    }

    function test_midDragDisabled_data() {
        return [ { tag: "reply" }, { tag: "hidden" }, { tag: "leaving" } ]
    }

    function test_midDragDisabled(data) {
        var touch = touchEvent(test)
        touch.press(0, test, 210, 100).commit()
        for (var step = 1; step <= 10; ++step) {
            touch.move(0, test, 210 + 155 * step / 10, 100).commit()
            wait(10)
        }
        verify(card.swipeOffset > card.width * 0.35)
        if (data.tag === "reply") card.replyOpen = true
        else card.place = ({ hidden: data.tag === "hidden", leaving: data.tag === "leaving" })
        touch.release(0, test, 365, 100).commit()
        wait(300)
        compare(card.swipeOffset, 0)
        compare(dismissSpy.count, 0)
        compare(actionSpy.count, 0)
    }

    function test_cancelDuringFlyoff() {
        card.swipeOffset = 150
        card.finishSwipe()
        wait(40)
        card.cancelSwipe()
        wait(200)
        compare(card.swipeOffset, 0)
        compare(card.dismissing, false)
        compare(dismissSpy.count, 0)
    }

    function test_reduceMotion_data() {
        return [ { tag: "dismiss", offset: 150 }, { tag: "return", offset: 55 } ]
    }

    function test_reduceMotion(data) {
        Style.reduceMotion = true
        card.swipeOffset = data.offset
        card.swipeVelocity = 0
        card.finishSwipe()
        var dismiss = data.offset >= card.width * 0.35
        tryCompare(card, "swipeOffset", dismiss ? card.width + 24 : 0, 80)
        compare(dismissSpy.count, dismiss ? 1 : 0)
        compare(actionSpy.count, 0)
    }

    function test_sceneOpacity() {
        card.scene = { at: function(key, role) { return 0.5 } }
        card.swipeOffset = 190
        compare(card.opacity, 0.35)
        card.place = ({ hidden: true, leaving: false })
        compare(card.opacity, 0)
    }

    function test_tapStillOpens() {
        mouseClick(test, 210, 100)
        compare(actionSpy.count, 1)
        compare(dismissSpy.count, 0)
    }
}
