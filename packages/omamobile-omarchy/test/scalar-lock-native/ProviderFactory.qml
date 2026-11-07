import QtQuick
Item {
 Component {id:providerComponent;Provider{}}
 function createProvider(){return providerComponent.createObject(null)}
}
