/**
 * App.js
 *
 * Application controller — the top-level class that wires together
 * every other component.
 *
 * App is responsible for:
 *   1. Instantiating all service objects (TimeConditions, UIManager, MapManager).
 *   2. Converting raw STATION_DATA records into GasStation instances.
 *   3. Running the initialisation sequence (markers, clock, event bindings).
 *   4. Orchestrating the full calculation pipeline when the user clicks Calculate.
 *
 * Calculation pipeline (App.calculate):
 *   a. Read and validate user inputs via UIManager.
 *   b. Snapshot time conditions via TimeConditions.
 *   c. Run GasStation.computeResult() for every station.
 *   d. Identify the best deal (lowest true cost) and the nearest station.
 *   e. Update map markers via MapManager.
 *   f. Render sidebar result cards via UIManager.
 *   g. Fly the map camera to encompass all stations.
 *
 * Dependencies (loaded before this file):
 *   data.js, GasStation.js, TimeConditions.js, MapManager.js, UIManager.js
 */

class App {

  // ── Constructor ────────────────────────────────────────────────

  constructor() {
    // Service objects
    this._conditions = new TimeConditions();
    this._ui = new UIManager();
    this._map = new MapManager('map', USER_ORIGIN, 12);

    // Convert raw data records into GasStation instances
    this._stations = STATION_DATA.map(record => new GasStation(record));

    // OBD-II adapter (Veepeak Mini ELM327 via Web Bluetooth)
    this._obdManager = new OBDManager(
      metrics => {
        if (this._obdPanel) this._obdPanel.updateMetrics(metrics);
      },
      status => {
        if (this._obdPanel) this._obdPanel.updateStatus(status);
      }
    );
    this._obdPanel = null; // mounted in init()
  }

  // ── Initialisation ─────────────────────────────────────────────

