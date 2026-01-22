// TSF Scatter Plotter - Main Logic

// --- Constants & State ---
const EXCEL_BASE_DATE = new Date(1899, 11, 30); // Dec 30, 1899
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const state = {
    raw: { data: [], units: {}, name: null, visible: true },
    edited: { data: [], units: {}, name: null, visible: true },
    mannings: { data: [], visible: false, params: { diameter: null, slope: null, n: null } },
    events: [],
    currentRange: { start: null, end: null },
    view: { mode: 'scatter', metric: 'level' } // metrics: level, velocity, flow
};

// --- DOM Elements ---
const dom = {
    fileRaw: document.getElementById('file-raw'),
    fileEdited: document.getElementById('file-edited'),
    fileEvt: document.getElementById('file-evt'),
    lblRaw: document.getElementById('name-raw'),
    lblEdited: document.getElementById('name-edited'),
    lblEvt: document.getElementById('name-evt'),
    chkRaw: document.getElementById('chk-raw'),
    chkEdited: document.getElementById('chk-edited'),
    selectEvent: document.getElementById('select-event'),
    dtStart: document.getElementById('dt-start'),
    dtEnd: document.getElementById('dt-end'),
    btnReset: document.getElementById('btn-reset'),
    plot: document.getElementById('plot-area'),
    menuSave: document.getElementById('menu-save'),
    fileLoadSession: document.getElementById('file-load-session'),
    // Mannings
    inpDiameter: document.getElementById('inp-diameter'),
    inpSlope: document.getElementById('inp-slope'),
    inpMannings: document.getElementById('inp-mannings'),
    chkMannings: document.getElementById('chk-mannings'),
    btnUpdateCurve: document.getElementById('btn-update-curve'),
    manningsStatus: document.getElementById('mannings-status'),
    // Session Label
    lblSession: document.getElementById('session-name'),
    // View Controls
    radioViewScatter: document.getElementById('view-scatter'),
    radioViewGraph: document.getElementById('view-graph'),
    radioViewBoth: document.getElementById('view-both'),
    selectMetric: document.getElementById('select-metric'),
    metricControl: document.getElementById('metric-control'),
    // Plot Containers
    scatterPlot: document.getElementById('scatter-plot'),
    timeSeriesPlot: document.getElementById('timeseries-plot')
};

// --- Initialization ---
function init() {
    // File Listeners
    dom.fileRaw.addEventListener('change', (e) => loadTSF(e.target.files[0], 'raw'));
    dom.fileEdited.addEventListener('change', (e) => loadTSF(e.target.files[0], 'edited'));
    dom.fileEvt.addEventListener('change', (e) => loadEVT(e.target.files[0]));

    // Toggle Listeners
    dom.chkRaw.addEventListener('change', (e) => {
        state.raw.visible = e.target.checked;
        updatePlots();
    });
    dom.chkEdited.addEventListener('change', (e) => {
        state.edited.visible = e.target.checked;
        updatePlots();
    });

    // Filter Listeners
    dom.selectEvent.addEventListener('change', onEventChange);
    dom.dtStart.addEventListener('change', onDateChange);
    dom.dtEnd.addEventListener('change', onDateChange);
    dom.btnReset.addEventListener('click', resetView);

    // Session Listeners
    dom.menuSave.addEventListener('click', saveSession);
    dom.menuSave.addEventListener('click', saveSession);
    dom.fileLoadSession.addEventListener('change', loadSession);

    // Mannings Listeners
    dom.btnUpdateCurve.addEventListener('click', updateManningsCurve);
    dom.chkMannings.addEventListener('change', (e) => {
        state.mannings.visible = e.target.checked;
        updatePlots();
    });

    // Initial Plot
    renderEmptyPlots();

    // View Control Listeners
    const handleViewChange = () => {
        const mode = document.querySelector('input[name="view-mode"]:checked').value;
        setViewMode(mode);
    };
    [dom.radioViewScatter, dom.radioViewGraph, dom.radioViewBoth].forEach(r => {
        r.addEventListener('change', handleViewChange);
    });

    dom.selectMetric.addEventListener('change', (e) => {
        state.view.metric = e.target.value;
        updatePlots();
    });

    // Ensure initial view is set correctly
    setViewMode('scatter');
}

// --- File Parsing ---

