import React, { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../ui';

// Small OpenStreetMap view (no API key needed).
// markers: [{ lat, lng, label, color }]
export default function MapView({ markers, height = 220 }) {
  const valid = (markers || []).filter((m) => m && Number.isFinite(m.lat) && Number.isFinite(m.lng));
  const html = useMemo(() => buildHtml(valid), [JSON.stringify(valid)]);
  if (!valid.length) return null;
  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        javaScriptEnabled
        style={{ flex: 1, backgroundColor: C.bg }}
      />
    </View>
  );
}

function buildHtml(markers) {
  const data = JSON.stringify(markers);
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0}
.pin{width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.leaflet-tooltip{font:600 12px system-ui;padding:2px 6px}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var pts=${data};
var map=L.map('m',{zoomControl:false,attributionControl:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var b=[];
pts.forEach(function(p){
  var icon=L.divIcon({className:'',html:'<div class="pin" style="background:'+(p.color||'#0d7a4e')+'"></div>',iconSize:[20,20],iconAnchor:[10,10]});
  L.marker([p.lat,p.lng],{icon:icon}).addTo(map).bindTooltip(p.label||'',{permanent:true,direction:'top',offset:[0,-8]});
  b.push([p.lat,p.lng]);
});
if(b.length===1){map.setView(b[0],16);}else{map.fitBounds(b,{padding:[40,40],maxZoom:17});}
</script></body></html>`;
}
