// Main Configuration
const EXCEL_BASE_DATE = new Date(1899, 11, 30);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const state = {
    raw: { data: [], units: {}, name: null, visible: true },
    edited: { data: [], units: {}, name: null, visible: true },
    confirmation: { data: [], units: {}, name: null, visible: true },
    rainfall: { data: [], units: {}, name: null, visible: true },
    mannings: { data: [], visible: false, params: { diameter: null, slope: null, n: null } },
    events: [],
    currentRange: { start: null, end: null },
    view: { mode: 'scatter', activeMetrics: ['level', 'velocity'] }
};

// DOM Elements
const dom = {
    fileRaw: document.getElementById('file-raw'),
    fileEdited: document.getElementById('file-edited'),
    fileConfirm: document.getElementById('file-confirm'),
    fileRainfall: document.getElementById('file-rainfall'),
    fileEvt: document.getElementById('file-evt'),
    lblRaw: document.getElementById('name-raw'),
    lblEdited: document.getElementById('name-edited'),
    lblConfirm: document.getElementById('name-confirm'),
    lblRainfall: document.getElementById('name-rainfall'),
    lblEvt: document.getElementById('name-evt'),
    chkRaw: document.getElementById('chk-raw'),
    chkEdited: document.getElementById('chk-edited'),
    chkConfirm: document.getElementById('chk-confirm'),
    chkRainfall: document.getElementById('chk-rainfall'),
    selectEvent: document.getElementById('select-event'),
    dtStart: document.getElementById('dt-start'),
    dtEnd: document.getElementById('dt-end'),
    btnReset: document.getElementById('btn-reset'),
    plot: document.getElementById('plot-area'),
    menuSave: document.getElementById('menu-save'),
    fileLoadSession: document.getElementById('file-load-session'),

    inpDiameter: document.getElementById('inp-diameter'),
    inpSlope: document.getElementById('inp-slope'),
    inpMannings: document.getElementById('inp-mannings'),
    chkMannings: document.getElementById('chk-mannings'),
    btnUpdateCurve: document.getElementById('btn-update-curve'),
    manningsStatus: document.getElementById('mannings-status'),

    lblSession: document.getElementById('session-name'),

    modalExcelControls: document.getElementById('modal-excel-controls'),
    selSheet: document.getElementById('sel-sheet'),
    inpHeaderRow: document.getElementById('inp-header-row'),

    radioViewScatter: document.getElementById('view-scatter'),
    radioViewGraph: document.getElementById('view-graph'),
    radioViewBoth: document.getElementById('view-both'),
    metricControl: document.getElementById('metric-control'),

    cbLevel: document.getElementById('cb-metric-level'),
    cbVelocity: document.getElementById('cb-metric-velocity'),
    cbFlow: document.getElementById('cb-metric-flow'),
    cbRainfall: document.getElementById('cb-metric-rainfall'),

    scatterPlot: document.getElementById('scatter-plot'),
    timeSeriesPlot: document.getElementById('timeseries-plot')
};