function loadTSF(file, type) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            // Use raw lines to respect fixed row indices (Row 0=Ignored, Row 1=Headers, Row 2=Units)
            const rawLines = text.split(/\r?\n/);
            if (rawLines.length < 3) throw new Error("File too short");

            const headerLine = rawLines[0]; // User requested 1st row for headers
            const headers = headerLine.split('\t');

            // Auto-detect columns
            let timeIdx = -1, levelIdx = -1, velIdx = -1, flowIdx = -1;
            headers.forEach((h, i) => {
                if (!h) return;
                const lower = h.toLowerCase();
                if (lower.includes('date') || lower.includes('time')) timeIdx = i;
                else if (lower.includes('level') || lower.includes('depth')) levelIdx = i;
                else if (lower.includes('velocity')) velIdx = i;
                else if (lower.includes('flow')) flowIdx = i;
            });

            // Extract potential units from 3rd row (index 2)
            const potentialUnits = rawLines[2].split('\t');

            // Preview Data: Rows 3+
            // Filter empty lines for preview
            const sampleData = rawLines.slice(3, 8).filter(l => l.trim().length > 0).map(line => line.split('\t'));

            showColumnSelectionModal(file.name, headers, potentialUnits, sampleData, { timeIdx, levelIdx, velIdx, flowIdx }, (result) => {
                try {
                    const parsed = parseTSFContent(text, result.indices, result.units);
                    state[type].data = parsed.data;
                    state[type].units = parsed.units;
                    state[type].name = file.name;

                    // UI Update
                    if (type === 'raw') dom.lblRaw.textContent = file.name;
                    else dom.lblEdited.textContent = file.name;

                    initRanges();
                    updatePlots();
                    resetView();
                } catch (err) {
                    alert(`Error parsing file with selected columns: ${err.message}`);
                }
            });

        } catch (err) {
            alert(`Error reading ${file.name}: ${err.message}`);
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// Modal Elements
const modal = document.getElementById('column-mapping-modal');
const modalFileName = document.getElementById('modal-file-name');
const selTime = document.getElementById('col-time');
const selLevel = document.getElementById('col-level');
const selVel = document.getElementById('col-velocity');
const selFlow = document.getElementById('col-flow');
const unitLevel = document.getElementById('unit-level');
const unitVel = document.getElementById('unit-velocity');
const unitFlow = document.getElementById('unit-flow');

const previewTable = document.getElementById('preview-table');
const btnConfirm = document.getElementById('btn-confirm-col');
const btnCancel = document.getElementById('btn-cancel-col');

let currentResolve = null;

function showColumnSelectionModal(filename, headers, potentialUnits, sampleData, defaultIndices, onConfirm) {
    modalFileName.textContent = filename;

    // Reset Selects
    [selTime, selLevel, selVel, selFlow].forEach(sel => sel.innerHTML = '');
    unitLevel.value = '';
    unitVel.value = '';
    unitFlow.value = '';

    // Populate Selects
    headers.forEach((h, i) => {
        const createOpt = () => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = h || `Column ${i + 1}`;
            return opt;
        };
        selTime.appendChild(createOpt());
        selLevel.appendChild(createOpt());
        selVel.appendChild(createOpt());
        selFlow.appendChild(createOpt());
    });

    // Helper to update unit input based on selection
    const updateUnit = (selectElem, inputElem) => {
        const idx = parseInt(selectElem.value);
        if (potentialUnits && potentialUnits[idx]) {
            inputElem.value = potentialUnits[idx];
        } else {
            inputElem.value = '';
        }
    };

    // Bind change events to update units
    selLevel.onchange = () => updateUnit(selLevel, unitLevel);
    selVel.onchange = () => updateUnit(selVel, unitVel);
    selFlow.onchange = () => updateUnit(selFlow, unitFlow);

    // Set Defaults if valid
    if (defaultIndices.timeIdx !== -1) selTime.value = defaultIndices.timeIdx;

    if (defaultIndices.levelIdx !== -1) {
        selLevel.value = defaultIndices.levelIdx;
        updateUnit(selLevel, unitLevel);
    }

    if (defaultIndices.velIdx !== -1) {
        selVel.value = defaultIndices.velIdx;
        updateUnit(selVel, unitVel);
    }

    if (defaultIndices.flowIdx !== -1) {
        selFlow.value = defaultIndices.flowIdx;
        updateUnit(selFlow, unitFlow);
    }


    // Render Preview
    // Headers
    let html = '<thead><tr>';
    headers.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';

    // Data
    sampleData.forEach(row => {
        html += '<tr>';
        row.forEach((cell, i) => {
            // Highlight selected columns? Maybe too complex for now.
            html += `<td>${cell}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';
    previewTable.innerHTML = html;

    // Show Modal
    modal.classList.remove('hidden');

    // Handlers
    const handleConfirm = () => {
        modal.classList.add('hidden');
        cleanup();
        onConfirm({
            indices: {
                timeIdx: parseInt(selTime.value),
                levelIdx: parseInt(selLevel.value),
                velIdx: parseInt(selVel.value),
                flowIdx: parseInt(selFlow.value)
            },
            units: {
                level: unitLevel.value,
                velocity: unitVel.value,
                flow: unitFlow.value
            }
        });
    };

    const handleCancel = () => {
        modal.classList.add('hidden');
        cleanup();
        // Reset file input?
        // Actually we don't need to do anything, just don't load.
    };

    const cleanup = () => {
        btnConfirm.removeEventListener('click', handleConfirm);
        btnCancel.removeEventListener('click', handleCancel);
        selLevel.onchange = null;
        selVel.onchange = null;
        selFlow.onchange = null;
        currentResolve = null;
    };

    btnConfirm.addEventListener('click', handleConfirm);
    btnCancel.addEventListener('click', handleCancel);
}

function parseTSFContent(text, indices, explicitUnits) {
    const lines = text.split(/\r?\n/);
    // Logic similar to original but using provided indices

    // Re-scanning to be safe with line numbers
    // Assuming standard TSF:
    // Line 1 (index 1 if 0-based split? Original code said Row 1 Headers)
    // Let's stick to the robust loop we had, but use specific indices.

    // Find header line again to establish unit line relative to it
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#') && line.split('\t').length > 1) {
            headerLineIdx = i;
            break;
        }
    }

    if (headerLineIdx === -1) throw new Error("Could not find data headers");

    // Units are typically the next line, but we trust explicitUnits now
    // const unitLine = lines[headerLineIdx + 1];
    // const units = unitLine ? unitLine.split('\t') : [];

    const { timeIdx, levelIdx, velIdx, flowIdx } = indices;

    const data = [];

    // Parse Data starting after units
    for (let i = headerLineIdx + 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split('\t');
        const tStr = parts[timeIdx];
        const lStr = parts[levelIdx];
        const vStr = parts[velIdx];
        const fStr = parts[flowIdx];

        const t = new Date(tStr);
        const l = parseFloat(lStr);
        const v = parseFloat(vStr);
        const f = parseFloat(fStr); // May be NaN if flow not mapped

        if (!isNaN(t.getTime()) && !isNaN(l) && !isNaN(v)) {
            data.push({ t, l, v, f: isNaN(f) ? null : f });
        }
    }

    return {
        data,
        units: {
            level: explicitUnits.level,
            velocity: explicitUnits.velocity,
            flow: explicitUnits.flow
        }
    };
}

function loadEVT(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            state.events = parseEVTContent(e.target.result);
            dom.lblEvt.textContent = file.name;
            populateEventDropdown();
        } catch (err) {
            alert(`Error loading EVT: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function parseEVTContent(text) {
    const events = [];
    const lines = text.split(/\r?\n/);

    let currentSection = null;
    let currentEvent = {};

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith(';')) return;

        // Section Header
        const sectionMatch = line.match(/^\[(.*)\]$/);
        if (sectionMatch) {
            // Save previous
            if (currentSection && currentSection.startsWith("Event")) {
                processEvent(currentEvent, events);
            }
            currentSection = sectionMatch[1];
            currentEvent = {};
            return;
        }

        // Key-Value
        const kvMatch = line.match(/^([^=]+)=(.*)$/);
        if (kvMatch && currentSection && currentSection.startsWith("Event")) {
            const key = kvMatch[1].trim();
            const val = kvMatch[2].trim();
            currentEvent[key] = val;
        }
    });

    // Last one
    if (currentSection && currentSection.startsWith("Event")) {
        processEvent(currentEvent, events);
    }

    return events;
}

function processEvent(evtDict, list) {
    // Needs Name, Start, End
    // Start/End are Excel Serial Date floats
    if (!evtDict.Start || !evtDict.End) return;

    try {
        const start = excelDateToJS(parseFloat(evtDict.Start));
        const end = excelDateToJS(parseFloat(evtDict.End));
        const name = evtDict.Name || "Unnamed";

        list.push({ name, start, end });
    } catch (e) {
        console.warn("Skipping invalid event", evtDict);
    }
}

function excelDateToJS(serial) {
    // Excel base date is Dec 30 1899
    // We use calendar arithmetic (setDate) instead of ms addition to avoid detailed DST issues
    // causing 1h offsets when crossing standard/summer time boundaries.

    const days = Math.floor(serial);
    const fraction = serial - days;

    // Create date relative to base, letting JS handle the calendar rollover
    // new Date(Year, Month, Day) uses Local Time
    const d = new Date(1899, 11, 30 + days);

    // Add time part (seconds)
    const secondsInDay = 86400;
    const seconds = Math.round(fraction * secondsInDay);
    d.setSeconds(d.getSeconds() + seconds);

    return d;
}

// --- Manning's Calculation ---

function updateManningsCurve() {
    const D = parseFloat(dom.inpDiameter.value);
    const S = parseFloat(dom.inpSlope.value);
    const n = parseFloat(dom.inpMannings.value);

    if (isNaN(D) || isNaN(S) || isNaN(n) || D <= 0 || S <= 0 || n <= 0) {
        alert("Please enter valid positive numbers for Diameter, Slope, and Manning's n.");
        return;
    }

    state.mannings.params = { diameter: D, slope: S, n: n };
    state.mannings.data = calculateManningsData(D, S, n);

    // Auto-enable visibility
    state.mannings.visible = true;
    dom.chkMannings.checked = true;
    dom.manningsStatus.textContent = "Calculated";
    dom.manningsStatus.style.color = "#10b981";

    dom.manningsStatus.textContent = "Calculated";
    dom.manningsStatus.style.color = "#10b981";

    updatePlots();
}

function calculateManningsData(D, S, n) {
    // English Units: V = (1.486 / n) * R^(2/3) * S^(1/2)
    // R = A / P

    // Sweep depth from 0 to D
    const points = [];
    const steps = 50;
    const r = D / 2.0;
    const k = 1.486;
    const sqrtS = Math.sqrt(S);

    for (let i = 0; i <= steps; i++) {
        const d = (i / steps) * D; // Current depth

        let A, P, R, V;

        if (i === 0) {
            points.push({ d: 0, v: 0 });
            continue;
        } else if (i === steps) {
            // Full pipe
            A = Math.PI * r * r;
            P = 2 * Math.PI * r;
        } else {
            // Partial flow
            // Theta is angle subtended by water surface at center
            // d = r(1 - cos(theta/2))
            // cos(theta/2) = 1 - d/r = (r - d)/r
            // theta/2 = acos((r-d)/r)
            const term = (r - d) / r;
            // Clamp term to [-1, 1] just in case
            const theta = 2.0 * Math.acos(Math.max(-1, Math.min(1, term)));

            A = (r * r / 2.0) * (theta - Math.sin(theta));
            P = r * theta;
        }

        R = A / P;
        V = (k / n) * Math.pow(R, 2 / 3) * sqrtS;

        points.push({ d: d, v: V });
    }

    return points;
}

// --- UI Logic ---

function populateEventDropdown() {
    dom.selectEvent.innerHTML = '<option value="-1">Custom Range</option>';
    state.events.forEach((evt, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const fmtStart = formatDateTime(evt.start);
        opt.textContent = `Event ${evt.name} (${fmtStart})`;
        dom.selectEvent.appendChild(opt);
    });
}

function initRanges() {
    // Determine min/max from loaded data
    let minT = null;
    let maxT = null;

    [state.raw.data, state.edited.data].forEach(arr => {
        if (arr.length > 0) {
            const t0 = arr[0].t;
            const t1 = arr[arr.length - 1].t;
            // Assuming sorted, but let's check basic min/max if not huge
            // TSF files are usually time-sorted.
            if (!minT || t0 < minT) minT = t0;
            if (!maxT || t1 > maxT) maxT = t1;
        }
    });

    if (minT && maxT) {
        setDateTimeInputs(minT, maxT);
    }
}

function onEventChange() {
    const idx = parseInt(dom.selectEvent.value);
    if (idx === -1) {
        // Custom
        // dom.dtStart.disabled = false;
        // dom.dtEnd.disabled = false;
    } else {
        const evt = state.events[idx];
        setDateTimeInputs(evt.start, evt.end);
        updatePlots();
    }
}

function onDateChange() {
    // Switch to custom if specific date changed?
    // User might want to tweak an event range.
    dom.selectEvent.value = -1;
    updatePlots();
}

function setDateTimeInputs(start, end) {
    // HTML5 datetime-local expects "YYYY-MM-DDThh:mm:ss"
    dom.dtStart.value = toInputString(start);
    dom.dtEnd.value = toInputString(end);
}

function getRange() {
    const s = dom.dtStart.value ? new Date(dom.dtStart.value) : null;
    const e = dom.dtEnd.value ? new Date(dom.dtEnd.value) : null;
    return { start: s, end: e };
}

// --- Session Management ---

async function saveSession(e) {
    if (e) e.preventDefault();
    console.log("Starting save session...");

    const session = {
        timestamp: new Date().toISOString(),
        state: {
            raw: state.raw,
            edited: state.edited,
            mannings: state.mannings, // Save Mannings
            events: state.events
        },
        view: getRange()
    };

    const jsonStr = JSON.stringify(session, null, 2); // Pretty print

    // Method 1: Modern "Save As" Dialog (Chrome/Edge)
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'scatter_session.sct',
                types: [{
                    description: 'Scatter Session Files',
                    accept: { 'application/json': ['.sct'] },
                }],
            });

            const writable = await handle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
            console.log("File saved via Picker");

            // Update Label
            dom.lblSession.textContent = handle.name;
            return; // Success
        } catch (err) {
            if (err.name === 'AbortError') return; // User cancelled
            console.warn("Save Picker failed, trying fallback:", err);
            // Fallthrough to fallback
        }
    }

    // Method 2: Legacy Download (might auto-save to Downloads folder)
    try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'scatter_session.sct';
        document.body.appendChild(a);
        a.click();

        // Alert user if this is the fallback, as it might happen silently
        // alert("Session downloaded! Check your Downloads folder.");

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    } catch (err) {
        console.error("Legacy save failed:", err);
        alert("Failed to save session: " + err.message);
    }
}

