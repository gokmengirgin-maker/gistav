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
        const containers = document.querySelectorAll('.leaflet-container');
        for (const el of containers) {
            if (el._leaflet_map) { cachedMap = el._leaflet_map; return cachedMap; }
        }
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
            // Build proper L.LatLng array from plain objects
            const coords = sketch.latlngs.map(p => L.latLng(p.lat, p.lng));
            const line = L.polyline(coords, {
                color: '#facc15',
                weight: 6,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(map);
            activeSketches.push({ section: sketch.section, layer: line });
            console.log('✅ Gistav: sketch drawn for section', sketch.section);
        } catch(e) { console.error('Gistav: drawSketch error', e); }
    }

    window.addEventListener('GISTAV_REDRAW_SKETCH', (e) => drawSketch(e.detail));

    window.addEventListener('GISTAV_CLEAR_SKETCHES', (e) => {
        const sec = e.detail && e.detail.section;
        if (sec !== undefined && sec !== null) {
            for (let i = activeSketches.length - 1; i >= 0; i--) {
                if (activeSketches[i].section === sec) {
                    activeSketches[i].layer.remove();
                    activeSketches.splice(i, 1);
                }
            }
        } else {
            activeSketches.forEach(s => s.layer.remove());
            activeSketches.length = 0;
        }
    });

    // ─── Draw Hook: intercept Leaflet.Draw events ────────────────────────────
    function initDrawHook(map) {
        if (map._gistav_hooked) return;
        map._gistav_hooked = true;

        map.on('draw:created', (e) => {
            const layer = e.layer;
            if (!layer || typeof layer.getLatLngs !== 'function') return;

            // Apply our yellow style immediately using internal Leaflet method
            layer.options.color   = '#facc15';
            layer.options.weight  = 6;
            layer.options.opacity = 0.95;
            layer.addTo(map);   // add to map with our options
            layer.setStyle({ color: '#facc15', weight: 6, opacity: 0.95 });
            layer.redraw && layer.redraw();

            const latlngs = latlngsToPlain(layer.getLatLngs());

            // Tell content.js to save immediately — use postMessage since
            // engine.js runs in page world and content.js runs in isolated world.
            window.postMessage({ type: 'GISTAV_SAVE_SKETCH', latlngs }, '*');

            // Track locally as 'unsaved' (section assigned on Save)
            activeSketches.push({ section: 'pending', layer });
            console.log('🖊 Gistav: sketch drawn, sent to content.js for storage');
        });

        // Style also applied during drawing preview
        map.on('draw:drawstart', () => {
            // Inject CSS to override Leaflet.Draw's default blue style
            let s = document.getElementById('gistav-draw-style');
            if (!s) {
                s = document.createElement('style');
                s.id = 'gistav-draw-style';
                s.innerHTML = `
                    .leaflet-draw-guide-dash { border-color: #facc15 !important; }
                    path.leaflet-interactive[stroke="blue"],
                    path.leaflet-interactive[stroke="#3388ff"] {
                        stroke: #facc15 !important;
                        stroke-width: 6px !important;
                        stroke-opacity: 0.95 !important;
                    }
                `;
                document.head.appendChild(s);
            }
        });
    }

    // ─── Ready Interval ───────────────────────────────────────────────────────
    const readyInterval = setInterval(() => {
        const map = findMap();
        if (map) {
            clearInterval(readyInterval);
            while (pendingQueue.length)        addMarkerNow(pendingQueue.shift());
            while (pendingSketchesQueue.length) drawSketch(pendingSketchesQueue.shift());
            initDrawHook(map);
            console.log('✅ Gistav engine ready.');
        }
    }, 300);

})();