// Initialize Application
function init() {
    // Attach File Loaders
    dom.fileRaw.addEventListener('change', (e) => loadTableFile(e.target.files[0], 'raw'));
    dom.fileEdited.addEventListener('change', (e) => loadTableFile(e.target.files[0], 'edited'));
    dom.fileConfirm.addEventListener('change', (e) => loadTableFile(e.target.files[0], 'confirmation'));
    dom.fileRainfall.addEventListener('change', (e) => loadTableFile(e.target.files[0], 'rainfall'));
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
    dom.chkConfirm.addEventListener('change', (e) => {
        state.confirmation.visible = e.target.checked;
        updatePlots();
    });
    dom.chkRainfall.addEventListener('change', (e) => {
        state.rainfall.visible = e.target.checked;
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

    const handleMetricChange = () => {
        state.view.activeMetrics = [];
        if (dom.cbLevel.checked) state.view.activeMetrics.push('level');
        if (dom.cbVelocity.checked) state.view.activeMetrics.push('velocity');
        if (dom.cbFlow.checked) state.view.activeMetrics.push('flow');
        if (dom.cbRainfall.checked) state.view.activeMetrics.push('rainfall');

        // Enforce Order
        state.view.activeMetrics.sort((a, b) => {
            const order = ['rainfall', 'flow', 'level', 'velocity'];
            return order.indexOf(a) - order.indexOf(b);
        });

        updatePlots();
    };

    dom.cbLevel.addEventListener('change', handleMetricChange);
    dom.cbVelocity.addEventListener('change', handleMetricChange);
    dom.cbFlow.addEventListener('change', handleMetricChange);
    dom.cbRainfall.addEventListener('change', handleMetricChange);

    // Plotly Event Listeners (Attach once)
    dom.scatterPlot.on('plotly_hover', (data) => {
        const pt = data.points[0];
        if (pt.customdata && pt.customdata[1]) {
            highlightTime(pt.customdata[1]);
        }
    });
    dom.scatterPlot.on('plotly_unhover', () => {
        Plotly.relayout(dom.timeSeriesPlot, { 'shapes': [] });
    });

    dom.timeSeriesPlot.on('plotly_hover', (data) => {
        const pt = data.points[0];
        const t = new Date(pt.x).getTime();
        highlightScatter(t);
    });
    dom.timeSeriesPlot.on('plotly_unhover', () => {
        // Clear scatter highlight
        const highlightIdx = dom.scatterPlot.data.length - 1;
        Plotly.restyle(dom.scatterPlot, { x: [[]], y: [[]] }, [highlightIdx]);
    });

    // Help Modal Logic
    const helpModal = document.getElementById('help-modal');
    const btnHelp = document.getElementById('btn-help');
    const btnCloseHelp = document.getElementById('btn-close-help');

    if (btnHelp && helpModal && btnCloseHelp) {
        btnHelp.addEventListener('click', () => {
            helpModal.classList.remove('hidden');
        });

        btnCloseHelp.addEventListener('click', () => {
            helpModal.classList.add('hidden');
        });

        // Close on click outside
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.add('hidden');
            }
        });
    }

    // Ensure initial view is set correctly
    setViewMode('scatter');
}

// --- File Parsing ---

// Helper for metric sort order
const METRIC_ORDER = ['rainfall', 'flow', 'level', 'velocity'];
function sortMetrics(metrics) {
    return metrics.sort((a, b) => METRIC_ORDER.indexOf(a) - METRIC_ORDER.indexOf(b));
}

function loadTableFile(file, type) {
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            let source = {};
            if (isExcel) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                source = { type: 'excel', workbook: workbook };
            } else {
                source = { type: 'text', content: e.target.result };
            }

            showColumnSelectionModal(file.name, source, type, (result) => {
                try {
                    const parsed = parseTableContent(result.text, result.indices, result.units, result.delimiter);

                    state[type].data = parsed.data;
                    state[type].units = parsed.units;
                    state[type].name = file.name;

                    if (type === 'raw') dom.lblRaw.textContent = file.name;
                    else if (type === 'edited') dom.lblEdited.textContent = file.name;
                    else if (type === 'confirmation') dom.lblConfirm.textContent = file.name;
                    else if (type === 'rainfall') dom.lblRainfall.textContent = file.name;

                    initRanges();
                    updatePlots();
                    resetView();
                } catch (err) {
                    alert(`Error parsing file: ${err.message}`);
                }
            });

        } catch (err) {
            alert(`Error reading ${file.name}: ${err.message}`);
        }
    };

    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
}

function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).slice(0, 5);
    let tabCount = 0;
    let commaCount = 0;

    lines.forEach(line => {
        tabCount += (line.match(/\t/g) || []).length;
        commaCount += (line.match(/,/g) || []).length;
    });

    return tabCount > commaCount ? '\t' : ',';
}

