const CACHE_NAME = "guitar-minimal-motion-v2-audio-fast";
const FILES = ["./","./index.html","./style.css","./app.js","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install", e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES))); self.skipWaiting();});
self.addEventListener("activate", e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener("fetch", e=>{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});
