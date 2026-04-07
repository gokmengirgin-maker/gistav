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

    // ─── Patch Draw Control for yellow color at draw time ────────────────────
    const SKETCH_STYLE = { color: '#facc15', weight: 6, opacity: 0.95 };

    function patchDrawControlColor(map) {
        // Scan map object for a Leaflet.Draw control
        try {
            for (const key in map) {
                const obj = map[key];
                if (obj && obj._toolbars && obj._toolbars.draw) {
                    const modes = obj._toolbars.draw._modes;
                    if (modes) Object.values(modes).forEach(mode => {
                        if (mode.handler && mode.handler.options)
                            mode.handler.options.shapeOptions = { ...SKETCH_STYLE };
                    });
                }
            }
        } catch(e) {}
        // Also scan window
        try {
            for (const k in window) {
                const obj = window[k];
                if (obj && obj._toolbars && obj._toolbars.draw) {
                    const modes = obj._toolbars.draw._modes;
                    if (modes) Object.values(modes).forEach(mode => {
                        if (mode.handler && mode.handler.options)
                            mode.handler.options.shapeOptions = { ...SKETCH_STYLE };
                    });
                }
            }
        } catch(e) {}
    }

    // ─── Draw Hook: intercept Leaflet.Draw events ────────────────────────────
    function initDrawHook(map) {
        if (map._gistav_hooked) return;
        map._gistav_hooked = true;

        patchDrawControlColor(map);
        map.on('draw:drawstart', () => patchDrawControlColor(map));

        map.on('draw:created', (e) => {
            const layer = e.layer;
            if (!layer || typeof layer.getLatLngs !== 'function') return;

            const latlngs = latlngsToPlain(layer.getLatLngs());

            // After Gustav site's own draw:created handler runs, restyle with yellow
            setTimeout(() => {
                try {
                    layer.setStyle(SKETCH_STYLE);
                    if (layer._path) {
                        layer._path.setAttribute('stroke', '#facc15');
                        layer._path.setAttribute('stroke-width', '6');
                        layer._path.setAttribute('stroke-opacity', '0.95');
                    }
                } catch(err) {}
            }, 50);

            // Send to content.js for IMMEDIATE storage via postMessage
            window.postMessage({ type: 'GISTAV_SAVE_SKETCH', latlngs }, '*');

            activeSketches.push({ section: 'pending', layer });
            console.log('🖊 Gistav: sketch captured & sent to storage');
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