function loadSession(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const session = JSON.parse(evt.target.result);

            // Restore State
            if (session.state) {
                // Must convert date strings back to objects
                state.raw = restoreData(session.state.raw);
                state.edited = restoreData(session.state.edited);

                // Restore events
                state.events = (session.state.events || []).map(ev => ({
                    ...ev,
                    start: new Date(ev.start),
                    end: new Date(ev.end)
                }));

                // Restore Mannings
                if (session.state.mannings) {
                    state.mannings = session.state.mannings;
                    // Restore Inputs
                    if (state.mannings.params) {
                        dom.inpDiameter.value = state.mannings.params.diameter || '';
                        dom.inpSlope.value = state.mannings.params.slope || '';
                        dom.inpMannings.value = state.mannings.params.n || '';
                    }
                    if (state.mannings.visible) {
                        dom.chkMannings.checked = true;
                        dom.manningsStatus.textContent = "Loaded from Session";
                        dom.manningsStatus.style.color = "#10b981";
                    }
                }
            }

            // Restore UI Labels
            dom.lblRaw.textContent = state.raw.name || "Loaded from Session";
            dom.lblEdited.textContent = state.edited.name || "Loaded from Session";
            dom.lblEvt.textContent = state.events.length > 0 ? "Loaded from Session" : "No file selected";

            dom.chkRaw.checked = state.raw.visible;
            dom.chkEdited.checked = state.edited.visible;

            populateEventDropdown();

            // Restore View
            if (session.view && session.view.start) {
                setDateTimeInputs(new Date(session.view.start), new Date(session.view.end));
            } else {
                initRanges();
            }

            // Restore View Mode
            if (session.state.view) {
                // Ensure defaults if missing (backward compat)
                state.view.mode = session.state.view.mode || 'scatter';
                state.view.metric = session.state.view.metric || 'level';

                // Update UI Controls
                const rad = document.querySelector(`input[name="view-mode"][value="${state.view.mode}"]`);
                if (rad) rad.checked = true;
                dom.selectMetric.value = state.view.metric;

                setViewMode(state.view.mode);
            }

            updatePlots();

        } catch (err) {
            alert("Failed to load session: " + err.message);
            console.error(err);
        }

        // Reset input so same file can be loaded again
        dom.fileLoadSession.value = '';

        // Update Label
        dom.lblSession.textContent = file.name;
    };
    reader.readAsText(file);
}

