(function () {
    console.log('🔧 Gistav engine.js v8.0.0 loaded!');

    const gistavMarkers = {};
    const pendingQueue = [];

    let cachedMap = null;

    // ─── Map Finder ──────────────────────────────────────────────────────────
    function findMap() {
        if (cachedMap) return cachedMap;

        // Method 1: The standard Leaflet DOM way
        try {
            const containers = document.querySelectorAll('.leaflet-container');
            for (const el of containers) {
                if (el._leaflet_map) {
                    cachedMap = el._leaflet_map;
                    return cachedMap;
                }
            }
        } catch(e) {}

        // Method 2: Global Window scan
        for (const key in window) {
            try {
                const obj = window[key];
                if (obj && typeof obj === 'object') {
                    if (typeof obj.containerPointToLatLng === 'function' &&
                        typeof obj.latLngToContainerPoint === 'function' &&
                        typeof obj.getPanes === 'function') {
                        cachedMap = obj;
                        console.log('✅ Gistav: Map found under window.' + key);
                        return cachedMap;
                    }
                    if (obj.map && typeof obj.map.containerPointToLatLng === 'function') {
                        cachedMap = obj.map;
                        return cachedMap;
                    }
                }
            } catch(e) {}
        }
        return null;
    }

    // ─── RA Markers ──────────────────────────────────────────────────────────
    function addMarkerNow(detail) {
        const map = findMap();
        if (!map) { pendingQueue.push(detail); return false; }
        try {
            const { x, y, id, text } = detail;
            const latlng = map.containerPointToLatLng([x, y]);
            const div = document.createElement('div');
            div.className = 'gistav-map-label';
            div.setAttribute('data-id', id);
            div.innerHTML = text + '<div class="gistav-map-dot"></div>';
            div.style.position = 'absolute';
            div.style.pointerEvents = 'auto';
            const overlayPane = map.getPanes().overlayPane;
            overlayPane.appendChild(div);
            function updatePos() {
                const pt = map.latLngToLayerPoint(latlng);
                div.style.left = pt.x + 'px';
                div.style.top  = pt.y + 'px';
            }
            updatePos();
            map.on('zoom move zoomend moveend viewreset', updatePos);
            gistavMarkers[id] = { div, latlng, updatePos, map };
            return true;
        } catch (err) { console.error('Gistav marker error:', err); return false; }
    }

    window.addEventListener('GISTAV_ADD_MARKER', (e) => addMarkerNow(e.detail));

    window.addEventListener('GISTAV_CLEAR_MARKERS', () => {
        Object.values(gistavMarkers).forEach(({ div, updatePos, map }) => {
            try { div.remove(); map.off('zoom move zoomend moveend viewreset', updatePos); } catch(e) {}
        });
        for (const k in gistavMarkers) delete gistavMarkers[k];
        pendingQueue.length = 0;
    });

    // ─── Ready Interval ───────────────────────────────────────────────────────
    let mapWaitTicks = 0;
    const readyInterval = setInterval(() => {
        const map = findMap();
        if (map) {
            clearInterval(readyInterval);
            while (pendingQueue.length) addMarkerNow(pendingQueue.shift());
            console.log('✅ Gistav engine ready.');

            // --- Native Draw Listener ---
            try {
                map.on('draw:created', function (e) {
                    const type = e.layerType;
                    const layer = e.layer;
                    if (type === 'polyline') {
                        const latlngs = layer.getLatLngs();
                        // Convert LatLngs to Container Points (screen pixels relative to map)
                        const pts = latlngs.map(ll => {
                            const p = map.latLngToContainerPoint(ll);
                            return { x: p.x, y: p.y };
                        });
                        window.dispatchEvent(new CustomEvent('GISTAV_NATIVE_LINE', { 
                            detail: { points: pts } 
                        }));
                    }
                });

                // Periodic check for existing measure layers if any
                setInterval(() => {
                    const measureTips = document.querySelectorAll('.leaflet-tooltip-measure, .leaflet-measure-tooltip');
                    if (measureTips.length > 0) {
                        // Handled by content.js scraper too, but engine can see more
                    }
                }, 1000);
            } catch(e) {
                console.warn('Gistav: Native draw events not supported by this map instance.');
            }

        } else {
            mapWaitTicks++;
            if (mapWaitTicks % 10 === 0) console.log('⏳ Gistav: still waiting for map... (' + (mapWaitTicks*300/1000) + 's)');
        }
    }, 300);

})();
