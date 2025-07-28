// =========================================================================
// INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Correction : Leaflet n'est plus utilisé, on vérifie maplibregl et protomaps
    if (typeof maplibregl === 'undefined' || typeof protomaps === 'undefined') {
        document.getElementById('status-message').textContent = "❌ ERREUR : maplibre-gl.js ou protomaps.min.js non chargé.";
        return;
    }
    initializeApp();
});

// =========================================================================
// VARIABLES GLOBALES
// =========================================================================
let allCommunes = [];
let map; // Sera un objet MapLibre
let searchToggleControl;
let currentCommune = null;
let disabledAirports = new Set();
let waterAirports = new Set();
let dynamicMarkers = []; // Lignes et tooltips
let permanentMarkers = []; // Marqueurs de commune et aéroports
let fireMarker = null;

const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 },
    { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 },
    { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 },
    { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 },
    { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 },
    { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 },
    { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 },
    { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 },
    { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 },
    { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 },
    { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 },
    { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// NOUVEAU : Constante pour la déclinaison magnétique approximative en France
const MAGNETIC_DECLINATION_FRANCE = 1; // Approx. 1° Est pour la France métropolitaine (2024). Est est positif.

const toRad = deg => deg * Math.PI / 180;
const toDeg = rad => rad * 180 / Math.PI; // NOUVEAU : Utilitaire pour convertir les radians en degrés
const simplifyString = str => typeof str !== 'string' ? '' : str.toLowerCase().replace(/\bst\b/g, 'saint').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => { const R = 6371; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) / 1.852; };

// NOUVEAU : Fonction pour calculer le cap vrai (True Bearing)
/**
 * Calcule le cap initial (route vraie) entre deux points géographiques.
 * @returns {number} Le cap en degrés (0-360).
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const λ1 = toRad(lon1);
    const λ2 = toRad(lon2);

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);

    return (toDeg(θ) + 360) % 360; // Normalise sur 0-360
}

// NOUVEAU : Fonction pour calculer la route magnétique
/**
 * Calcule la route magnétique en appliquant une déclinaison fixe.
 * @returns {number} La route magnétique en degrés (0-360).
 */
function calculateMagneticHeading(lat1, lon1, lat2, lon2) {
    const trueBearing = calculateBearing(lat1, lon1, lat2, lon2);
    // Route Magnétique = Route Vraie - Déclinaison Est (+), ou + Déclinaison Ouest (-)
    // "East is least, West is best"
    let magneticHeading = trueBearing - MAGNETIC_DECLINATION_FRANCE;
    return (magneticHeading + 360) % 360; // Normalise sur 0-360
}


async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState();
    try {
        const response = await fetch('https://map-assets.s3.amazonaws.com/communes.json');
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        const data = await response.json();
        if (!data || !data.data) throw new Error("Format JSON invalide.");
        allCommunes = data.data.map(c => ({...c, normalized_name: simplifyString(c.nom_standard)}));
        statusMessage.style.display = 'none';
        searchSection.style.display = 'block';
        initMap();
        setupEventListeners();
    } catch (error) {
        statusMessage.textContent = `❌ Erreur de chargement des données: ${error.message}`;
        console.error(error);
        checkOfflineStatus();
    }
}

function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: './style.json',
        center: [2.3522, 48.8566],
        zoom: 5,
        minZoom: 4,
        maxZoom: 14,
        dragRotate: true,
        pitchWithRotate: true
    });

    map.on('load', () => {
        addPermanentMarkers();
        checkOfflineStatus();
        map.addControl(new maplibregl.NavigationControl());
        
        // Custom control to toggle search UI visibility
        class SearchToggleControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group search-toggle-container';
                this._container.innerHTML = `
                    <button class="search-toggle-button" title="Afficher/Masquer la recherche">🔍</button>
                    <div class="commune-display-control"></div>
                    <div class="version-display">v1.1</div>`;
                
                this._toggleButton = this._container.querySelector('.search-toggle-button');
                this._communeDisplay = this._container.querySelector('.commune-display-control');
                
                this._toggleButton.addEventListener('click', () => {
                    const ui = document.getElementById('ui-overlay');
                    ui.style.display = (ui.style.display === 'none') ? 'block' : 'none';
                });

                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
            updateCommuneName(name) {
                if (name) {
                    this._communeDisplay.textContent = name;
                    this._communeDisplay.style.display = 'block';
                } else {
                    this._communeDisplay.style.display = 'none';
                }
            }
        }
        searchToggleControl = new SearchToggleControl();
        map.addControl(searchToggleControl, 'top-left');
    });

    map.on('contextmenu', (e) => {
        if (fireMarker) {
            fireMarker.remove();
        }
        fireMarker = new maplibregl.Marker({ element: createMarkerElement('🔥', 'fire-marker') })
            .setLngLat(e.lngLat)
            .addTo(map);

        currentCommune = {
            nom_standard: "Départ de feu",
            code_postal: "",
            longitude: e.lngLat.lng,
            latitude: e.lngLat.lat
        };
        
        updateSelectedCommune(currentCommune);
    });
}