function restoreData(section) {
    if (!section) return { data: [], units: {}, name: null, visible: true };
    return {
        ...section,
        data: section.data.map(pt => ({
            ...pt,
            t: new Date(pt.t)
        }))
    };
}

// --- Plotting ---

function renderEmptyPlots() {
    const layoutBase = {
        font: { family: 'Inter, sans-serif' },
        margin: { t: 40, r: 20, b: 40, l: 50 },
        autosize: true,
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff'
    };

    Plotly.newPlot(dom.scatterPlot, [], {
        ...layoutBase,
        title: 'Scatter Plot',
        xaxis: { title: 'Velocity' },
        yaxis: { title: 'Depth' }
    }, { responsive: true });

    Plotly.newPlot(dom.timeSeriesPlot, [], {
        ...layoutBase,
        title: 'Time Series',
        xaxis: { title: 'Time' },
        yaxis: { title: 'Value' }
    }, { responsive: true });
}

function updatePlots() {
    updateScatterPlot();
    updateTimeSeriesPlot();
}

function updateScatterPlot() {
    const range = getRange();
    if (!range.start || !range.end) return;

    // Only update if visible
    if (state.view.mode === 'graph') return;

    const start = range.start.getTime();
    const end = range.end.getTime();

    const datasets = [
        { type: 'raw', data: state.raw.data, color: 'red', show: state.raw.visible },
        { type: 'edited', data: state.edited.data, color: 'blue', show: state.edited.visible }
    ];

    const traces = [];

    // We need 3 buckets:
    // 1. Bg (Outside Range) - Grey
    // 2. Raw (Inside) - Red
    // 3. Edited (Inside) - Blue

    const bgX = [];
    const bgY = [];

    datasets.forEach(ds => {
        if (ds.data.length === 0) return;
        // Even if ds.show is false, we might want its background points?
        // Python code: "Background (Always show outside points, AND inside points if toggle is OFF)"
        // "I will Keep BG points (outside range) always visible for loaded files as context."

        const fgX = [];
        const fgY = [];
        // Custom Data: [TimeStr, IndexInOriginalArray]
        const fgCustom = [];

        ds.data.forEach((pt, i) => {
            const t = pt.t.getTime();
            if (t >= start && t <= end) {
                if (ds.show) {
                    fgX.push(pt.v);
                    fgY.push(pt.l);
                    fgCustom.push([formatDateTime(pt.t), t]); // Push timestamp for linking
                } else {
                    bgX.push(pt.v);
                    bgY.push(pt.l); // "inside points if toggle is OFF" -> BG
                }
            } else {
                bgX.push(pt.v);
                bgY.push(pt.l);
            }
        });

        if (fgX.length > 0 && ds.show) {
            traces.push({
                x: fgX,
                y: fgY,
                mode: 'markers',
                type: 'scattergl', // Use WebGL for performance
                name: ds.type === 'raw' ? 'Raw (In Range)' : 'Edited (In Range)',
                marker: {
                    color: ds.color,
                    size: 6,
                    opacity: 0.8,
                    line: { color: 'black', width: 1 } // Added outline
                },
                customdata: fgCustom,
                hovertemplate:
                    '<b>%{customdata[0]}</b><br>' +
                    'Depth: %{y}<br>' +
                    'Velocity: %{x}<br>' +
                    '<extra></extra>' // Hides the trace name in the popup
            });
        }
    });

    // Add Background trace first (so it's behind)
    if (bgX.length > 0) {
        traces.unshift({
            x: bgX,
            y: bgY,
            mode: 'markers',
            type: 'scattergl',
            name: 'Context (Outside Range)',
            marker: { color: '#94a3b8', size: 4, opacity: 0.5 },
            hoverinfo: 'skip'
        });
    }

    // Determine units early
    let dUnit = state.raw.units.level || state.edited.units.level || '?';
    let vUnit = state.raw.units.velocity || state.edited.units.velocity || '?';

    // Add Manning's Curve Trace
    if (state.mannings.visible && state.mannings.data.length > 0) {
        const mData = state.mannings.data;

        // Check if Depth is in Inches
        const isInches = dUnit.toLowerCase().startsWith('in');
        const depthMult = isInches ? 12.0 : 1.0;
        const depthLabel = isInches ? 'in' : 'ft';

        traces.push({
            x: mData.map(pt => pt.v),
            y: mData.map(pt => pt.d * depthMult),
            mode: 'lines',
            type: 'scattergl',
            name: 'Manning Theoretical',
            line: {
                color: '#10b981', // Emerald 500
                width: 3,
            },
            hovertemplate:
                '<b>Manning Theoretical</b><br>' +
                `Depth: %{y:.2f} ${depthLabel}<br>` +
                'Velocity: %{x:.2f} fps<br>' +
                '<extra></extra>'
        });
    }

    // Add Highlight Trace (Empty initially)
    traces.push({
        x: [],
        y: [],
        mode: 'markers',
        type: 'scattergl',
        name: 'Highlight',
        showlegend: false,
        marker: {
            symbol: 'circle-open',
            size: 15,
            color: '#000000',
            line: { width: 3 }
        },
        hoverinfo: 'skip'
    });

    // Determine Plot Title
    let plotTitle = 'Scatter Plot';
    const evtIdx = parseInt(dom.selectEvent.value);

    // Formatter for Event Title: "Sep 9, 2025"
    const eventDateFmt = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    if (evtIdx !== -1 && state.events[evtIdx]) {
        const evt = state.events[evtIdx];
        const dateStr = eventDateFmt.format(evt.start);
        // Handle case where name might already include "Event"
        const namePart = evt.name.toLowerCase().startsWith('event') ? evt.name : `Event ${evt.name}`;
        plotTitle = `${namePart}: ${dateStr}`;
    } else if (range.start && range.end) {
        const fmt = d => d.toLocaleString(undefined, {
            month: 'numeric', day: 'numeric', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        plotTitle = `${fmt(range.start)} - ${fmt(range.end)}`;
    }

    const layout = {
        title: {
            text: plotTitle,
            x: 0.5,
            xanchor: 'center',
            y: 0.95
        },
        xaxis: { title: `Velocity (${vUnit})`, zeroline: true },
        yaxis: { title: `Depth (${dUnit})`, zeroline: true },
        font: { family: 'Inter, sans-serif' },
        margin: { t: 60, r: 20, b: 60, l: 60 }, // Increased bottom margin
        showlegend: true,
        legend: { x: 0, y: 1 },
        hovermode: 'closest',
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff',
        uirevision: 'true', // Keep zoom/pan state when updating data
    };

    Plotly.react(dom.scatterPlot, traces, layout, { responsive: true }).then(() => {
        // Attach hover events
        dom.scatterPlot.on('plotly_hover', (data) => {
            const pt = data.points[0];
            // If it's a data point (has customdata with time)
            if (pt.customdata && pt.customdata[1]) {
                highlightTime(pt.customdata[1]);
            }
        });
        dom.scatterPlot.on('plotly_unhover', () => {
            // Clear highlight? Maybe not needed if we want persistence, but for now let's leave it.
            // Actually, clearing the highlight on graph might be nice.
            Plotly.relayout(dom.timeSeriesPlot, { 'shapes': [] });
        });
    });
}

function updateTimeSeriesPlot() {
    // Only update if visible
    if (state.view.mode === 'scatter') return;

    const range = getRange();
    if (!range.start || !range.end) return;

    const metric = state.view.metric; // level, velocity, flow

    const datasets = [
        { type: 'raw', data: state.raw.data, color: 'red', show: state.raw.visible },
        { type: 'edited', data: state.edited.data, color: 'blue', show: state.edited.visible }
    ];

    const traces = [];

    // Helper to get val
    const getVal = (pt) => {
        if (metric === 'level') return pt.l;
        if (metric === 'velocity') return pt.v;
        if (metric === 'flow') return pt.f;
        return null;
    };

    datasets.forEach(ds => {
        if (!ds.show || ds.data.length === 0) return;

        const x = [];
        const y = [];
        const custom = [];

        ds.data.forEach(pt => {
            const val = getVal(pt);
            if (val !== null && val !== undefined) {
                x.push(pt.t);
                y.push(val);
                custom.push([formatDateTime(pt.t), pt.v, pt.l]); // [Str, Vel, Dep]
            }
        });

        traces.push({
            x: x,
            y: y,
            mode: 'lines', // Lines for time series
            type: 'scattergl',
            name: ds.type === 'raw' ? 'Raw' : 'Edited',
            line: { color: ds.color, width: 2 },
            customdata: custom,
            hovertemplate:
                `<b>%{x}</b><br>` +
                `${metric.charAt(0).toUpperCase() + metric.slice(1)}: %{y:.2f}<br>` +
                '<extra></extra>'
        });
    });

    let yTitle = 'Value';
    if (metric === 'level') yTitle = `Depth (${state.raw.units.level || ''})`;
    else if (metric === 'velocity') yTitle = `Velocity (${state.raw.units.velocity || ''})`;
    else if (metric === 'flow') yTitle = `Flow (${state.raw.units.flow || ''})`;

    const layout = {
        title: `Time Series - ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
        xaxis: {
            title: 'Time',
            range: [range.start, range.end], // Sync zoom with main range
            type: 'date'
        },
        yaxis: { title: yTitle },
        font: { family: 'Inter, sans-serif' },
        margin: { t: 40, r: 20, b: 50, l: 60 },
        showlegend: true,
        legend: { x: 0, y: 1 },
        hovermode: 'x unified', // Better for time series
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff',
        uirevision: 'time-series-layout',
        shapes: [] // Will be used for hover
    };

    Plotly.react(dom.timeSeriesPlot, traces, layout, { responsive: true }).then(() => {
        dom.timeSeriesPlot.on('plotly_hover', (data) => {
            // Sync back to scatter logic could happen here
            // Using hovermode x unified, we get all points at that X
            // Let's just take the first one's time
            const pt = data.points[0];
            const t = new Date(pt.x).getTime();

            // Highlight in Scatter
            highlightScatter(t);
        });
    });
}

function highlightTime(timestamp) {
    // timestamp is ms number
    // Draw a vertical line on the time series plot
    if (state.view.mode === 'scatter') return; // Not visible

    const update = {
        'shapes': [{
            type: 'line',
            x0: new Date(timestamp),
            x1: new Date(timestamp),
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: 'black',
                width: 1,
                dash: 'dash'
            }
        }]
    };
    Plotly.relayout(dom.timeSeriesPlot, update);
}

function highlightScatter(timestamp) {
    if (state.view.mode === 'graph') return;

    // We want to highlight the point(s) in the scatter plot that match this time.

    const pts = [];
    [state.raw, state.edited].forEach(ds => {
        if (!ds.visible) return;
        const match = ds.data.find(p => Math.abs(p.t.getTime() - timestamp) < 1000); // 1s tolerance
        if (match) {
            pts.push(match);
        }
    });

    // Find Highlight Trace Index (should be the last one as per updateScatterPlot)
    const highlightIdx = dom.scatterPlot.data.length - 1;

    if (pts.length === 0) {
        // Clear highlight
        Plotly.restyle(dom.scatterPlot, { x: [[]], y: [[]] }, [highlightIdx]);
        return;
    }

    // Update Highlight Trace
    const xVal = pts.map(p => p.v);
    const yVal = pts.map(p => p.l);

    Plotly.restyle(dom.scatterPlot, {
        x: [xVal],
        y: [yVal]
    }, [highlightIdx]);
}

function setViewMode(mode) {
    state.view.mode = mode;
    document.body.className = `view-mode-${mode}`;

    dom.metricControl.style.display = mode === 'scatter' ? 'none' : 'flex';

    // Resize trigger for Plotly
    // We need a slight delay for flexbox to apply
    requestAnimationFrame(() => {
        if (dom.scatterPlot.offsetParent) Plotly.Plots.resize(dom.scatterPlot);
        if (dom.timeSeriesPlot.offsetParent) Plotly.Plots.resize(dom.timeSeriesPlot);
        // Force update to render data if it was hidden
        updatePlots();
    });
}

function resetView() {
    // Auto-scale to all data
    // Plotly handles this if we clear axis ranges or just relayout
    if (state.view.mode !== 'graph') {
        Plotly.relayout(dom.scatterPlot, {
            'xaxis.autorange': true,
            'yaxis.autorange': true
        });
    }
    if (state.view.mode !== 'scatter') {
        Plotly.relayout(dom.timeSeriesPlot, {
            'xaxis.autorange': true,
            'yaxis.autorange': true
        });
    }
}

// --- Helpers ---

function toInputString(date) {
    // YYYY-MM-DDThh:mm:ss
    if (!date) return '';
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTime(date) {
    return date.toLocaleString();
}

// Start
init();

// --- Clipboard ---
function copyGraphToClipboard() {
    // Determine which plot to copy
    // If 'both', maybe copy the visible one or ask? 
    // For now, let's copy the Scatter plot by default or the Graph if Scatter is hidden.
    let plot = dom.scatterPlot;
    if (state.view.mode === 'graph') plot = dom.timeSeriesPlot;
    // If both, we prioritize scatter for now, or we could handle it better (html2canvas of wrapper?)
    // But Plotly.toImage is component specific.

    // Future improvement: Copy the wrapper div

    Plotly.toImage(plot, { format: 'png', height: 800, width: 1200 })
        .then(function (dataUrl) {
            // Convert Base64 to Blob
            fetch(dataUrl)
                .then(res => res.blob())
                .then(blob => {
                    // Write to clipboard
                    const item = new ClipboardItem({ "image/png": blob });
                    navigator.clipboard.write([item]).then(() => {
                        // Feedback
                        const btn = document.getElementById('btn-copy-graph');
                        const originalHTML = btn.innerHTML;

                        // Check mark
                        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        btn.style.color = '#10b981'; // Green
                        btn.style.borderColor = '#10b981';

                        setTimeout(() => {
                            btn.innerHTML = originalHTML;
                            btn.style.color = '';
                            btn.style.borderColor = '';
                        }, 2000);
                    }).catch(err => {
                        console.error("Clipboard write failed", err);
                        alert("Failed to copy to clipboard. Browser may deny permission.");
                    });
                });
        })
        .catch(function (err) {
            console.error("Plotly export failed", err);
            alert("Failed to generate image.");
        });
}

// Attach listener (dirty hack to reach into dom elements not yet in 'dom' const if I don't update it)
// Better to update init() or add it here safely
document.getElementById('btn-copy-graph').addEventListener('click', copyGraphToClipboard);
