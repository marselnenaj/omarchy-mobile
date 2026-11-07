import QtQuick
import "AuthServiceStore.js" as Store
QtObject { function snapshot(){return Store.lockSnapshot()} }