function addPermanentMarkers() {
    permanentMarkers.forEach(marker => marker.remove());
    permanentMarkers = [];
    airports.forEach(airport => {
        const isWater = waterAirports.has(airport.oaci);
        const isDisabled = disabledAirports.has(airport.oaci);

        let className = 'airport-marker-active';
        let content = '🛬';
        if (isWater) {
            className = 'airport-marker-water';
            content = '💧';
        }
        if (isDisabled) {
            className = 'airport-marker-disabled';
            content = '×';
        }
        
        const el = createMarkerElement(content, `custom-marker-icon airport-marker-base ${className}`);
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([airport.lon, airport.lat])
            .setPopup(createAirportPopup(airport))
            .addTo(map);
        permanentMarkers.push(marker);
    });
}

function createAirportPopup(airport) {
    const popupContent = document.createElement('div');
    popupContent.className = 'airport-popup';
    popupContent.innerHTML = `<strong>${airport.name} (${airport.oaci})</strong>`;
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'popup-buttons';
    
    const waterBtn = document.createElement('button');
    waterBtn.textContent = waterAirports.has(airport.oaci) ? 'Eau ❌' : 'Eau ✅';
    waterBtn.className = 'water-btn';
    waterBtn.onclick = () => {
        toggleAirportState(airport.oaci, 'water');
        marker.getPopup().remove();
    };

    const toggleBtn = document.createElement('button');
    if (disabledAirports.has(airport.oaci)) {
        toggleBtn.textContent = 'Activer';
        toggleBtn.className = 'enable-btn';
    } else {
        toggleBtn.textContent = 'Désactiver';
        toggleBtn.className = 'disable-btn';
    }
    toggleBtn.onclick = () => {
        toggleAirportState(airport.oaci, 'disabled');
        marker.getPopup().remove();
    };

    buttonsDiv.appendChild(waterBtn);
    buttonsDiv.appendChild(toggleBtn);
    popupContent.appendChild(buttonsDiv);

    const marker = permanentMarkers.find(m => {
        const lngLat = m.getLngLat();
        return lngLat.lat === airport.lat && lngLat.lng === airport.lon;
    });

    return new maplibregl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupContent);
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const clearSearch = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');

    searchInput.addEventListener('input', () => {
        const query = simplifyString(searchInput.value);
        clearSearch.style.display = searchInput.value ? 'block' : 'none';
        if (query.length < 2) {
            resultsList.style.display = 'none';
            return;
        }
        const filtered = allCommunes.filter(c => c.normalized_name.includes(query)).slice(0, 50);
        displayResults(filtered);
    });

    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        resultsList.style.display = 'none';
        clearSearch.style.display = 'none';
    });

    airportCountInput.addEventListener('change', () => {
        if (currentCommune) updateDynamicElements(currentCommune);
        saveState();
    });
}

function displayResults(communes) {
    const resultsList = document.getElementById('results-list');
    resultsList.innerHTML = '';
    if (communes.length === 0) {
        resultsList.style.display = 'none';
        return;
    }
    communes.forEach(commune => {
        const li = document.createElement('li');
        li.textContent = `${commune.nom_standard} (${commune.code_postal})`;
        li.addEventListener('click', () => {
            updateSelectedCommune(commune);
            resultsList.style.display = 'none';
            document.getElementById('search-input').value = '';
            document.getElementById('clear-search').style.display = 'none';
        });
        resultsList.appendChild(li);
    });
    resultsList.style.display = 'block';
}

function updateSelectedCommune(commune) {
    currentCommune = commune;
    if (fireMarker) {
        if (commune.nom_standard !== "Départ de feu") {
            fireMarker.remove();
            fireMarker = null;
        }
    }
    
    // Ajout ou mise à jour du marqueur de la commune
    const communeMarkerEl = createMarkerElement('📍', 'custom-marker-icon commune-marker');
    // Supprimer l'ancien marqueur de commune s'il existe
    const existingCommuneMarker = permanentMarkers.find(m => m.getElement().classList.contains('commune-marker'));
    if (existingCommuneMarker) {
        existingCommuneMarker.remove();
        permanentMarkers = permanentMarkers.filter(m => m !== existingCommuneMarker);
    }
    
    if (commune.nom_standard !== "Départ de feu") {
        const marker = new maplibregl.Marker({element: communeMarkerEl})
            .setLngLat([commune.longitude, commune.latitude])
            .addTo(map);
        permanentMarkers.push(marker);
    }

    map.flyTo({
        center: [commune.longitude, commune.latitude],
        zoom: 9,
        essential: true
    });
    searchToggleControl.updateCommuneName(commune.nom_standard);
    updateDynamicElements(commune);
    saveState();
}


