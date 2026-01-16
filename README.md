# Scatter Plot Reviewer

A web-based tool for visualizing and reviewing hydraulic modeling data, specifically comparing Raw vs. Edited scatter plot data (Velocity vs. Depth).

## Features

- **Data Comparison**: Load and visualize "Raw" and "Edited" TSF time-series files simultaneously.
- **Interactive Scatter Plot**: View Depth vs. Velocity relationships with interactive zooming, panning, and hovering.
- **Event Filtering**: Import `.evt` files to filter and navigate through specific storm events.
- **Flexible Data Import**:
  - Auto-detection of Date, Depth, and Velocity columns.
  - Manual column mapping modal for non-standard files.
  - Support for custom units.
- **Session Management**: Save (`.sct`) and resume your analysis sessions seamlessly.
- **Export Tools**: One-click "Copy to Clipboard" button for quick reporting.

## Getting Started

### Hosted Application
Access the tool directly via your web browser: [Insert GitHub Pages Link Here]

### Local Development
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   ```
2. **Run Locally**:
   - You can open `index.html` directly in a browser, or
   - Use a local server (recommended):
     ```bash
     python -m http.server 8000
     ```
     Then navigate to `http://localhost:8000`.

3. **Load Data**:
   - Upload a **Raw TSF** and/or **Edited TSF** file using the file inputs in the sidebar.

## Usage Guide

### Navigating Data
- **Event Dropdown**: Select a specific event to zoom the plot to that time range.
- **Manual Range**: Use the "Start" and "End" datetime pickers to define a custom custom time window.
- **Reset**: Click "Reset Zoom" to view all loaded data.

### Interaction
- **Hover**: Hover over points to see exact Date, Depth, and Velocity values.
- **Toggle**: Use the checkboxes in the sidebar to show/hide Raw or Edited data layers.
- **Copy Graph**: Click the copy icon (top-right of the chart) to copy the current view as an image to your clipboard.

## File Formats

### TSF (Time Series File)
Expects a tab-separated text file with:
- **Header Row**: Identifying column names (e.g., Date, Level, Velocity).
- **Unit Row**: Specifying units (e.g., in, ft/s).
- **Data**: Time-series data rows.

### EVT (Event File)
Expects a text file defining events, typically in an INI-like structure with `[Event Name]` sections containing `Start` and `End` timestamps.

---
*Built with HTML, CSS, Vanilla JavaScript, and Plotly.js.*
