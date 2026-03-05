const CACHE_NAME='presea-stock-pwa-v5';
const ASSETS=['./','./index.html','./app.js','./manifest.json','./icon-192.png','./icon-512.png','https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('./index.html')));return;}
  e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(resp=>{try{const u=new URL(r.url); if(u.origin===self.location.origin){caches.open(CACHE_NAME).then(c=>c.put(r,resp.clone()));}}catch(_){} return resp;}).catch(()=>cached)));
});
