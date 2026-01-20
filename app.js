// TSF Scatter Plotter - Main Logic

// --- Constants & State ---
const EXCEL_BASE_DATE = new Date(1899, 11, 30); // Dec 30, 1899
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const state = {
    raw: { data: [], units: {}, name: null, visible: true },
    edited: { data: [], units: {}, name: null, visible: true },
    events: [],
    currentRange: { start: null, end: null }
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
    fileLoadSession: document.getElementById('file-load-session')
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
        updatePlot();
    });
    dom.chkEdited.addEventListener('change', (e) => {
        state.edited.visible = e.target.checked;
        updatePlot();
    });

    // Filter Listeners
    dom.selectEvent.addEventListener('change', onEventChange);
    dom.dtStart.addEventListener('change', onDateChange);
    dom.dtEnd.addEventListener('change', onDateChange);
    dom.btnReset.addEventListener('click', resetView);

    // Session Listeners
    dom.menuSave.addEventListener('click', saveSession);
    dom.fileLoadSession.addEventListener('change', loadSession);

    // Initial Plot
    renderEmptyPlot();
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
            let timeIdx = -1, levelIdx = -1, velIdx = -1;
            headers.forEach((h, i) => {
                if (!h) return;
                const lower = h.toLowerCase();
                if (lower.includes('date') || lower.includes('time')) timeIdx = i;
                else if (lower.includes('level') || lower.includes('depth')) levelIdx = i;
                else if (lower.includes('velocity')) velIdx = i;
            });

            // Extract potential units from 3rd row (index 2)
            const potentialUnits = rawLines[2].split('\t');

            // Preview Data: Rows 3+
            // Filter empty lines for preview
            const sampleData = rawLines.slice(3, 8).filter(l => l.trim().length > 0).map(line => line.split('\t'));

            showColumnSelectionModal(file.name, headers, potentialUnits, sampleData, { timeIdx, levelIdx, velIdx }, (result) => {
                try {
                    const parsed = parseTSFContent(text, result.indices, result.units);
                    state[type].data = parsed.data;
                    state[type].units = parsed.units;
                    state[type].name = file.name;

                    // UI Update
                    if (type === 'raw') dom.lblRaw.textContent = file.name;
                    else dom.lblEdited.textContent = file.name;

                    initRanges();
                    updatePlot();
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
const unitLevel = document.getElementById('unit-level');
const unitVel = document.getElementById('unit-velocity');

const previewTable = document.getElementById('preview-table');
const btnConfirm = document.getElementById('btn-confirm-col');
const btnCancel = document.getElementById('btn-cancel-col');

let currentResolve = null;

function showColumnSelectionModal(filename, headers, potentialUnits, sampleData, defaultIndices, onConfirm) {
    modalFileName.textContent = filename;

    // Reset Selects
    [selTime, selLevel, selVel].forEach(sel => sel.innerHTML = '');
    unitLevel.value = '';
    unitVel.value = '';

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

    // Bind change events to update units
    selLevel.onchange = () => updateUnit(selLevel, unitLevel);
    selVel.onchange = () => updateUnit(selVel, unitVel);


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
                velIdx: parseInt(selVel.value)
            },
            units: {
                level: unitLevel.value,
                velocity: unitVel.value
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

    const { timeIdx, levelIdx, velIdx } = indices;

    const data = [];

    // Parse Data starting after units
    for (let i = headerLineIdx + 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split('\t');
        if (parts.length <= Math.max(timeIdx, levelIdx, velIdx)) continue;

        const tStr = parts[timeIdx];
        const lStr = parts[levelIdx];
        const vStr = parts[velIdx];

        const t = new Date(tStr);
        const l = parseFloat(lStr);
        const v = parseFloat(vStr);

        if (!isNaN(t.getTime()) && !isNaN(l) && !isNaN(v)) {
            data.push({ t, l, v });
        }
    }

    return {
        data,
        units: {
            level: explicitUnits.level,
            velocity: explicitUnits.velocity
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
        updatePlot();
    }
}

function onDateChange() {
    // Switch to custom if specific date changed?
    // User might want to tweak an event range.
    dom.selectEvent.value = -1;
    updatePlot();
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

            updatePlot();

        } catch (err) {
            alert("Failed to load session: " + err.message);
            console.error(err);
        }

        // Reset input so same file can be loaded again
        dom.fileLoadSession.value = '';
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

function renderEmptyPlot() {
    Plotly.newPlot(dom.plot, [], {
        title: 'Scatter Plot',
        xaxis: { title: 'Velocity' },
        yaxis: { title: 'Depth' },
        margin: { t: 40, r: 20, b: 40, l: 50 },
        autosize: true
    }, { responsive: true });
}

function updatePlot() {
    const range = getRange();
    if (!range.start || !range.end) return;

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

        ds.data.forEach(pt => {
            const t = pt.t.getTime();
            if (t >= start && t <= end) {
                if (ds.show) {
                    fgX.push(pt.v);
                    fgY.push(pt.l);
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
            // Prepare custom data for hover
            // We need to match the indices of fgX
            const fgT = [];
            ds.data.forEach(pt => {
                const t = pt.t.getTime();
                if (t >= start && t <= end) {
                    if (ds.show) {
                        fgT.push(formatDateTime(pt.t));
                    }
                }
            });

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
                customdata: fgT,
                hovertemplate:
                    '<b>%{customdata}</b><br>' +
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

    // Layout Updates
    // Update axis labels based on units
    let dUnit = state.raw.units.level || state.edited.units.level || '?';
    let vUnit = state.raw.units.velocity || state.edited.units.velocity || '?';

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
        margin: { t: 80, r: 20, b: 50, l: 60 }, // Increased top margin
        showlegend: true,
        legend: { x: 0, y: 1 },
        hovermode: 'closest',
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff',
        uirevision: 'true', // Keep zoom/pan state when updating data
    };

    // Preserving zoom is tricky if we completely redraw?
    // Plotly.react is better than newPlot for updates
    Plotly.react(dom.plot, traces, layout, { responsive: true });
}

function resetView() {
    // Auto-scale to all data
    // Plotly handles this if we clear axis ranges or just relayout
    Plotly.relayout(dom.plot, {
        'xaxis.autorange': true,
        'yaxis.autorange': true
    });
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
    const plot = dom.plot;

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
