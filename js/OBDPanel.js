/**
 * OBDPanel.js
 *
 * A self-contained UI component that renders a live OBD-II dashboard
 * panel in the app sidebar. Displays real-time vehicle telemetry from
 * the connected ELM327 adapter and provides connect/disconnect controls.
 *
 * Responsibilities:
 *   - Render the Bluetooth connect button and status strip
 *   - Display live gauges: RPM, Speed, Coolant Temp, Fuel Level,
 *     Intake Air Temp, Throttle Position
 *   - Animate value changes with a brief highlight flash
 *   - Expose the current fuel efficiency estimate (computed from
 *     speed + RPM, or direct PID 0x5E if available) to App.js
 *     so it can auto-fill the sidebar efficiency input
 *
 * Dependencies: OBDManager.js
 * Used by: App.js
 */

class OBDPanel {

  // Gauge definitions — maps metric key → display config
  static GAUGES = [
    {
      key: 'rpm', label: 'Engine RPM', unit: 'rpm', icon: '⚡',
      min: 0, max: 7000,
      format: v => Math.round(v).toLocaleString(),
      barColor: (v) => v > 5500 ? '#ff4d4d' : v > 3500 ? '#f59e0b' : '#2DB86A',
    },
    {
      key: 'speed', label: 'Speed', unit: 'km/h', icon: '🏎️',
      min: 0, max: 200,
      format: v => Math.round(v),
      barColor: () => '#2DB86A',
    },
    {
      key: 'coolant', label: 'Coolant', unit: '°C', icon: '🌡️',
      min: -20, max: 130,
      format: v => Math.round(v) + '°',
      barColor: (v) => v > 110 ? '#ff4d4d' : v > 90 ? '#f59e0b' : '#38bdf8',
    },
    {
      key: 'fuel', label: 'Fuel Level', unit: '%', icon: '⛽',
      min: 0, max: 100,
      format: v => Math.round(v) + '%',
      barColor: (v) => v < 15 ? '#ff4d4d' : v < 30 ? '#f59e0b' : '#2DB86A',
    },
    {
      key: 'intake', label: 'Intake Air', unit: '°C', icon: '💨',
      min: -20, max: 80,
      format: v => Math.round(v) + '°',
      barColor: () => '#38bdf8',
    },
    {
      key: 'throttle', label: 'Throttle', unit: '%', icon: '🔧',
      min: 0, max: 100,
      format: v => Math.round(v) + '%',
      barColor: (v) => v > 80 ? '#f59e0b' : '#2DB86A',
    },
  ];

  // ── Constructor ────────────────────────────────────────────────

  /**
   * @param {HTMLElement} containerEl  - element to mount the panel into
   * @param {OBDManager}  obdManager   - the OBD manager instance
   * @param {Function}    onEfficiency - called with estimated L/100km when available
   */
  constructor(containerEl, obdManager, onEfficiency) {
    this._container     = containerEl;
    this._obd           = obdManager;
    this._onEfficiency  = onEfficiency || (() => {});
    this._metrics       = {};
    this._prevMetrics   = {};
    this._status        = { state: 'idle', message: 'Not connected' };
    this._panelEl       = null;
    this._render();
  }

  // ── Public API ─────────────────────────────────────────────────

  /** Called by OBDManager when new data arrives */
  updateMetrics(metrics) {
    this._prevMetrics = { ...this._metrics };
    this._metrics     = { ...metrics };
    this._updateGauges();
    this._estimateEfficiency();
  }

  /** Called by OBDManager when connection status changes */
  updateStatus(status) {
    this._status = status;
    this._updateStatusUI();
  }

  // ── Rendering ──────────────────────────────────────────────────

  _render() {
    this._panelEl = document.createElement('section');
    this._panelEl.className = 'obd-panel sidebar__section';
    this._panelEl.setAttribute('aria-label', 'OBD-II Live Data');
    this._panelEl.id = 'obd-panel';

    this._panelEl.innerHTML = `
      <!-- Panel header -->
      <div class="obd-header">
        <div class="obd-header__left">
          <span class="obd-header__icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </span>
          <span class="obd-header__title">OBD-II Live</span>
        </div>
        <button class="obd-connect-btn" id="obd-connect-btn" aria-label="Connect to OBD-II adapter">
          <span class="obd-connect-btn__dot"></span>
          <span class="obd-connect-btn__text" id="obd-btn-text">Connect</span>
        </button>
      </div>

      <!-- Status strip -->
      <div class="obd-status" id="obd-status-strip">
        <span class="obd-status__dot" id="obd-status-dot"></span>
        <span class="obd-status__msg" id="obd-status-msg">Tap Connect to pair your Veepeak Mini</span>
      </div>

      <!-- Live gauge grid -->
      <div class="obd-gauges" id="obd-gauges">
        ${OBDPanel.GAUGES.map(g => this._buildGaugeHTML(g)).join('')}
      </div>

      <!-- Efficiency readout (computed from OBD data) -->
      <div class="obd-efficiency" id="obd-efficiency" style="display:none">
        <div class="obd-efficiency__label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          Live Fuel Efficiency
        </div>
        <div class="obd-efficiency__value">
          <span id="obd-eff-value">—</span>
          <span class="obd-efficiency__unit">L / 100 km</span>
        </div>
        <button class="obd-eff-apply" id="obd-eff-apply" aria-label="Use this efficiency for calculation">
          Use This Value
        </button>
      </div>
    `;

    this._container.appendChild(this._panelEl);
    this._bindEvents();
  }

