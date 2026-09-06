/* ═══════════════════════════════════════════════════════════════
   HAYAI Mostrador — trabajador de servicio

   Esto es lo único que NO puede vivir dentro del HTML: el navegador
   exige que sea un archivo servido desde tu propio dominio.

   Ponlo al lado de prototipo.html, junto con manifest.webmanifest y
   icono.png, y el sistema se instala como aplicación y abre sin
   internet.  En el proyecto Next.js los cuatro van en public/.

   ══ PARA PUBLICAR UNA VERSIÓN NUEVA ══
   Sube el HTML y cambia VERSION aquí abajo. Eso es todo: el navegador
   revisa este archivo, ve que cambió, se descarga la versión nueva
   por detrás y el mostrador pregunta si quiere actualizarse. Hasta
   que la persona diga que sí, sigue trabajando con la que tiene.
   Si no cambias VERSION, nadie se entera de que hay algo nuevo.
   ═══════════════════════════════════════════════════════════════ */

const VERSION = "1.0.5";
const CACHE   = "hayai-mostrador-" + VERSION;

/* Lo que hace falta para abrir. Añade aquí lo que sirvas aparte. */
const BASICOS = [
  "./",
  "./prototipo.html",
  "./manifest.webmanifest",
  "./icono.png"
];

self.addEventListener("install", e => {
  /* Se guarda lo que se pueda: si algún archivo no está, la instalación
     no se cae por eso. Lo que NO se hace aquí es tomar el mando: el
     mostrador tiene que preguntar primero (ver el mensaje de abajo). */
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(BASICOS.map(u => c.add(u).catch(() => null))))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* El mostrador pregunta la versión y, cuando la persona acepta,
   manda la orden de relevo. Sin esa orden, esta copia espera. */
self.addEventListener("message", e => {
  const d = e.data || {};
  if(d.tipo === "SALTAR_ESPERA") self.skipWaiting();
  if(d.tipo === "QUE_VERSION" && e.ports && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  /* La tasa del BCV nunca se sirve de la caché: o llega fresca o no llega.
     El sistema ya sabe quedarse con la última conocida. */
  if(url.pathname.indexOf("/dolares") >= 0){
    e.respondWith(fetch(req));
    return;
  }

  /* El documento: primero la red, y si no hay, lo guardado.
     Así una versión nueva entra sola al recargar con internet. */
  if(req.mode === "navigate"){
    e.respondWith(
      fetch(req)
        .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match("./prototipo.html")))
    );
    return;
  }

  /* Tipografías y demás: primero lo guardado, y de fondo se refresca. */
  e.respondWith(
    caches.match(req).then(guardado => {
      const red = fetch(req).then(r => {
        if(r && r.status === 200){ const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return r;
      }).catch(() => guardado);
      return guardado || red;
    })
  );
});
