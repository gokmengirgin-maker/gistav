(function () {
    console.log('🔧 Gistav engine.js v2 loaded!');

    const gistavMarkers = {}; // { id: { div, latlng, updatePos } }
    const pendingQueue = [];

    let cachedMap = null;

    function findMap() {
        if (cachedMap) return cachedMap;

        // Method 1: The standard Leaflet DOM way
        const containers = document.querySelectorAll('.leaflet-container');
        for (const el of containers) {
            if (el._leaflet_map) {
                cachedMap = el._leaflet_map;
                return cachedMap;
            }
        }

        // Method 2: Brute-Force Global Memory Scan
        // Scan the entire window object for something that looks like a Leaflet Map instance.
        // A Leaflet map exclusively has the unique coordinate conversion methods.
        // We use a try-catch block securely to avoid cross-origin proxy errors.
        for (const key in window) {
            try {
                const obj = window[key];
                if (obj && typeof obj === 'object') {
                    if (typeof obj.containerPointToLatLng === 'function' && 
                        typeof obj.latLngToContainerPoint === 'function' &&
                        typeof obj.getPanes === 'function') {
                        cachedMap = obj;
                        console.log('✅ Gistav: Map found in memory under window.' + key);
                        return cachedMap;
                    }
                    // Some platforms nest it under window.app.map or window.store.map
                    if (obj.map && typeof obj.map.containerPointToLatLng === 'function') {
                        cachedMap = obj.map;
                        return cachedMap;
                    }
                }
            } catch(e) { /* Ignore restricted cross-origin frames */ }
        }

        return null;
    }

    function addMarkerNow(detail) {
        const map = findMap();
        if (!map) {
            console.warn('Gistav: map not ready, queuing:', detail.id);
            pendingQueue.push(detail);
            return false;
        }

        try {
            const { x, y, id, text } = detail;

            // Convert screen (container) pixels to geographical coordinates
            const latlng = map.containerPointToLatLng([x, y]);
            console.log('Gistav: pinning to', latlng.lat.toFixed(6), latlng.lng.toFixed(6));

            // Create our styled label div
            const div = document.createElement('div');
            div.className = 'gistav-map-label';
            div.setAttribute('data-id', id);
            div.innerHTML = text + '<div class="gistav-map-dot"></div>';
            div.style.position = 'absolute';
            div.style.pointerEvents = 'auto';

            // Add directly to Leaflet's overlayPane
            // This pane's transform is managed by Leaflet, and latLngToLayerPoint() 
            // gives coordinates IN that pane's own coordinate system — so it's always correct.
            const overlayPane = map.getPanes().overlayPane;
            overlayPane.appendChild(div);

            // This function recalculates position in the pane's coordinate system
            function updatePos() {
                const pt = map.latLngToLayerPoint(latlng);
                div.style.left = pt.x + 'px';
                div.style.top  = pt.y + 'px';
            }

            updatePos();
            // Re-position on every map move/zoom event
            map.on('zoom move zoomend moveend viewreset', updatePos);

            gistavMarkers[id] = { div, latlng, updatePos, map };
            console.log('✅ Gistav marker pinned:', id);
            return true;
        } catch (err) {
            console.error('Gistav marker error:', err);
            return false;
        }
    }

    window.addEventListener('GISTAV_ADD_MARKER', (e) => {
        console.log('Gistav: ADD_MARKER event received', e.detail.id);
        addMarkerNow(e.detail);
    });

    window.addEventListener('GISTAV_CLEAR_MARKERS', () => {
        Object.values(gistavMarkers).forEach(({ div, updatePos, map }) => {
            try {
                div.remove();
                map.off('zoom move zoomend moveend viewreset', updatePos);
            } catch(e) {}
        });
        for (const k in gistavMarkers) delete gistavMarkers[k];
        pendingQueue.length = 0;
        console.log('Gistav: All markers cleared');
    });

    const activeSketches = [];

    function addSketchNow(latlngs) {
        const map = findMap();
        if (!map) return;
        try {
            const line = L.polyline(latlngs, {
                color: '#facc15',
                weight: 5,
                opacity: 0.9,
                dashArray: '1, 10'
            }).addTo(map);
            activeSketches.push(line);
        } catch(e) { console.error('Gistav: Redraw sketch error', e); }
    }

    window.addEventListener('GISTAV_REDRAW_SKETCH', (e) => {
        addSketchNow(e.detail);
    });

    window.addEventListener('GISTAV_CLEAR_SKETCHES', () => {
        activeSketches.forEach(s => s.remove());
        activeSketches.length = 0;
    });

    function initDrawHook(map) {
        if (map._gistav_hooked) return;
        map._gistav_hooked = true;
        map.on('draw:created', (e) => {
            const layer = e.layer;
            if (layer instanceof L.Polyline) {
                layer.setStyle({ color: '#facc15', weight: 5, opacity: 0.9 });
                const latlngs = layer.getLatLngs();
                window.dispatchEvent(new CustomEvent('GISTAV_SKETCH_CREATED', { detail: latlngs }));
                activeSketches.push(layer);
            }
        });
    }

    // Poll until map is available, then flush pending queue
    const readyInterval = setInterval(() => {
        const map = findMap();
        if (map) {
            clearInterval(readyInterval);
            console.log('✅ Gistav: Map found! Flushing queue:', pendingQueue.length, 'items');
            while (pendingQueue.length > 0) {
                addMarkerNow(pendingQueue.shift());
            }
            initDrawHook(map);
        }
    }, 300);

})();