function parseTableContent(text, indices, explicitUnits, delimiter) {
    const lines = text.split(/\r?\n/);
    const { timeIdx, levelIdx, velIdx, flowIdx, rainfallIdx } = indices;

    // Find header line
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith('#') && line.split(delimiter).length > 1) {
            headerLineIdx = i;
            break;
        }
    }

    if (headerLineIdx === -1) throw new Error("Could not find data headers");

    const data = [];

    for (let i = headerLineIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(delimiter);
        // Safety check
        if (parts.length <= Math.max(timeIdx, levelIdx || 0, velIdx || 0)) continue;

        const clean = (s) => s ? s.replace(/^"|"$/g, '').trim() : '';
        const tStr = parts[timeIdx];
        const t = new Date(clean(tStr));

        if (isNaN(t.getTime())) continue;

        let l = NaN, v = NaN, f = NaN, r = NaN;

        if (levelIdx !== undefined && levelIdx !== -1) l = parseFloat(clean(parts[levelIdx]));
        if (velIdx !== undefined && velIdx !== -1) v = parseFloat(clean(parts[velIdx]));
        if (flowIdx !== undefined && flowIdx !== -1) f = parseFloat(clean(parts[flowIdx]));
        if (rainfallIdx !== undefined && rainfallIdx !== -1) r = parseFloat(clean(parts[rainfallIdx]));

        data.push({
            t,
            l: isNaN(l) ? null : l,
            v: isNaN(v) ? null : v,
            f: isNaN(f) ? null : f,
            r: isNaN(r) ? null : r
        });
    }

    return {
        data,
        units: {
            level: explicitUnits.level,
            velocity: explicitUnits.velocity,
            flow: explicitUnits.flow,
            rainfall: explicitUnits.rainfall
        }
    };
}

// Modal Elements
const modal = document.getElementById('column-mapping-modal');
const modalFileName = document.getElementById('modal-file-name');
const selTime = document.getElementById('col-time');
const selLevel = document.getElementById('col-level');
const selVel = document.getElementById('col-velocity');
const selFlow = document.getElementById('col-flow');
const selRainfall = document.getElementById('col-rainfall');

const unitLevel = document.getElementById('unit-level');
const unitVel = document.getElementById('unit-velocity');
const unitFlow = document.getElementById('unit-flow');
const unitRainfall = document.getElementById('unit-rainfall');

const previewTable = document.getElementById('preview-table');
const btnConfirm = document.getElementById('btn-confirm-col');
const btnCancel = document.getElementById('btn-cancel-col');

