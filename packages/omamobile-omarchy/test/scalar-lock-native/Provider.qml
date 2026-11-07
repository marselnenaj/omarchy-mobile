import QtQuick
Item {
 id:provider
 property bool lockRequested:true
 // Reproduce known aggregate-notifier failure without hiding native events.
 readonly property bool locked:true
 // Model a native getter whose value changes without the aggregate notifier.
 property var nativeState:({locked:true,secure:true})
 property string lastEvent:"cold-init"
 function currentlyLocked(){return lockRequested||nativeState.locked||nativeState.secure}
 function unlock(){lockRequested=false;nativeState.locked=false;lastEvent="session-locked=false";nativeState.secure=false;lastEvent="secure=false"}
}