  /**
   * Bootstraps the application:
   *   - Places default map markers
   *   - Starts the live clock
   *   - Renders initial condition badges
   *   - Launches the Wizard overlay
   */
  init() {
    // Place one default (dark) marker per station
    this._stations.forEach(station => this._map.addStationMarker(station));

    // Start live clock — tick immediately, then every 1 second
    this._ui.updateClock();
    setInterval(() => this._ui.updateClock(), 1000);

    // Render initial time-condition badges
    this._ui.renderConditions(this._conditions.snapshot());
    setInterval(() => this._ui.renderConditions(this._conditions.snapshot()), 30_000);

    // Bind the sidebar Calculate button (used in Edit Settings flow)
    document.getElementById('calculate-btn')
      .addEventListener('click', () => this.calculate());

    document.querySelectorAll('#sidebar input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.calculate();
      });
    });

    // Bind the Edit Settings button in the sidebar rerun bar
    document.getElementById('rerun-btn')
      .addEventListener('click', () => this._launchWizard());

    // Mount the OBD-II live panel in the sidebar
    const obdMount = document.getElementById('obd-panel-mount');
    if (obdMount) {
      this._obdPanel = new OBDPanel(
        obdMount,
        this._obdManager,
        (estimatedEfficiency) => {
          // Auto-fill the efficiency input with the OBD-derived value
          const effInput = document.getElementById('efficiency');
          if (effInput) {
            effInput.value = estimatedEfficiency.toFixed(1);
            // Show a brief highlight to signal the auto-fill
            effInput.classList.add('form-input--obd-fill');
            setTimeout(() => effInput.classList.remove('form-input--obd-fill'), 1500);
          }
          // Recalculate if we already have results
          const sidebar = document.getElementById('sidebar');
          if (sidebar && sidebar.classList.contains('sidebar--results-mode')) {
            this.calculate();
          }
        }
      );
    }
    // ── Map/Sidebar View Toggle ──
    const viewMapBtn = document.getElementById('view-map-btn');
    const showControlsBtn = document.getElementById('show-controls-btn');
    const sidebarElement = document.getElementById('sidebar');

    if (viewMapBtn && showControlsBtn && sidebarElement) {
      viewMapBtn.addEventListener('click', () => {
        sidebarElement.classList.add('sidebar--hidden');
        showControlsBtn.classList.remove('fab-btn--hidden');
      });

      showControlsBtn.addEventListener('click', () => {
        sidebarElement.classList.remove('sidebar--hidden');
        showControlsBtn.classList.add('fab-btn--hidden');
      });
    }

    // Launch the wizard as the first thing the user sees
    this._launchWizard();

    console.log('Smart Gas Map initialised.');
    console.log('Time conditions at load:', this._conditions.snapshot());
  }

  // ── Wizard integration ─────────────────────────────────────────

  /**
   * Creates and mounts a fresh Wizard instance.
   * Called on first load and again if the user clicks "Edit Settings".
   *
   * When the wizard completes it:
   *   1. Writes the collected values into the sidebar input fields
   *      (so the sidebar still reflects the current state).
   *   2. Updates the compact rerun bar summary text.
   *   3. Runs the full calculation automatically.
   *   4. Switches the sidebar into results mode.
   */
  _launchWizard() {
    const wizard = new Wizard(values => {
      const { efficiency, fuelNeeded, carName, obdConnected, obdRange, obdGrade } = values;

      // Write collected values into the sidebar inputs
      document.getElementById('efficiency').value  = efficiency;
      document.getElementById('fuel-needed').value = fuelNeeded;

      // Update the compact rerun bar — include OBD trip data when available
      const summary = document.getElementById('rerun-summary');
      if (summary) {
        let html = carName
          ? `<strong>${carName}</strong> &middot; <strong>${fuelNeeded} L</strong> to pump`
          : `<strong>${efficiency} L/100 km</strong> &middot; <strong>${fuelNeeded} L</strong> to pump`;

        if (obdConnected && obdRange) {
          html += ` &middot; <strong>~${obdRange} km</strong> range`;
        }
        summary.innerHTML = html;
      }

      // Run the calculation immediately
      this.calculate();

      // Switch the sidebar to results-first layout
      document.getElementById('sidebar').classList.add('sidebar--results-mode');
    }, this._obdManager);

    wizard.mount(document.body);
  }

  // ── Calculation pipeline ───────────────────────────────────────

  /**
   * The main calculation entry point, triggered by the Calculate button.
   *
   * Reads user inputs, runs all algorithms across every station,
   * then updates both the map and the sidebar.
   */
  calculate() {
    // a. Read and validate inputs from the sidebar form
    const inputs = this._ui.getInputs();
    if (!inputs) {
      alert('Please enter valid numbers for both fuel efficiency and litres to pump.');
      return;
    }
    const { efficiency, fuelNeeded } = inputs;

    // b. Take a single time snapshot so every station is compared
    //    under identical conditions (no risk of a second ticking mid-run).
    const conditions = this._conditions.snapshot();

    // c. Compute a result object for every station
    const results = this._stations.map(station =>
      station.computeResult(fuelNeeded, efficiency, conditions)
    );

    // d1. Find the station with the lowest true cost (the best deal)
    const bestResult = results.reduce((prev, curr) =>
      curr.totalCost < prev.totalCost ? curr : prev
    );

    // d2. Find the nearest station — this is the benchmark for
    //     the "worth the drive?" comparison.
    //     A farther station is "worth it" only if its true cost
    //     is no more than the nearest station's true cost.
    const closestResult = results.reduce((prev, curr) =>
      curr.distance < prev.distance ? curr : prev
    );

    // e. Update map marker colours and attach populated popups
    this._map.updateMarkers(
      results,
      bestResult.id,
      closestResult.totalCost,
      conditions,
      stationId => {
        // When a marker is clicked, focus the map on that station
        const r = results.find(r => r.id === stationId);
        if (r) this._map.focusStation(r.coords, r.id);
        
        // Move sidebar to the side
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('sidebar--hidden')) {
          sidebar.classList.add('sidebar--side');
        }
      }
    );

    // f. Render sidebar result cards, sorted cheapest-first
    const sortedResults = [...results].sort((a, b) => a.totalCost - b.totalCost);
    this._ui.renderResults(
      sortedResults,
      bestResult.id,
      closestResult,
      conditions,
      result => {
        this._map.focusStation(result.coords, result.id);
        
        // Move sidebar to the side
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('sidebar--hidden')) {
          sidebar.classList.add('sidebar--side');
        }
      }
    );

    // g. Animate the map camera to show all stations
    const allCoords = [USER_ORIGIN, ...this._stations.map(s => s.coords)];
    this._map.flyToBounds(allCoords);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
// Instantiate the App and call init() once the page has fully loaded.
// All <script> tags are at the bottom of <body>, so the DOM is ready here.
const app = new App();
app.init();
