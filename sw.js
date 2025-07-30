// --- FICHIER sw.js COMPLET ET CORRIGÉ ---

const APP_CACHE_NAME = 'communes-app-cache-v4'; // Incrémentez si vous aviez déjà v2
const TILE_CACHE_NAME = 'communes-tile-cache-v1';
const DATA_CACHE_NAME = 'communes-data-cache-v1';

const APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './leaflet.min.js',
    './leaflet.css',
    './manifest.json'
];

const DATA_URLS = [
    './communes.json'
];

self.addEventListener('install', event => {
    console.log(`[SW] Installation ${APP_CACHE_NAME}`);
    event.waitUntil(
        Promise.all([
            caches.open(APP_CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS)),
            caches.open(DATA_CACHE_NAME).then(cache => cache.addAll(DATA_URLS))
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(cacheName => {
                if (cacheName !== APP_CACHE_NAME && cacheName !== TILE_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Stratégie pour les tuiles (inchangée, elle est correcte)
    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(err => {
                        // Si le réseau échoue, on ne fait rien, on a déjà servi le cache si possible
                        console.warn(`[SW] Échec du fetch pour la tuile : ${event.request.url}`, err);
                    });
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // Stratégie pour le reste de l'application (CORRIGÉE AVEC GESTION D'ERREUR)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si la ressource est dans le cache, on la sert. C'est le cas nominal.
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Si elle n'est pas dans le cache, on tente de la récupérer sur le réseau.
                return fetch(event.request).catch(error => {
                    // --- C'EST L'AJOUT CRUCIAL ---
                    // Cette partie s'exécute si le fetch échoue (ex: hors ligne).
                    console.log(`[SW] Échec du fetch, l'appareil est probablement hors ligne. URL: ${event.request.url}`);

                    // Si la requête qui a échoué était une requête de navigation...
                    if (event.request.mode === 'navigate') {
                        // ...on renvoie la page d'accueil de secours.
                        return caches.match('./index.html');
                    }
                    
                    // Pour les autres types de requêtes qui échouent (images, etc.),
                    // on peut renvoyer une réponse d'erreur générique pour ne pas planter.
                    // Renvoie une réponse vide avec un statut 404.
                    return new Response('', {
                        status: 404,
                        statusText: 'Not Found'
                    });
                });
            })
    );
});
