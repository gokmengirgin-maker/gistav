/**
 * Gistav Aufmass Pro - v7.5.0 (Drift-Free Ultimate)
 * Features: Native Map Integration, Zero Lat/Lng Drift, Draggable Labels, PDF Mode.
 */

(function () {
    // --- MAIN WORLD INJECTION (Accessing Leaflet Map) ---
    function injectMasterEngine() {
        const script = document.createElement('script');
        script.className = 'gistav-engine';
        script.src = chrome.runtime.getURL('engine.js');
        script.onload = () => console.log("✅ Gistav Drift-Free engine injected successfully!");
        (document.head || document.documentElement).appendChild(script);
    }
    injectMasterEngine();

    'use strict';

    if (document.getElementById('gistav-aufmass-panel')) return;

    const STORAGE_RECORDS = 'gistav_aufmass_data_v2';
    const STORAGE_PROJECT = 'gistav_aufmass_project_v1';
    const STORAGE_MARKERS = 'gistav_aufmass_markers_v1';

    let records = [];
    let project = {
        nvt: 'NVT 80',
        baustelle: 'Neustraße + Bahnhofstraße',
        date: new Date().toISOString().slice(0, 10),
        type: 'Teilaufmaß',
        kolonne: 'Siyar Agit Kuzucu',
        section: 1,
        sub_section: 0
    };

    let addressesQueue = [];
    let currentAddrIdx = -1;
    let liveDist = "0.00";
    let lastMapClick = null;

    // --- Inject Marker Styles ---
    const style = document.createElement('style');
    style.innerHTML = `
        .gistav-map-label {
            position: absolute;
            background: #ef4444;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            z-index: 9999;
            pointer-events: auto;
            cursor: move;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            border: 1px solid white;
            white-space: nowrap;
            transform: translate(-50%, -100%);
            margin-top: -5px;
        }
        .gistav-map-label::after {
            content: '';
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            border-width: 5px 5px 0;
            border-style: solid;
            border-color: #ef4444 transparent transparent;
        }
        .gistav-map-dot {
            position: absolute;
            bottom: -14px;
            left: 50%;
            transform: translateX(-50%);
            width: 8px;
            height: 8px;
            background: #ef4444;
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 0 5px rgba(239, 68, 68, 0.8);
        }

        /* --- PDF MODE OVERLAY --- */
        #gistav-pdf-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: white;
            z-index: 99990;
        }
        #gistav-pdf-exit {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            background: #ef4444;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(239,68,68,0.5);
            display: none;
        }
        .gistav-map-fullscreen {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 99995 !important;
        }
        .gistav-map-label {
            z-index: 99999 !important;
        }

        /* --- PDF PRINT CLEANUP --- */
        @media print {
            #gistav-pdf-exit { display: none !important; }
            /* Hide our extension panel */
            #gistav-aufmass-panel, #gistav-aufmass-panel * {
                display: none !important;
            }
            
            /* Hide common UI menus from the Gustav website */
            .sidebar, .navbar, .header, .footer, .menu-container, 
            [class*="sidebar"], [class*="menu"], [class*="header"], [class*="navbar"], [class*="nav-"],
            [id*="sidebar"], [id*="menu"], [id*="header"], [id*="navbar"],
            .leaflet-control-container, .ui-layout-west, .ui-layout-north {
                display: none !important;
                visibility: hidden !important;
            }

            /* Ensure map is clean and takes full space */
            body, html {
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
            }

            .leaflet-container {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 1 !important;
                border: none !important;
            }

            /* Keep labels VISIBLE */
            #gistav-math-overlay, .gistav-map-label, .gistav-map-dot {
                display: block !important;
                visibility: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    `;
    document.head.appendChild(style);
    chrome.storage.local.get([STORAGE_RECORDS, STORAGE_PROJECT], (res) => {
        if (res[STORAGE_RECORDS]) records = res[STORAGE_RECORDS];
        if (res[STORAGE_PROJECT]) {
            project = { ...project, ...res[STORAGE_PROJECT] };
            document.getElementById('p-nvt').value = project.nvt;
            document.getElementById('p-bau').value = project.baustelle;
            document.getElementById('p-kol').value = project.kolonne;
            document.getElementById('p-sec').value = project.section;
        }
        updateDataView();
    });

    // --- Track Map Clicks for Point Markers ---
    document.addEventListener('mousedown', (e) => {
        const container = document.querySelector('.leaflet-container') || document.body;
        if (container.contains(e.target)) {
            lastMapClick = { x: e.clientX, y: e.clientY };
        }
    }, true);

    // --- Leistungskatalog ---
    const KATALOG = {
        "Graben & Tiefbau": [
            { id: "2.1.1", text: "Graben unbefestigt / Schotter", unit: "M" },
            { id: "2.1.2", text: "Graben Pflaster", unit: "M" },
            { id: "2.1.3", text: "Graben Asphalt", unit: "M" },
            { id: "2.1.4", text: "NVT stellen und aufbauen Tiefbau", unit: "ST" },
            { id: "2.1.5", text: "Muffenschacht errichten und Montage", unit: "ST" },
            { id: "2.1.6", text: "Herstellung einer Straßenkreuzung bis 8m", unit: "ST" },
            { id: "2.1.7", text: "Mitverlegung Yplay bis 3 Verbände", unit: "M" }
        ],
        "Hausanschluss": [
            { id: "2.2.1", text: "HA Pauschale bis 18m", unit: "ST" },
            { id: "2.2.2", text: "Zulage je weitere Mehrlänge", unit: "M" },
            { id: "2.2.3", text: "HA Pauschale für Kabeltechnik", unit: "ST" },
            { id: "2.2.4", text: "Durchführen einer OTDR-Messung", unit: "ST" },
            { id: "2.2.5", text: "HA-Bohrung/Einführung vorgestreckt", unit: "ST" }
        ],
        "Fiber & Installation": [
            { id: "2.3.1", text: "LWL-Kabel einblasen", unit: "M" },
            { id: "2.3.2", text: "Herstellen eines Spleißes je Stück", unit: "ST" },
            { id: "2.3.3", text: "Herstellen eines Kopfloches", unit: "ST" },
            { id: "2.3.4", text: "Muffenschacht errichten und Montage (alt)", unit: "ST" },
            { id: "2.3.5", text: "Spleißarbeiten Glasfasermuffe", unit: "ST" }
        ],
        "Zulagen & Nachträge": [
            { id: "2.4.1", text: "Zulage Bodenklasse 7 je 15cm", unit: "M" },
            { id: "2.4.2", text: "Zulage Tragschicht Beton/Asphalt 15cm", unit: "M" },
            { id: "2.4.3", text: "Zulage Mehrstärke Asphalt 6cm ab 12", unit: "M" },
            { id: "2.4.4", text: "Zulage Bodenaustausch je 10cm", unit: "M" },
            { id: "2.4.5", text: "Zulage Graben-Mehrtiefe je 10cm", unit: "M" },
            { id: "2.4.6", text: "Zulage Graben-Mehrbreite je 10cm", unit: "M" },
            { id: "2.4.7", text: "NTR: Bestandstrasse auf 60cm tiefer", unit: "M" },
            { id: "2.4.8", text: "NTR: Mehrlänge SQ ab 8m", unit: "M" },
            { id: "2.4.9", text: "NTR: Zulage weiterer Verband ab v4", unit: "M" },
            { id: "2.4.10", text: "NTR: Gartenmauerdurchbruch", unit: "ST" },
            { id: "2.4.11", text: "NTR: Stundensatz Bauleiter", unit: "STD" },
            { id: "2.4.12", text: "NTR: Spülbohrung Bentonitverfahren", unit: "M" },
            { id: "2.4.13", text: "NTR: Baustelleneinrichtung Anlage", unit: "ST" },
            { id: "2.4.14", text: "NTR: Umstellung Bohrgerät", unit: "ST" },
            { id: "2.4.15", text: "NTR: Oberflächensanierung Einsanden", unit: "QM" },
            { id: "2.4.16", text: "NTR: Zusätzliches Verdichten", unit: "QM" },
            { id: "2.4.17", text: "NTR: 2-Mann Kolonne", unit: "ST" },
            { id: "2.4.18", text: "NTR: 3-Mann Kolonne", unit: "ST" },
            { id: "2.4.19", text: "NTR: 4-Mann Kolonne", unit: "ST" },
            { id: "2.4.20", text: "NTR: 5-Mann Kolonne", unit: "ST" },
            { id: "2.4.21", text: "NTR: jeder weitere Mann", unit: "ST" },
            { id: "2.4.22", text: "NTR: Tagessatz 2 Mann + Sonde", unit: "ST" },
            { id: "2.4.24", text: "Stundensatz Monteur", unit: "STD" },
            { id: "2.4.25", text: "Tagespauschale Tageswagen", unit: "STD" }
        ]
    };

    // --- Create Main UI ---
    const panel = document.createElement('div');
    panel.id = 'gistav-aufmass-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h3>📏 GISTAV AUFMASS PRO v7.0.0</h3>
            <span id="min-btn">−</span>
        </div>
        <div class="tabs">
            <div class="tab active" data-t="pro">PROJECT</div>
            <div class="tab" data-t="nav">NAVIGATION</div>
            <div class="tab" data-t="auf">MEASURE</div>
            <div class="tab" data-t="dat">DATA</div>
        </div>
        <div class="panel-body">
            <!-- TAB: PROJEKT -->
            <div id="p-pro">
                <div class="grid-2">
                    <div><label>NVT</label><input id="p-nvt" value="${project.nvt}"></div>
                    <div><label>Datum</label><input type="date" id="p-date" value="${project.date}"></div>
                </div>
                <label>Baustelle / Ort</label>
                <input id="p-bau" value="${project.baustelle}">
                <div class="grid-2" style="margin-top:10px;">
                    <div><label>Typ</label><select id="p-type"><option value="Teilaufmaß" selected>Teilaufmaß</option><option value="Schlussaufmaß">Schlussaufmaß</option></select></div>
                    <div><label>Kolonne</label><input id="p-kol" value="${project.kolonne}"></div>
                </div>
                <div class="grid-2" style="margin-top:10px;">
                   <div><label>Aktuelle Section</label><input type="number" id="p-sec" value="${project.section}"></div>
                   <div style="display:flex; align-items:flex-end;"><button id="btn-save-pro" class="btn-p">PROJEKT AKTUALISIEREN</button></div>
                </div>
            </div>

            <!-- TAB: NAVIGATION -->
            <div id="p-nav" style="display:none">
                <label>CSV Liste laden</label>
                <input type="file" id="csv-in" accept=".csv">
                <div class="highlight-info" style="margin-top:10px;">
                    <label style="color:var(--accent)">CSV Status:</label>
                    <div id="addr-cur" class="info-txt">Warten auf Datei...</div>
                </div>
                <button id="btn-next" class="btn-p" style="margin-top:10px;" disabled>NÄCHSTE ADRESSE ANFAHREN</button>
            </div>

            <!-- TAB: AUFMASS -->
            <div id="p-auf" style="display:none">
                <div style="margin-bottom:12px;">
                    <label style="color:#22d3ee; font-size:11px;">📍 Adresse / Hausnummer</label>
                    <input type="text" id="manual-addr" placeholder="z.B. Meisenweg 5A" style="font-weight:bold; color:#fff; font-size:14px;">
                    <small style="color:#64748b; font-size:9px; display:block; margin-top:3px;">Adresse ändern = Neue RA-Section</small>
                </div>

                <div class="measure-display">
                    <div class="unit-lbl">Gistav Live Line</div>
                    <div class="live-val" id="dist-val">0.00</div>
                    <div class="unit-lbl">Meter (M)</div>
                </div>

                <div class="grid-3">
                    <div><label>Faktor (F)</label><input type="number" id="val-f" value="1.0" min="0.1" step="0.5"></div>
                    <div><label>Breite (B)</label><input type="number" id="val-b" placeholder="0.40" value="0.40" min="0" step="0.05"></div>
                    <div><label>Tiefe (T)</label><input type="number" id="val-t" placeholder="0.90" value="0.90" min="0" step="0.05"></div>
                </div>

                <div class="grid-2" style="margin-top:10px;">
                    <button id="btn-ha-split" class="btn-s">🏠 HA SPLIT</button>
                    <button id="btn-sq-split" class="btn-s">🛣️ SQ SPLIT</button>
                </div>

                <label style="margin-top:10px;">Position auswählen:</label>
                <select id="sel-pos"></select>

                <div id="zulage-container" style="margin-top:12px; display:none; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px dashed rgba(255,255,255,0.1);">
                    <label style="color:#22d3ee; font-size:10px; margin-bottom:5px; display:block;">✚ EK-ZULAGE OPTIONEN</label>
                    <div id="zulage-slots" style="display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <button id="btn-save" class="btn-p" style="margin-top:15px; height:45px; font-size:13px; background:#06b6d4;">EINTRAG SPEICHERN</button>
            </div>

            <!-- TAB: DATEN -->
            <div id="p-dat" style="display:none">
                <div id="records-list" style="max-height:280px; overflow-y:auto; margin-bottom:15px;"></div>
                <div class="grid-2">
                    <button id="btn-dl" class="btn-p">CSV EXPORT</button>
                    <button id="btn-clr" class="btn-d">RESET</button>
                </div>
                <button id="btn-pdf-mode" class="btn-p" style="margin-top:10px; background: linear-gradient(135deg,#7c3aed,#4f46e5); height:42px; font-size:12px; letter-spacing:1px;">🖨️ PDF MODUS (Yazdır)</button>
            </div>
        </div>
        <div class="status-footer" id="msg">Bereit v7.0.0 Ultimate</div>
    `;
    document.body.appendChild(panel);

    // --- Zulage Configuration ---
    const ZULAGE_OPTS = {
        graben: [
            { id: "2.4.1", text: "Zulage Bodenklasse 7" },
            { id: "2.4.2", text: "Zulage Tragschicht B/A" },
            { id: "2.4.3", text: "Zulage Mehrstärke Asphalt" },
            { id: "2.4.4", text: "Zulage Bodenaustausch" },
            { id: "2.4.5", text: "Zulage Graben-Mehrtiefe" },
            { id: "2.4.6", text: "Zulage Graben-Mehrbreite" },
            { id: "2.3.3", text: "Herstellen eines Kopfloches", unit: "ST" }
        ],
        ha_extras: [
            { id: "2.2.5", text: "HA-Bohrung/Einführung", unit: "ST" },
            { id: "2.3.3", text: "Herstellen eines Kopfloches", unit: "ST" },
            { id: "2.4.10", text: "NTR: Gartenmauerdurchbruch", unit: "ST" }
        ],
        verband: ["1Verband", "2Verband", "3Verband", "4Verband", "5Verband", "6Verband", "7Verband", "8Verband", "9Verband", "10Verband"]
    };

    // --- Fill Catalog Droppdown ---
    const selPos = document.getElementById('sel-pos');
    Object.keys(KATALOG).forEach(cat => {
        const group = document.createElement('optgroup');
        group.label = cat;
        KATALOG[cat].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = `${p.id} - ${p.text} (${p.unit})`;
            opt.dataset.unit = p.unit;
            group.appendChild(opt);
        });
        selPos.appendChild(group);
    });

    // --- Dynamic Zulage UI ---
    const zulCont = document.getElementById('zulage-container');
    const zulSlots = document.getElementById('zulage-slots');

    function createZulSelect(label, options, isSimpleArr = false) {
        const wrap = document.createElement('div');
        wrap.style.display = "flex";
        wrap.style.gap = "5px";
        wrap.style.marginBottom = "4px";

        const sel = document.createElement('select');
        sel.className = label === 'Verband' ? 'zul-verband-select' : 'zul-extra-select';
        sel.style.flex = "1";
        sel.style.fontSize = "11px";
        sel.style.padding = "4px";

        const factorIn = document.createElement('input');
        factorIn.type = "number";
        factorIn.className = "zul-extra-factor";
        factorIn.value = "1.0";
        factorIn.step = "0.1";
        factorIn.min = "0.1";
        factorIn.style.width = "45px";
        factorIn.style.display = "none";
        factorIn.style.fontSize = "11px";
        factorIn.style.padding = "4px";
        factorIn.style.background = "#1e293b";
        factorIn.style.border = "1px solid #334155";
        factorIn.style.color = "#fff";
        factorIn.title = "Zulage Faktor (F)";

        const def = document.createElement('option');
        def.value = "";
        def.innerText = `-- ${label} wählen --`;
        sel.appendChild(def);

        options.forEach(o => {
            const opt = document.createElement('option');
            const unit = o.unit || "M";
            opt.value = isSimpleArr ? o : o.id;
            opt.innerText = isSimpleArr ? o : `${o.id} - ${o.text}`;
            opt.dataset.unit = unit;
            sel.appendChild(opt);
        });

        sel.onchange = () => {
            const needsF = ['2.4.1', '2.4.2', '2.4.3', '2.4.4'].includes(sel.value);
            factorIn.style.display = needsF ? "block" : "none";
        };

        wrap.appendChild(sel);
        wrap.appendChild(factorIn);
        return wrap;
    }

    selPos.onchange = () => {
        const val = selPos.value;
        const isGraben = ['2.1.1', '2.1.2', '2.1.3', '2.1.7', '2.1.6'].includes(val);
        const isHA = (val === '2.2.1');
        const isStandaloneHA = ['2.2.5', '2.3.3', '2.4.10'].includes(val);
        zulSlots.innerHTML = "";

        if (isGraben) {
            manualAddrInput.value = "";
            lastAddrVal = "";
            zulCont.style.display = "block";
            // Separate Verband dropdown
            zulSlots.appendChild(createZulSelect("Verband", ZULAGE_OPTS.verband, true));
            
            // 5 Zulage dropdowns as requested
            for (let i = 1; i <= 5; i++) {
                zulSlots.appendChild(createZulSelect(`Zulage ${i}`, ZULAGE_OPTS.graben));
            }
        } else if (isHA || isStandaloneHA) {
            zulCont.style.display = "block";
            for (let i = 1; i <= 5; i++) {
                zulSlots.appendChild(createZulSelect(`HA Option ${i}`, ZULAGE_OPTS.ha_extras));
            }
        } else {
            zulCont.style.display = "none";
        }
    };

    // --- UI Controls & Draggable ---
    let isDragging = false, offsetX, offsetY;
    const header = panel.querySelector('.panel-header');
    header.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.transition = 'none';
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
    };
    document.onmouseup = () => isDragging = false;
    document.getElementById('min-btn').onclick = () => panel.classList.toggle('minimized');

    // --- Manual Address Handling ---
    const manualAddrInput = document.getElementById('manual-addr');
    let lastAddrVal = "";

    // Reset sub_section when user manually changes the address (optional but keeps things clean)
    manualAddrInput.addEventListener('change', () => {
        const val = manualAddrInput.value.trim();
        if (val && val !== lastAddrVal && records.length > 0) {
            project.sub_section = 0;
            // No longer auto-incrementing section here because we do it on Save
            syncProject();
            setMsg("Neue Adresse erkannt!", "success");
        }
        lastAddrVal = val;
    });

    // --- Live Distance Scraper ---
    setInterval(() => {
        // Limit search to map container if possible
        const container = document.querySelector('.leaflet-container') || document.body;
        // EXACT match for your provided DOM element alongside normal tooltip catching
        const tooltips = container.querySelectorAll(
            '[class*="tooltip"], [class*="measure"], [class*="popup"], [class*="result"], .leaflet-interactive, span.whitespace-nowrap'
        );

        let foundDist = null;

        for (let tt of tooltips) {
            const text = tt.innerText || tt.textContent;
            if (!text) continue;

            const lower = text.toLowerCase();
            if (lower.includes('m') || lower.includes('km')) {
                // Matches "12.50 m", "12 m", "1,2 km" etc.
                const matches = lower.match(/(?:[a-z:= ]+)?(\d+(?:[.,]\d+)?)\s*(m|km)/i);
                if (matches) {
                    let val = parseFloat(matches[1].replace(',', '.'));
                    if (matches[2] === 'km') val = val * 1000;
                    if (val > 0) {
                        foundDist = val.toFixed(2);
                    }
                }
            }
        }

        if (foundDist !== null && !isNaN(foundDist)) {
            liveDist = foundDist;
            document.getElementById('dist-val').innerText = foundDist.replace('.', ',');
        }
    }, 200);

    // --- Tab Switching ---
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const target = t.dataset.t;
        ['pro', 'nav', 'auf', 'dat'].forEach(id => document.getElementById('p-' + id).style.display = (target === id ? 'block' : 'none'));
        if (target === 'dat') updateDataView();
    });

    // --- Core Functions ---
    function setMsg(txt, cls = "") {
        const m = document.getElementById('msg');
        m.innerText = txt;
        m.className = "status-footer " + (cls || (txt.includes('✅') ? "success" : ""));
    }

    function updateDataView() {
        const list = document.getElementById('records-list');
        list.innerHTML = "";
        
        // Track original index for deletion logic
        const indexedRecords = records.map((r, idx) => ({ ...r, _idx: idx }));
        const displayList = indexedRecords.slice(-50).reverse();

        displayList.forEach((r) => {
            const div = document.createElement('div');
            div.className = 'record-item';
            div.innerHTML = `<div class="rec-row">
                                <span class="rec-id">RA ${r.ra} [${r.id}]</span> 
                                <div style="display:flex; align-items:center;">
                                    <span class="rec-addr">${r.address.split(',')[0]}</span>
                                    <span class="btn-delete-rec" data-idx="${r._idx}" title="Eintrag löschen">🗑️</span>
                                </div>
                             </div>
                             <div class="rec-row" style="margin-top:2px;">
                                <span>${r.desc.slice(0, 35)}</span> 
                                <b style="color:#fff">${String(r.val).replace('.', ',')} ${r.unit}</b>
                             </div>`;
            
            const delBtn = div.querySelector('.btn-delete-rec');
            delBtn.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(delBtn.dataset.idx);
                const sectionToDelete = parseInt(records[idx].ra);
                
                if (confirm(`RA ${sectionToDelete} grubuna ait tüm verileri ve çizimi silmek istiyor musunuz?`)) {
                    // Delete all records of this section
                    records = records.filter(rec => parseInt(rec.ra) !== sectionToDelete);
                    // Delete all sketches of this section
                    sketches = sketches.filter(s => s.section !== sectionToDelete);
                    
                    window.dispatchEvent(new CustomEvent('GISTAV_CLEAR_SKETCHES', { detail: { section: sectionToDelete } }));
                    
                    chrome.storage.local.set({ 
                        [STORAGE_RECORDS]: records,
                        [STORAGE_SKETCHES]: sketches
                    }, () => {
                        updateDataView();
                        setMsg(`RA ${sectionToDelete} silindi`, "danger");
                    });
                }
            };
            list.appendChild(div);
        });
    }

    function saveEntry(mode, distOverride = null) {
        const addr = manualAddrInput.value.trim();
        const mainPosValue = selPos.value;
        const isHA_Main = (mode === 'HA' || (mode === 'CUSTOM' && mainPosValue === '2.2.1'));
        const isSQ_Main = (mode === 'SQ' || (mode === 'CUSTOM' && mainPosValue === '2.1.6'));

        if (!addr && isHA_Main) {
            manualAddrInput.style.border = "1px solid #ef4444";
            return setMsg("FEHLER: Bitte Adresse eingeben!", "danger");
        }
        manualAddrInput.style.border = "1px solid #334155";
        lastAddrVal = addr; 

        let d = parseFloat(distOverride || liveDist);
        let f = parseFloat(document.getElementById('val-f').value) || 1.0;
        let b = document.getElementById('val-b').value || "0.40";
        let t = document.getElementById('val-t').value || "0.90";

        let subitems = [];
        const timestamp = new Date().toLocaleString('de-DE');

        const vSel = document.querySelector('.zul-verband-select');
        const vVal = vSel ? vSel.value : "";

        if (isHA_Main) {
            const descMain = "HA Pauschale bis 18m";
            const descExtra = "Zulage je weitere Mehrlänge";
            if (d > 18) {
                const restHA = (d - 18).toFixed(2);
                subitems.push({ id: "2.2.1", val: 1, unit: "ST", f: 1.0, d: "18.00", b: b, t: t, desc: descMain, address: vVal });
                subitems.push({ id: "2.2.2", val: restHA, unit: "M", f: 1.0, b: b, t: t, d: restHA, desc: descExtra, address: vVal });
            } else {
                subitems.push({ id: "2.2.1", val: 1, unit: "ST", f: 1.0, d: d.toFixed(2), b: b, t: t, desc: descMain, address: vVal });
            }
        } else if (isSQ_Main) {
            const descMain = "Herstellung einer Straßenkreuzung bis 8m";
            const descExtra = "NTR: Mehrlänge SQ ab 8m";
            if (d > 8) {
                const restSQ = (d - 8).toFixed(2);
                subitems.push({ id: "2.1.6", val: 1, unit: "ST", f: 1.0, d: "8.00", b: b, t: t, desc: descMain });
                subitems.push({ id: "2.4.8", val: restSQ, unit: "M", f: 1.0, b: b, t: t, d: restSQ, desc: descExtra });
            } else {
                subitems.push({ id: "2.1.6", val: 1, unit: "ST", f: 1.0, d: d.toFixed(2), b: b, t: t, desc: descMain });
            }

            // --- SQ Verband Calculation ---
            if (vVal && vVal.includes("Verband")) {
                const bCount = parseInt(vVal.replace("Verband", ""));
                if (bCount > 3) {
                    const extraB = bCount - 3;
                    subitems.push({ id: "2.4.9", val: (d * extraB).toFixed(2), unit: "M", f: extraB, b: "", t: "", d: d.toFixed(2), desc: "Zulage weiterer Verband ab v4", address: vVal });
                }
            }
        } else {
            const opt = selPos.options[selPos.selectedIndex];
            const unit = opt.dataset.unit;
            let menge = 0;
            if (unit === 'M') menge = (f * d).toFixed(2);
            else if (unit === 'QM') menge = (f * d * parseFloat(b)).toFixed(2);
            else if (unit === 'ST' || unit === 'STD') menge = f;

            subitems.push({ id: opt.value, val: menge, unit: unit, f: f, b: b, t: t, d: d.toFixed(2), desc: opt.innerText, address: vVal });

            const isGrabenMain = ['2.1.1', '2.1.2', '2.1.3', '2.1.7'].includes(opt.value);
            const tNum = parseFloat(t);
            const bNum = parseFloat(b);

            if (isGrabenMain) {
                if (tNum > 0.60) {
                    const tSteps = Math.round((tNum - 0.60) * 10);
                    if (tSteps > 0) subitems.push({ id: "2.4.5", val: (d * tSteps).toFixed(2), unit: "M", f: tSteps, b: "", t: t, d: d.toFixed(2), desc: "Zulage Graben-Mehrtiefe", address: vVal });
                }
                if (bNum > 0.30) {
                    const bSteps = Math.round((bNum - 0.30) * 10);
                    if (bSteps > 0) subitems.push({ id: "2.4.6", val: (d * bSteps).toFixed(2), unit: "M", f: bSteps, b: b, t: "", d: d.toFixed(2), desc: "Zulage Graben-Mehrbreite", address: vVal });
                }
                if (vVal && vVal.includes("Verband")) {
                    const bCount = parseInt(vVal.replace("Verband", ""));
                    if (bCount > 3) {
                        const extraB = bCount - 3;
                        subitems.push({ id: "2.4.9", val: (d * extraB).toFixed(2), unit: "M", f: extraB, b: "", t: "", d: d.toFixed(2), desc: "Zulage weiterer Verband ab v4", address: vVal });
                    }
                }
            }
        }

        const extras = document.querySelectorAll('.zul-extra-select');
        extras.forEach(sel => {
            if (sel.value) {
                const extraId = sel.value;
                const optExtra = sel.options[sel.selectedIndex];
                const extraUnit = optExtra.dataset.unit || "M";
                
                const factorIn = sel.parentElement.querySelector('.zul-extra-factor');
                let extraF = 1.0;
                if (factorIn && factorIn.style.display !== 'none') {
                    extraF = parseFloat(factorIn.value) || 1.0;
                }

                let extraText = "Zulage";
                [...ZULAGE_OPTS.graben, ...ZULAGE_OPTS.ha_extras].forEach(o => { if (o.id === extraId) extraText = o.text; });
                
                const totalF = f * extraF;
                let extraMenge = (extraUnit === 'M') ? (totalF * d).toFixed(2) : totalF.toFixed(2);
                subitems.push({ id: extraId, val: extraMenge, unit: extraUnit, f: totalF, b: b, t: t, d: d.toFixed(2), desc: extraText, address: vVal });
            }
        });

        try {
            project.sub_section = 0; // Reset for each new measurement (line/point)
            
            subitems.forEach((it) => {
                project.sub_section++;
                const MathRA = `${project.section}.${String(project.sub_section).padStart(2, '0')}`;
                const isPiece = (it.unit === 'ST' || it.unit === 'STD');
                const isSQ = (it.id === '2.1.6');

                let finalAddr = addr;
                if (it.address && it.address !== addr) finalAddr = addr ? `${addr} / ${it.address}` : it.address;
                if (it.id === '2.1.6' || it.id === '2.4.8') finalAddr = addr ? `SQ für ${addr}` : "SQ";

                records.push({
                    ...it,
                    d: (isPiece && !isSQ) ? "" : it.d,
                    b: (isPiece && !isSQ) ? "" : it.b,
                    t: (isPiece && !isSQ) ? "" : it.t,
                    address: finalAddr,
                    time: timestamp,
                    nvt: project.nvt,
                    ra: MathRA
                });
            });

            if (subitems.length > 0) {
                // RA label on map
                dropRAMarker(project.section);
            }

            setMsg("✅ GESPEICHERT!", "success");
            
            // Advance to next whole number for the next measurement
            project.section++;
            document.getElementById('p-sec').value = project.section;
            
            chrome.storage.local.set({ [STORAGE_RECORDS]: records }, () => {
                syncProject(); 
                setTimeout(() => setMsg(`v7.5.0 Dashboard`), 2000);
            });
        } catch (err) {
            console.error(err);
            setMsg("FEHLER: " + err.message, "danger");
        }
    }

    document.getElementById('btn-save').onclick = () => saveEntry('CUSTOM');
    document.getElementById('btn-ha-split').onclick = () => saveEntry('HA');
    document.getElementById('btn-sq-split').onclick = () => saveEntry('SQ');

    document.getElementById('btn-dl').onclick = () => {
        if (!records.length) return alert("Keine Datensätze vorhanden!");
        const toDE = (val) => String(val || "0.00").replace('.', ',');
        const nvtVal = document.getElementById('p-nvt').value || project.nvt || "EXPORT";
        const dateVal = document.getElementById('p-date').value || project.date || new Date().toISOString().slice(0, 10);
        const fileNameSafe = nvtVal.trim().replace(/[^a-z0-9]/gi, '_');

        let csv = "\ufeffZeil;RA-Absch.;Leistung;Fakt;Länge;Breite;Tiefe;Menge;M;Leistungskurztext;Bemerkung zur Leistungsposition;Export-Timestamp\n";
        records.forEach((r, idx) => {
            const zeil = (idx + 1) * 10;
            csv += `"${zeil}";"=""${r.ra}""";"=""${r.id}""";"${toDE(r.f)}";"${toDE(r.d)}";"${toDE(r.b)}";"${toDE(r.t)}";"${toDE(r.val)}";"${r.unit}";"${r.desc}";"${r.address}";"${r.time}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Kocaman_Aufmass_${fileNameSafe}_${dateVal}.csv`;
        a.click();
    };

    document.getElementById('btn-clr').onclick = () => {
        if (confirm("Alle Datensätze löschen?")) {
            records = []; project.section = 1; project.sub_section = 0;
            document.getElementById('p-sec').value = 1;
            clearMarkers();
            chrome.storage.local.set({ 
                [STORAGE_RECORDS]: [], 
                [STORAGE_PROJECT]: project 
            }, updateDataView);
        }
    };

    // --- Sync Project Logic ---
    function syncProject() {
        chrome.storage.local.set({ [STORAGE_PROJECT]: project });
    }

    function syncMarkers() {
        chrome.storage.local.set({ [STORAGE_MARKERS]: localMarkers });
    }

    // --- Map Label Logic ---
    // --- PURE MATH DRIFT-FREE ENGINE (No Leaflet instance required) ---
    const localMarkers = {}; 
    let renderLoopActive = false;

    // Grab any visible map tile image to use as an absolute geographical reference
    function getTileAnchorInfo() {
        const tiles = document.querySelectorAll('img');
        for (const tile of tiles) {
            // Match standard XYZ tile URLs (e.g. /19/271168/172288.png)
            const match = (tile.src || '').match(/\/(\d{1,2})\/(\d+)\/(\d+)(?:\.png|\.jpg|\.jpeg|@2x|\?)/i);
            if (match) {
                const rect = tile.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10 && rect.left < window.innerWidth && rect.top < window.innerHeight) {
                    return { z: parseInt(match[1]), tx: parseInt(match[2]), ty: parseInt(match[3]), rect: rect };
                }
            }
        }
        return null; // Map not fully loaded yet
    }

    // Convert screen pixels to 0.0-1.0 absolute World Coordinates using the anchor tile
    function screenToWorld(px, py, anchor) {
        const pctX = (px - anchor.rect.left) / anchor.rect.width;
        const pctY = (py - anchor.rect.top) / anchor.rect.height;
        const absX = anchor.tx + pctX;
        const absY = anchor.ty + pctY;
        return {
            worldX: absX / Math.pow(2, anchor.z),
            worldY: absY / Math.pow(2, anchor.z)
        };
    }

    // Convert absolute World Coordinates back to screen pixels using current anchor tile
    function worldToScreen(worldX, worldY, anchor) {
        const absX = worldX * Math.pow(2, anchor.z);
        const absY = worldY * Math.pow(2, anchor.z);
        const pctX = absX - anchor.tx;
        const pctY = absY - anchor.ty;
        return {
            px: anchor.rect.left + (pctX * anchor.rect.width),
            py: anchor.rect.top + (pctY * anchor.rect.height)
        };
    }

    function startRenderLoop() {
        if (renderLoopActive) return;
        renderLoopActive = true;
        
        let overlay = document.getElementById('gistav-math-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'gistav-math-overlay';
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:200000; overflow:hidden;';
            document.body.appendChild(overlay);
        }

        let activeAnchor = null;

        function loop() {
            activeAnchor = getTileAnchorInfo();
            if (activeAnchor) {
                const anchor = activeAnchor;
                
                // Calculate a scale factor based on zoom (z=19 is standard/big, z=15 is small)
                const scale = Math.max(0.7, Math.min(1.0, 1.0 - (19 - anchor.z) * 0.08));

                for (const [id, m] of Object.entries(localMarkers)) {
                    let el = document.getElementById(id);
                    if (!el) {
                        el = document.createElement('div');
                        el.id = id;
                        el.className = 'gistav-map-label';
                        el.innerHTML = m.text + '<div class="gistav-map-dot"></div>';
                        el.style.position = 'absolute';
                        el.style.pointerEvents = 'auto';
                        el.style.userSelect = 'none';
                        el.style.cursor = 'move';
                        
                        el.onmousedown = (e) => {
                            e.stopPropagation();
                            el.style.opacity = "0.7";
                            const onMove = (mv) => {
                                if (activeAnchor) {
                                    const w = screenToWorld(mv.clientX, mv.clientY, activeAnchor);
                                    m.worldX = w.worldX;
                                    m.worldY = w.worldY;
                                }
                            };
                            const onUp = () => {
                                el.style.opacity = "1.0";
                                window.removeEventListener('mousemove', onMove);
                                window.removeEventListener('mouseup', onUp);
                                syncMarkers(); // Save new positions after drag
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        };
                        overlay.appendChild(el);
                    }
                    const screenPos = worldToScreen(m.worldX, m.worldY, anchor);
                    el.style.left = screenPos.px + 'px';
                    el.style.top = screenPos.py + 'px';
                    // Apply zoom-based scaling while preserving text alignment
                    el.style.transform = `translate(-50%, -100%) scale(${scale})`;
                }
            }
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    function dropRAMarker(raText) {
        const anchor = getTileAnchorInfo();
        if (!anchor) {
            setMsg("FEHLER: Harita yüklenmedi, etiket atılamadı!", "danger");
            return;
        }

        const container = document.querySelector('.leaflet-container') || document.body;
        const cRect = container.getBoundingClientRect();
        let x = 0, y = 0;

        // Strategy 1: Active measurement tooltip
        const tooltips = container.querySelectorAll('[class*="tooltip"], [class*="measure"], .leaflet-tooltip');
        let activeTT = null;
        tooltips.forEach(tt => { if (tt.innerText.includes('m') && tt.offsetWidth > 0) activeTT = tt; });

        if (activeTT) {
            const r = activeTT.getBoundingClientRect();
            x = r.left + (r.width / 2);
            y = r.bottom + 5;
        } else if (lastMapClick) {
            // Strategy 2: Last Map Click
            x = lastMapClick.x;
            y = lastMapClick.y;
        } else {
            // Strategy 3: Center of map
            x = cRect.left + (cRect.width / 2);
            y = cRect.top + (cRect.height / 2);
        }

        if (x > 0 && y > 0) {
            const worldPos = screenToWorld(x, y, anchor);
            const markerId = "gistav-m-" + Date.now();
            
            localMarkers[markerId] = { 
                worldX: worldPos.worldX, 
                worldY: worldPos.worldY, 
                text: "RA " + raText 
            };
            
            syncMarkers();
            startRenderLoop();
        }
    }

    function clearMarkers() {
        for (const k in localMarkers) delete localMarkers[k];
        const overlay = document.getElementById('gistav-math-overlay');
        if (overlay) overlay.innerHTML = "";
        syncMarkers();
    }

    // --- PDF Mode Logic ---
    const pdfOverlay = document.createElement('div');
    pdfOverlay.id = 'gistav-pdf-overlay';
    document.body.appendChild(pdfOverlay);

    const exitBtn = document.createElement('button');
    exitBtn.id = 'gistav-pdf-exit';
    exitBtn.innerText = '\u2716 STANDARD MODUS BEENDEN';
    document.body.appendChild(exitBtn);

    let mapOrigStyle = null;
    let mapOrigParent = null;
    let mapOrigNextSibling = null;

    function togglePDFMode(on) {
        const mapEl = document.querySelector('.leaflet-container');
        const pdfBtn = document.getElementById('btn-pdf-mode');
        const panel = document.getElementById('gistav-panel');

        if (!mapEl) {
            setMsg('FEHLER: Harita bulunamadı!', 'danger');
            return;
        }

        if (on) {
            mapOrigStyle = mapEl.getAttribute('style') || '';
            mapOrigParent = mapEl.parentElement;
            mapOrigNextSibling = mapEl.nextSibling;

            pdfOverlay.style.display = 'block';

            document.body.appendChild(mapEl);
            mapEl.classList.add('gistav-fullscreen-map');
            mapEl.style.cssText = `
                position: fixed !important;
                top: 0 !important; left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 99995 !important;
            `;

            exitBtn.style.display = 'block';

            if (pdfBtn) {
                pdfBtn.innerText = '\u2716 STANDARD MODUS BEENDEN';
                pdfBtn.style.background = '#ef4444';
            }

            if (panel) panel.style.zIndex = "99999";

            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
            setMsg('🖨️ PDF MODUS AKTIV — Ctrl+P zum Drucken!', 'success');
        } else {
            // Restore map to original position
            if (mapOrigParent) {
                mapOrigParent.insertBefore(mapEl, mapOrigNextSibling);
            }
            mapEl.classList.remove('gistav-fullscreen-map');
            mapEl.setAttribute('style', mapOrigStyle);

            pdfOverlay.style.display = 'none';
            exitBtn.style.display = 'none';

            // Restore Panel Button
            if (pdfBtn) {
                pdfBtn.innerText = '\ud83d\udda8\ufe0f PDF MODUS (Yazdır)';
                pdfBtn.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
            }

            if (panel) panel.style.zIndex = "";

            setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
            setMsg('v7.0.0 Dashboard');
        }
    }

    document.getElementById('btn-pdf-mode').onclick = () => {
        const isReadyToExit = document.getElementById('btn-pdf-mode').innerText.includes('BEENDEN');
        togglePDFMode(!isReadyToExit);
    };
    exitBtn.onclick = () => togglePDFMode(false);

    document.getElementById('btn-save-pro').onclick = () => {
        project.nvt = document.getElementById('p-nvt').value;
        project.baustelle = document.getElementById('p-bau').value;
        project.kolonne = document.getElementById('p-kol').value;
        project.date = document.getElementById('p-date').value;
        project.section = parseInt(document.getElementById('p-sec').value) || 1;
        syncProject();
        setMsg("✅ PROJECT UPDATED!", "success");
    };

    // --- Startup ---
    chrome.storage.local.get([STORAGE_RECORDS, STORAGE_PROJECT, STORAGE_MARKERS], (res) => {
        records = res[STORAGE_RECORDS] || [];
        if (res[STORAGE_PROJECT]) {
            project = res[STORAGE_PROJECT];
            document.getElementById('p-nvt').value = project.nvt;
            document.getElementById('p-bau').value = project.baustelle;
            document.getElementById('p-kol').value = project.kolonne;
            document.getElementById('p-date').value = project.date;
            document.getElementById('p-sec').value = project.section;
        }

        if (res[STORAGE_MARKERS]) {
            const saved = res[STORAGE_MARKERS];
            for (const k in saved) localMarkers[k] = saved[k];
            if (Object.keys(localMarkers).length > 0) {
                startRenderLoop();
            }
        }
        
        updateDataView();
    });

})();