function updateDynamicElements(commune) {
    clearDynamicElements();
    
    const communeLat = commune.latitude;
    const communeLon = commune.longitude;
    const airportCount = parseInt(document.getElementById('airport-count').value, 10);
    
    const activeAirports = airports.filter(a => !disabledAirports.has(a.oaci));

    activeAirports.forEach(airport => {
        airport.distance = calculateDistanceInNm(communeLat, communeLon, airport.lat, airport.lon);
    });

    activeAirports.sort((a, b) => a.distance - b.distance);
    const nearestAirports = activeAirports.slice(0, airportCount);

    const sourceData = {
        type: 'FeatureCollection',
        features: []
    };

    nearestAirports.forEach(airport => {
        const magneticHeading = calculateMagneticHeading(communeLat, communeLon, airport.lat, airport.lon);
        const headingStr = Math.round(magneticHeading).toString().padStart(3, '0');
        const distanceInNm = airport.distance;
        
        const lineFeature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[communeLon, communeLat], [airport.lon, airport.lat]]
            },
            properties: {
                label: `${distanceInNm.toFixed(1)} Nm / ${headingStr}°M`
            }
        };
        sourceData.features.push(lineFeature);
    });

    if (map.getSource('dynamic-lines')) {
        map.getSource('dynamic-lines').setData(sourceData);
    } else {
        map.addSource('dynamic-lines', {
            type: 'geojson',
            data: sourceData
        });
        map.addLayer({
            id: 'dynamic-lines-layer',
            type: 'line',
            source: 'dynamic-lines',
            paint: {
                'line-color': 'red',
                'line-width': 2,
                'line-dasharray': [5, 5]
            }
        });
        map.addLayer({
            id: 'dynamic-lines-labels',
            type: 'symbol',
            source: 'dynamic-lines',
            layout: {
                'symbol-placement': 'line-center',
                'text-field': ['get', 'label'],
                'text-size': 14,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-offset': [0, -0.8]
            },
            paint: {
                'text-color': '#333',
                'text-halo-color': 'rgba(255, 255, 255, 0.9)',
                'text-halo-width': 2
            }
        });
    }
}


function clearDynamicElements() {
    if (map.getSource('dynamic-lines')) {
        map.getSource('dynamic-lines').setData({type: 'FeatureCollection', features: []});
    }
}


function toggleAirportState(oaci, type) {
    const airportSet = (type === 'water') ? waterAirports : disabledAirports;
    if (airportSet.has(oaci)) {
        airportSet.delete(oaci);
    } else {
        airportSet.add(oaci);
    }
    addPermanentMarkers();
    if (currentCommune) updateDynamicElements(currentCommune);
    saveState();
}


function createMarkerElement(content, className) {
    const el = document.createElement('div');
    el.innerHTML = content;
    el.className = className;
    return el;
}

function saveState() {
    const state = {
        lastCommune: currentCommune,
        airportCount: document.getElementById('airport-count').value,
        disabledAirports: Array.from(disabledAirports),
        waterAirports: Array.from(waterAirports)
    };
    localStorage.setItem('navigationMapState', JSON.stringify(state));
}

function loadState() {
    const state = JSON.parse(localStorage.getItem('navigationMapState'));
    if (state) {
        document.getElementById('airport-count').value = state.airportCount || '3';
        disabledAirports = new Set(state.disabledAirports || []);
        waterAirports = new Set(state.waterAirports || []);
        if (state.lastCommune && map) {
            // Delay updating commune until map is loaded
            map.on('load', () => updateSelectedCommune(state.lastCommune));
        } else if (state.lastCommune) {
            // if map is not ready yet, queue it.
            const checkMap = setInterval(() => {
                if (map) {
                    map.on('load', () => updateSelectedCommune(state.lastCommune));
                    clearInterval(checkMap);
                }
            }, 100);
        }
    }
}

async function checkOfflineStatus() {
    const offlineStatusDiv = document.getElementById('offline-status');
    const requiredUrls = [
        './',
        './index.html',
        './style.css',
        './script.js',
        './maplibre-gl.js',
        './maplibre-gl.css',
        './protomaps.min.js',
        './style.json',
        'https://map-assets.s3.amazonaws.com/communes.json',
        'https://map-assets.s3.amazonaws.com/france.pmtiles'
    ];
    
    try {
        const cache = await caches.open('communes-vector-tile-cache-v4');
        const appCache = await caches.open('communes-app-cache-v32'); // <-- Mettre à jour avec la nouvelle version du cache
        
        let allOk = true;
        for (const url of requiredUrls) {
            const request = new Request(url, { cache: 'reload' });
            let response = await appCache.match(request.url);
            if (!response) {
                response = await cache.match(request.url);
            }
            if (!response) {
                allOk = false;
                console.warn(`Ressource non trouvée dans le cache : ${url}`);
                break;
            }
        }

        if (allOk) {
            offlineStatusDiv.textContent = '✅ Mode hors-ligne prêt';
            offlineStatusDiv.className = 'ready';
        } else {
            offlineStatusDiv.textContent = '⚠️ Mode hors-ligne incomplet';
            offlineStatusDiv.className = '';
        }
    } catch (e) {
        offlineStatusDiv.textContent = '❌ Erreur cache';
        offlineStatusDiv.className = '';
        console.error("Erreur lors de la vérification du cache", e);
    }
}
