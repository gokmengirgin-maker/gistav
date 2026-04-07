(function () {
    console.log('🔧 Gistav engine.js v3 loaded!');

    const gistavMarkers = {};
    const pendingQueue = [];
    const activeSketches = []; // { section, layer }
    const pendingSketchesQueue = []; // sketches waiting for map to load

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

    // ─── Sketch (Persistent Lines) ───────────────────────────────────────────
    // Sketches are stored as { section, latlngs } objects.
    // latlngs is a plain array of { lat, lng } — JSON-serialisable, no L.LatLng objects.

    function latlngsToPlain(latlngs) {
        // Flatten nested arrays (L.Polygon has nested arrays)
        const flat = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        return flat.map(p => ({ lat: p.lat, lng: p.lng }));
    }

    function drawSketch(sketch) {
        const map = findMap();
        if (!map) { pendingSketchesQueue.push(sketch); return; }
        try {
            // Leaflet accepts an array of {lat, lng} natively, no need to map to L.latLng
            const line = L.polyline(sketch.latlngs, {
                color: '#facc15',
                weight: 6,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
            activeSketches.push({ section: sketch.section, layer: line, latlngs: sketch.latlngs });
            console.log('✅ Gistav: sketch drawn for section', sketch.section);
        } catch(e) { console.error('Gistav: drawSketch error (missing L namespace?)', e); }
    }

    // ─── Single postMessage handler (content.js → engine.js cross-world bridge) ─
    window.addEventListener('message', (e) => {
        if (!e.data || !e.data.type || !e.data.type.startsWith('GISTAV_')) return;
        const { type, section, latlngs } = e.data;

        if (type === 'GISTAV_REDRAW_SKETCH') {
            drawSketch({ section, latlngs });

        } else if (type === 'GISTAV_CLEAR_SKETCHES') {
            if (section !== undefined && section !== null) {
                for (let i = activeSketches.length - 1; i >= 0; i--) {
                    if (activeSketches[i].section === section) {
                        activeSketches[i].layer.remove();
                        activeSketches.splice(i, 1);
                    }
                }
            } else {
                activeSketches.forEach(s => s.layer.remove());
                activeSketches.length = 0;
            }

        } else if (type === 'GISTAV_COMMIT_SKETCHES') {
            const map = findMap();
            if (!map) return;
            for (let i = activeSketches.length - 1; i >= 0; i--) {
                const s = activeSketches[i];
                if (s.section !== 'pending') continue;
                
                // Do NOT remove and recreate. Just style the existing Leaflet.Draw layer.
                try {
                    s.layer.setStyle(SKETCH_STYLE);
                    // Force the geometry to be strictly on the map
                    if (!map.hasLayer(s.layer)) {
                        s.layer.addTo(map);
                    }
                    // Force SVG DOM updates
                    if (s.layer._path) {
                        s.layer._path.setAttribute('stroke', '#facc15');
                        s.layer._path.setAttribute('stroke-width', '6');
                        s.layer._path.setAttribute('stroke-opacity', '0.95');
                    }
                    
                    s.section = section;
                    activeSketches[i] = s;
                    console.log('✅ Gistav: yellow line committed for section', section);
                } catch(err) {
                    console.error('Gistav: failed to style committed sketch', err);
                }
            }
        }
    });

    const SKETCH_STYLE = { color: '#facc15', weight: 6, opacity: 0.95 };

    // ─── Draw Hook: track blue layer, send latlngs to content.js via postMessage ─
    function initDrawHook(map) {
        if (map._gistav_hooked) return;
        map._gistav_hooked = true;

        map.on('draw:created', (e) => {
            const layer = e.layer;
            if (!layer || typeof layer.getLatLngs !== 'function') return;

            const latlngs = latlngsToPlain(layer.getLatLngs());

            // Track as pending (still blue from Leaflet.Draw)
            activeSketches.push({ section: 'pending', layer, latlngs });

            // Tell content.js (isolated world) via postMessage
            window.postMessage({ type: 'GISTAV_SAVE_SKETCH', latlngs }, '*');
            console.log('🖊 Gistav: blue line drawn, awaiting Save...');
        });
    }

    // ─── Ready Interval ───────────────────────────────────────────────────────
    let mapWaitTicks = 0;
    const readyInterval = setInterval(() => {
        const map = findMap();
        if (map) {
            clearInterval(readyInterval);
            
            // Check if L exists for F5 redraw capabilities
            if (typeof L === 'undefined') {
                console.warn('⚠️ Gistav: Global Leaflet (L) is missing! F5 redraws might fail.');
                // Try to find it if possible
                if (window.leaflet) window.L = window.leaflet;
            }
            
            while (pendingQueue.length)         addMarkerNow(pendingQueue.shift());
            while (pendingSketchesQueue.length)  drawSketch(pendingSketchesQueue.shift());
            initDrawHook(map);
            console.log('✅ Gistav engine ready.');
        } else {
            mapWaitTicks++;
            if (mapWaitTicks % 10 === 0) console.log('⏳ Gistav: still waiting for map... (' + (mapWaitTicks*300/1000) + 's)');
        }
    }, 300);

})();