  _buildGaugeHTML(gauge) {
    return `
      <div class="obd-gauge" id="gauge-${gauge.key}" data-key="${gauge.key}">
        <div class="obd-gauge__header">
          <span class="obd-gauge__icon" aria-hidden="true">${gauge.icon}</span>
          <span class="obd-gauge__label">${gauge.label}</span>
          <span class="obd-gauge__value" id="gauge-val-${gauge.key}">—</span>
        </div>
        <div class="obd-gauge__bar-track">
          <div class="obd-gauge__bar" id="gauge-bar-${gauge.key}" style="width:0%;background:#2DB86A"></div>
        </div>
      </div>
    `;
  }

  // ── Event binding ──────────────────────────────────────────────

  _bindEvents() {
    const connectBtn = document.getElementById('obd-connect-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this._handleConnectClick());
    }

    const applyBtn = document.getElementById('obd-eff-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const effEl = document.getElementById('obd-eff-value');
        const val   = parseFloat(effEl.textContent);
        if (!isNaN(val) && val > 0) {
          this._onEfficiency(val);
        }
      });
    }
  }

  async _handleConnectClick() {
    const btn     = document.getElementById('obd-connect-btn');
    const btnText = document.getElementById('obd-btn-text');

    if (this._obd.isConnected) {
      this._obd.disconnect();
      if (btn) btn.classList.remove('obd-connect-btn--connected');
      if (btnText) btnText.textContent = 'Connect';
      return;
    }

    if (btn) btn.classList.add('obd-connect-btn--scanning');
    if (btnText) btnText.textContent = 'Scanning…';

    const ok = await this._obd.connect();

    if (btn) btn.classList.remove('obd-connect-btn--scanning');
    if (ok) {
      if (btn) btn.classList.add('obd-connect-btn--connected');
      if (btnText) btnText.textContent = 'Disconnect';
    } else {
      if (btnText) btnText.textContent = 'Connect';
    }
  }

  // ── Live updates ───────────────────────────────────────────────

  _updateGauges() {
    OBDPanel.GAUGES.forEach(gauge => {
      const value  = this._metrics[gauge.key];
      const valEl  = document.getElementById(`gauge-val-${gauge.key}`);
      const barEl  = document.getElementById(`gauge-bar-${gauge.key}`);
      const gaugeEl = document.getElementById(`gauge-${gauge.key}`);

      if (!valEl || !barEl) return;

      if (value === null || value === undefined) {
        valEl.textContent = '—';
        barEl.style.width = '0%';
        return;
      }

      const prev = this._prevMetrics[gauge.key];

      // Format and update text
      valEl.textContent = gauge.format(value) + ' ' + gauge.unit;

      // Calculate bar fill percentage
      const clampedVal = Math.max(gauge.min, Math.min(gauge.max, value));
      const pct        = ((clampedVal - gauge.min) / (gauge.max - gauge.min)) * 100;
      barEl.style.width      = pct + '%';
      barEl.style.background = gauge.barColor(value);

      // Flash animation on value change
      if (gaugeEl && prev !== null && prev !== undefined && prev !== value) {
        gaugeEl.classList.remove('obd-gauge--flash');
        void gaugeEl.offsetWidth; // reflow to restart animation
        gaugeEl.classList.add('obd-gauge--flash');
      }
    });
  }

  _updateStatusUI() {
    const dotEl  = document.getElementById('obd-status-dot');
    const msgEl  = document.getElementById('obd-status-msg');
    const btn    = document.getElementById('obd-connect-btn');
    const btnTxt = document.getElementById('obd-btn-text');

    if (!dotEl || !msgEl) return;

    const { state, message } = this._status;

    dotEl.className = 'obd-status__dot obd-status__dot--' + state;
    msgEl.textContent = message;

    // Update button state
    if (btn) {
      btn.className = 'obd-connect-btn' +
        (state === 'connected'    ? ' obd-connect-btn--connected' : '') +
        (state === 'scanning' || state === 'connecting' || state === 'initialising'
          ? ' obd-connect-btn--scanning' : '');
    }

    if (btnTxt) {
      if (state === 'connected')   btnTxt.textContent = 'Disconnect';
      else if (['scanning', 'connecting', 'initialising'].includes(state))
        btnTxt.textContent = 'Connecting…';
      else
        btnTxt.textContent = 'Connect';
    }
  }

  // ── Efficiency estimation ──────────────────────────────────────

  /**
   * Estimates fuel consumption (L/100 km) from live OBD data.
   * Method: if speed > 10 km/h and RPM is available, use a simplified
   * engine model. A proper MAF-based calculation requires PID 0x10.
   * This uses an approximation based on RPM and throttle.
   *
   * This is displayed as an informational estimate only.
   */
  _estimateEfficiency() {
    const { speed, rpm, throttle } = this._metrics;
    const efficiencyEl = document.getElementById('obd-efficiency');
    const effValEl     = document.getElementById('obd-eff-value');

    if (!efficiencyEl) return;

    if (!speed || speed < 5 || !rpm) {
      efficiencyEl.style.display = 'none';
      return;
    }

    // Simplified estimation:
    // Assume ~2.5L/h idle fuel rate, scaled by throttle/RPM factor
    // True calculation needs MAF (PID 0x10) or fuel rate (PID 0x5E)
    const idleRate   = 2.0;   // L/h at idle
    const throttlePct = (throttle ?? 20) / 100;
    const rpmFactor  = Math.max(0.3, rpm / 6000);
    const fuelRateEst = idleRate + (8.0 * rpmFactor * throttlePct); // rough L/h
    const lPer100km  = (fuelRateEst / speed) * 100;

    // Only show if speed is meaningful and value is within a sane range
    if (lPer100km > 3 && lPer100km < 40) {
      efficiencyEl.style.display = 'block';
      effValEl.textContent = lPer100km.toFixed(1);
    } else {
      efficiencyEl.style.display = 'none';
    }
  }
}