function showColumnSelectionModal(filename, source, type, onConfirm) {
    modalFileName.textContent = filename;

    // Excel Controls
    if (source.type === 'excel') {
        dom.modalExcelControls.style.display = 'flex';
        dom.selSheet.innerHTML = '';
        source.workbook.SheetNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            dom.selSheet.appendChild(opt);
        });
        dom.selSheet.value = source.workbook.SheetNames[0];
        dom.inpHeaderRow.value = 1;

        dom.selSheet.onchange = updatePreview;
        dom.inpHeaderRow.onchange = updatePreview;
    } else {
        dom.modalExcelControls.style.display = 'none';
        dom.selSheet.onchange = null;
        dom.inpHeaderRow.onchange = null;
    }

    // Dynamic Visibility
    const isRainfall = type === 'rainfall';
    const isConfirmation = type === 'confirmation';

    selLevel.parentElement.style.display = 'flex';
    selVel.parentElement.style.display = 'flex';
    selFlow.parentElement.style.display = 'flex';
    selRainfall.parentElement.style.display = 'none';

    if (isConfirmation) {
        selFlow.parentElement.style.display = 'none';
    } else if (isRainfall) {
        selLevel.parentElement.style.display = 'none';
        selVel.parentElement.style.display = 'none';
        selFlow.parentElement.style.display = 'none';
        selRainfall.parentElement.style.display = 'flex';
    }

    let currentPreviewData = null;

    function updatePreview() {
        try {
            let text = "";
            let delimiter = ",";

            if (source.type === 'excel') {
                const sheetName = dom.selSheet.value;
                const worksheet = source.workbook.Sheets[sheetName];
                text = XLSX.utils.sheet_to_csv(worksheet);

                const headerRow = parseInt(dom.inpHeaderRow.value) || 1;
                if (headerRow > 1) {
                    const allLines = text.split(/\r?\n/);
                    if (allLines.length >= headerRow) {
                        text = allLines.slice(headerRow - 1).join('\n');
                    }
                }
            } else {
                text = source.content;
                delimiter = detectDelimiter(text);
            }

            const rawLines = text.split(/\r?\n/);
            if (rawLines.length < 1) return;

            const headerLine = rawLines[0];
            const headers = headerLine.split(delimiter);

            // Auto-detect columns
            let idxs = { timeIdx: -1, levelIdx: -1, velIdx: -1, flowIdx: -1, rainfallIdx: -1 };
            headers.forEach((h, i) => {
                if (!h) return;
                const lower = h.toLowerCase();
                if (lower.includes('date') || lower.includes('time')) idxs.timeIdx = i;
                else if (lower.includes('level') || lower.includes('depth')) idxs.levelIdx = i;
                else if (lower.includes('velocity')) idxs.velIdx = i;
                else if (lower.includes('flow')) idxs.flowIdx = i;
                else if (lower.includes('rain') || lower.includes('precip')) idxs.rainfallIdx = i;
            });

            // Extract units from row 2
            let potentialUnits = [];
            if (rawLines.length > 2) {
                const parts = rawLines[2].split(delimiter);
                if (Math.abs(parts.length - headers.length) <= 2) potentialUnits = parts;
            }

            // Populate Selects
            [selTime, selLevel, selVel, selFlow, selRainfall].forEach(sel => sel.innerHTML = '');
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
                selRainfall.appendChild(createOpt());
            });

            const updateUnit = (selectElem, inputElem) => {
                const idx = parseInt(selectElem.value);
                if (potentialUnits && potentialUnits[idx]) {
                    inputElem.value = potentialUnits[idx];
                } else {
                    inputElem.value = '';
                }
            };

            selLevel.onchange = () => updateUnit(selLevel, unitLevel);
            selVel.onchange = () => updateUnit(selVel, unitVel);
            selFlow.onchange = () => updateUnit(selFlow, unitFlow);
            selRainfall.onchange = () => updateUnit(selRainfall, unitRainfall);

            if (idxs.timeIdx !== -1) selTime.value = idxs.timeIdx;
            if (idxs.levelIdx !== -1) selLevel.value = idxs.levelIdx;
            if (idxs.velIdx !== -1) selVel.value = idxs.velIdx;
            if (idxs.flowIdx !== -1) {
                selFlow.value = idxs.flowIdx;
                updateUnit(selFlow, unitFlow);
            }
            if (idxs.rainfallIdx !== -1) {
                selRainfall.value = idxs.rainfallIdx;
                updateUnit(selRainfall, unitRainfall);
            }

            if (idxs.levelIdx !== -1) updateUnit(selLevel, unitLevel);
            if (idxs.velIdx !== -1) updateUnit(selVel, unitVel);

            // Render Preview
            const sampleData = rawLines.slice(1, 6).filter(l => l.trim().length > 0).map(l => l.split(delimiter));
            let html = '<thead><tr>';
            headers.forEach(h => html += `<th>${h}</th>`);
            html += '</tr></thead><tbody>';
            sampleData.forEach(row => {
                html += '<tr>';
                row.forEach(cell => html += `<td>${cell}</td>`);
                html += '</tr>';
            });
            html += '</tbody>';
            previewTable.innerHTML = html;

            currentPreviewData = { text, delimiter };
            return currentPreviewData;

        } catch (e) {
            console.error("Preview Error", e);
        }
    }

    updatePreview();

    modal.classList.remove('hidden');

    const handleConfirm = () => {
        if (!currentPreviewData) updatePreview();

        modal.classList.add('hidden');
        cleanup();

        onConfirm({
            text: currentPreviewData.text,
            delimiter: currentPreviewData.delimiter,
            indices: {
                timeIdx: parseInt(selTime.value),
                levelIdx: isRainfall ? -1 : parseInt(selLevel.value),
                velIdx: isRainfall ? -1 : parseInt(selVel.value),
                flowIdx: isRainfall ? -1 : parseInt(selFlow.value),
                rainfallIdx: isRainfall ? parseInt(selRainfall.value) : -1
            },
            units: {
                level: unitLevel.value,
                velocity: unitVel.value,
                flow: unitFlow.value,
                rainfall: unitRainfall.value
            }
        });
    };

    const handleCancel = () => {
        modal.classList.add('hidden');
        cleanup();
    };

    const cleanup = () => {
        btnConfirm.removeEventListener('click', handleConfirm);
        btnCancel.removeEventListener('click', handleCancel);
        dom.selSheet.onchange = null; // Clean up SheetJS listeners
        dom.inpHeaderRow.onchange = null;
    };

    btnConfirm.addEventListener('click', handleConfirm);
    btnCancel.addEventListener('click', handleCancel);
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

    [state.raw.data, state.edited.data, state.confirmation.data, state.rainfall.data].forEach(arr => {
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
            confirmation: state.confirmation,
            rainfall: state.rainfall, // Save Rainfall
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
                state.confirmation = restoreData(session.state.confirmation);
                state.rainfall = restoreData(session.state.rainfall);

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
            dom.lblConfirm.textContent = state.confirmation.name || "Loaded from Session";
            dom.lblRainfall.textContent = state.rainfall.name || "Loaded from Session";
            dom.lblEvt.textContent = state.events.length > 0 ? "Loaded from Session" : "No file selected";

            dom.chkRaw.checked = state.raw.visible;
            dom.chkEdited.checked = state.edited.visible;
            dom.chkConfirm.checked = state.confirmation.visible;
            dom.chkRainfall.checked = state.rainfall.visible;

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
                // state.view.metric = session.state.view.metric || 'level'; // Legacy
                state.view.activeMetrics = session.state.view.activeMetrics || ['level'];

                // Update UI Controls
                const rad = document.querySelector(`input[name="view-mode"][value="${state.view.mode}"]`);
                if (rad) rad.checked = true;

                // Update Checkboxes
                dom.cbLevel.checked = state.view.activeMetrics.includes('level');
                dom.cbVelocity.checked = state.view.activeMetrics.includes('velocity');
                dom.cbFlow.checked = state.view.activeMetrics.includes('flow');
                dom.cbRainfall.checked = state.view.activeMetrics.includes('rainfall');

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
        { type: 'raw', data: state.raw.data, color: 'red', show: state.raw.visible, symbol: 'circle' },
        { type: 'edited', data: state.edited.data, color: 'blue', show: state.edited.visible, symbol: 'circle' },
        { type: 'confirmation', data: state.confirmation.data, color: '#10b981', show: state.confirmation.visible, symbol: 'diamond' }
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
                name: ds.type === 'raw' ? 'Raw (In Range)' : (ds.type === 'confirmation' ? 'Confirmation' : 'Edited (In Range)'),
                marker: {
                    symbol: ds.symbol || 'circle',
                    color: ds.color,
                    size: ds.type === 'confirmation' ? 12 : 6, // Slightly larger for diamonds
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

    // Add Pipe Crown Line
    if (state.mannings.visible && state.mannings.params.diameter) {
        const D = state.mannings.params.diameter;
        // Check units
        const isInches = dUnit.toLowerCase().startsWith('in');
        const depthMult = isInches ? 12.0 : 1.0;
        const crownY = D * depthMult;

        // Find max velocity for line length
        let maxV = 5.0; // Default min width
        if (state.mannings.data.length > 0) {
            const mMax = Math.max(...state.mannings.data.map(p => p.v));
            if (mMax > maxV) maxV = mMax;
        }
        // Also check observed data to ensure line covers points
        datasets.forEach(ds => {
            if (ds.data.length > 0) {
                const localMax = Math.max(...ds.data.map(p => p.v || 0));
                if (localMax > maxV) maxV = localMax;
            }
        });

        traces.push({
            x: [0, maxV * 1.1], // Extend slightly
            y: [crownY, crownY],
            mode: 'lines',
            type: 'scattergl',
            name: 'Pipe Crown',
            line: {
                color: 'black',
                width: 1,
                dash: 'dash'
            },
            hoverinfo: 'name+y'
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
            color: '#00FFFF', // Cyan
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

    Plotly.react(dom.scatterPlot, traces, layout, { responsive: true });
}

function updateTimeSeriesPlot() {
    // Only update if visible
    if (state.view.mode === 'scatter') return;

    const range = getRange();
    if (!range.start || !range.end) return;

    const activeMetrics = state.view.activeMetrics || [];
    if (activeMetrics.length === 0) return; // Or clear plot?

    const activeDatasets = [
        { type: 'raw', data: state.raw.data, color: 'red', show: state.raw.visible },
        { type: 'edited', data: state.edited.data, color: 'blue', show: state.edited.visible },
        { type: 'confirmation', data: state.confirmation.data, color: '#10b981', show: state.confirmation.visible, symbol: 'diamond' },
        { type: 'rainfall', data: state.rainfall.data, color: '#3b82f6', show: state.rainfall.visible }
    ];

    const traces = [];

    // Layout Calculation
    // We want to stack 'N' plots vertically.
    // Total height = 1.0. 
    // Gap = 0.05 (maybe less for many plots)
    const nMetrics = activeMetrics.length;
    const gap = 0.05;
    const plotHeight = (1.0 - (gap * (nMetrics - 1))) / nMetrics;

    const layout = {
        title: 'Time Series',
        xaxis: {
            title: '', // Only bottom axis needs title? Or none to save space.
            range: [range.start, range.end],
            type: 'date',
            domain: [0, 1],
            anchor: `y${nMetrics > 1 ? nMetrics : ''}` // anchor to bottom-most y-axis? No, usually 'y' is bottom?
            // Actually, in Plotly stacking, usually y is bottom, y2 is above, etc. Or y is top.
            // Let's explicitly define domains.
        },
        // grid: { rows: nMetrics, columns: 1, pattern: 'independent' }, // Removing grid to allow manual domain control
        font: { family: 'Inter, sans-serif' },
        margin: { t: 50, r: 20, b: 50, l: 60 },
        showlegend: true,
        legend: {
            x: 0.01,
            y: 0.99,
            xanchor: 'left',
            yanchor: 'top',
            bgcolor: 'rgba(255, 255, 255, 0.5)',
            font: { size: 10 }
        },
        hovermode: 'x unified',
        plot_bgcolor: '#ffffff',
        paper_bgcolor: '#ffffff',
        uirevision: 'time-series-layout',
        shapes: [] // Preserve highlight lines? logic is in highlightTime
    };

    // Construct Traces and Layout Axis
    const seenLegendGroups = new Set();

    // Construct Traces and Layout Axis
    activeMetrics.forEach((metric, idx) => {
        // Plotly axis naming for TRACES: y, y2, y3...
        // Plotly axis naming for LAYOUT: yaxis, yaxis2, yaxis3...

        const traceAxis = idx === 0 ? 'y' : `y${idx + 1}`;
        const layoutKey = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;

        // Calculate Domain (Top to Bottom)
        const top = 1 - (idx * (plotHeight + gap));
        const bottom = top - plotHeight;

        // Lookup Unit
        let unit = '';
        if (metric === 'rainfall') {
            unit = state.rainfall.units.rainfall || '';
        } else {
            // Try logical sources
            unit = state.raw.units[metric] || state.edited.units[metric] || state.confirmation.units[metric] || '?';
        }
        const unitStr = unit ? ` (${unit})` : '';

        // Update Layout with Axis Config
        layout[layoutKey] = {
            title: (metric.charAt(0).toUpperCase() + metric.slice(1)) + unitStr,
            domain: [bottom, top],
            // anchor: 'x' // Link all to same x axis
        };

        // Add Traces for this metric
        activeDatasets.forEach(ds => {
            if (!ds.show || ds.data.length === 0) return;

            const isRainDataset = ds.type === 'rainfall';
            const isRainMetric = metric === 'rainfall';

            if (isRainDataset && !isRainMetric) return;
            if (!isRainDataset && isRainMetric) return;
            if (ds.type === 'confirmation' && metric === 'flow') return;

            const x = [], y = [], custom = [];
            ds.data.forEach(pt => {
                let val = null;
                if (metric === 'level') val = pt.l;
                else if (metric === 'velocity') val = pt.v;
                else if (metric === 'flow') val = pt.f;
                else if (metric === 'rainfall') val = pt.r;

                if (val !== null && val !== undefined) {
                    x.push(pt.t);
                    y.push(val);
                    custom.push([formatDateTime(pt.t), pt.v || 0, pt.l || 0]); // Metadata
                }
            });

            if (x.length === 0) return;

            const isConfirm = ds.type === 'confirmation';
            const groupName = ds.type; // raw, edited, confirmation, rainfall
            const displayName = ds.type === 'raw' ? 'Raw' :
                ds.type === 'confirmation' ? 'Confirmation' :
                    ds.type === 'rainfall' ? 'Rainfall' : 'Edited';

            // Determine if we show the legend for this group (only first time)
            const showLegend = !seenLegendGroups.has(groupName);
            if (showLegend) seenLegendGroups.add(groupName);

            const trace = {
                x: x, y: y,
                mode: isConfirm ? 'markers' : 'lines',
                type: 'scattergl',
                name: displayName,
                xaxis: 'x',
                yaxis: traceAxis,
                customdata: custom,
                hovertemplate: `<b>%{x}</b><br>${metric}: %{y:.2f}<br><extra></extra>`,
                showlegend: showLegend,
                legendgroup: groupName
            };

            if (isConfirm) {
                trace.marker = { symbol: 'diamond', color: ds.color, size: 12, opacity: 0.8, line: { color: 'black', width: 1 } };
            } else {
                trace.line = { color: ds.color, width: 2 };
            }

            traces.push(trace);
        });
    });

    // Handle X-Axis Anchor (attach to bottom-most y-axis usually, or just overlay)
    // In independent pattern, they share 'x' if we set xaxis: 'x' for all.
    // We just need to ensure X axis is visible.
    // layout.xaxis.anchor = `y${nMetrics}`; // Anchor to bottom one?
    // Actually, Plotly defaults are okay if we share 'xaxis'.

    // Update Plot
    Plotly.react(dom.timeSeriesPlot, traces, layout, { responsive: true });
    // Note: Event listeners moved to init()
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
    const mode = state.view.mode;
    const btn = document.getElementById('btn-copy-graph');

    // Helper to flash success/fail
    const flashBtn = (success) => {
        const originalHTML = btn.innerHTML;
        const color = success ? '#10b981' : '#ef4444';
        const icon = success ?
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` :
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`; // Error icon

        btn.innerHTML = icon;
        btn.style.color = color;
        btn.style.borderColor = color;

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    };

    const writeBlob = (blob) => {
        const item = new ClipboardItem({ "image/png": blob });
        navigator.clipboard.write([item])
            .then(() => flashBtn(true))
            .catch(err => {
                console.error("Clipboard write failed", err);
                alert("Failed to copy to clipboard.");
                flashBtn(false);
            });
    };

    if (mode === 'both') {
        // Split View: Capture both and merge
        // We defined ratio 3:2. Let's adhere to that roughly or just capture reasonable sizes.
        // Total Width: 1500px? (900 TS, 600 Scatter)
        const wTS = 900;
        const wSc = 600;
        const h = 600;

        Promise.all([
            Plotly.toImage(dom.timeSeriesPlot, { format: 'png', height: h, width: wTS }),
            Plotly.toImage(dom.scatterPlot, { format: 'png', height: h, width: wSc })
        ]).then(dataUrls => {
            const imgTS = new Image();
            const imgSc = new Image();

            let loaded = 0;
            const onLoaded = () => {
                loaded++;
                if (loaded === 2) {
                    const canvas = document.createElement('canvas');
                    canvas.width = wTS + wSc;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');

                    // Fill white background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Draw images
                    ctx.drawImage(imgTS, 0, 0);
                    ctx.drawImage(imgSc, wTS, 0);

                    canvas.toBlob(writeBlob, 'image/png');
                }
            };

            imgTS.onload = onLoaded;
            imgSc.onload = onLoaded;

            imgTS.src = dataUrls[0];
            imgSc.src = dataUrls[1];
        }).catch(err => {
            console.error(err);
            flashBtn(false);
        });

    } else {
        // Single View
        let plot = dom.scatterPlot;
        if (mode === 'graph') plot = dom.timeSeriesPlot;

        Plotly.toImage(plot, { format: 'png', height: 800, width: 1200 })
            .then(dataUrl => {
                fetch(dataUrl)
                    .then(res => res.blob())
                    .then(writeBlob);
            })
            .catch(err => {
                console.error(err);
                flashBtn(false);
            });
    }
}

// Attach listener
document.getElementById('btn-copy-graph').addEventListener('click', copyGraphToClipboard);



// ... existing loadTableFileV2 ...


