/**
 * Wizard.js
 *
 * A multi-step onboarding overlay that collects user inputs before
 * the main map is revealed. Supports two paths:
 *
 *   MANUAL PATH (original):
 *     0 — Welcome         (choose path)
 *     1 — Car Search      (live-filter → auto-fills efficiency)
 *     2 — Fuel Efficiency  (manual input, skipped when car is selected)
 *     3 — Fuel to Pump    (number input)
 *     5 — Confirm         (summary + launch)
 *
 *   OBD-II PATH (new):
 *     0 — Welcome         (choose path)
 *     1 — Car Search      (identifies car for tank capacity)
 *     4 — OBD Connect     (Bluetooth scan + live trip analysis dashboard)
 *     5 — Confirm         (summary with OBD trip data + launch)
 *
 * Step 4 is only visited on the OBD path; steps 2–3 are only on manual.
 *
 * Dependencies: carData.js (CAR_DATABASE global), OBDManager.js, styles.css
 * Used by: App.js
 */

class Wizard {

  // ── Step configuration ─────────────────────────────────────────
  static STEPS = [
    /* 0 */ { type: 'welcome' },
    /* 1 */ {
      type:        'car-search',
      heading:     'Find Your Car',
      description: 'Search by make or model to automatically set your fuel efficiency. ' +
                   'You can also enter it manually on the next step.'
    },
    /* 2 */ {
      type:        'input',
      heading:     'Fuel Efficiency',
      description: 'How many litres does your car consume per 100 km? ' +
                   'Check your owner\'s manual or search your make and model.',
      inputId:     'wiz-efficiency',
      resultKey:   'efficiency',
      unit:        'L / 100 km',
      min:         3,
      max:         30,
      step:        0.1,
      defaultVal:  9.5
    },
    /* 3 */ {
      type:        'input',
      heading:     'Fuel to Pump',
      description: 'How many litres do you plan to fill up? ' +
                   'A typical car tank holds between 40 and 60 litres.',
      inputId:     'wiz-fuel-needed',
      resultKey:   'fuelNeeded',
      unit:        'litres',
      min:         1,
      max:         200,
      step:        1,
      defaultVal:  40
    },
    /* 4 */ {
      type:        'obd-connect',
      heading:     'Connect Your Scanner',
      description: 'Pair your ELM327 OBD-II Bluetooth adapter to get live fuel level, ' +
                   'real-time efficiency, and trip range estimates.'
    },
    /* 5 */ { type: 'confirm' }
  ];

  // ── Tank capacities (litres) for known models ─────────────────
  static TANK_MAP = {
    'Kia Telluride':       71.5,
    'Kia Sorento':         67.0,
    'Kia Sportage':        54.0,
    'Kia Carnival':        72.0,
    'Toyota RAV4':         55.0,
    'Toyota Highlander':   72.5,
    'Toyota Camry':        60.6,
    'Toyota Corolla':      50.0,
    'Toyota Sienna':       68.1,
    'Honda CR-V':          53.0,
    'Honda Civic':         46.9,
    'Honda Accord':        56.0,
    'Honda Pilot':         73.0,
    'Ford F-150':          98.0,
    'Ford Explorer':       70.0,
    'Ford Escape':         53.0,
    'Hyundai Tucson':      54.0,
    'Hyundai Santa Fe':    67.0,
    'Hyundai Palisade':    71.0,
    'Chevrolet Tahoe':     91.0,
    'Chevrolet Equinox':   54.0,
    'Jeep Grand Cherokee': 68.1,
    'Nissan Rogue':        55.1,
    'Subaru Forester':     63.0,
    'Mazda CX-5':          56.0,
  };
  static DEFAULT_TANK = 55;

  // ── Constructor ────────────────────────────────────────────────

  /**
   * @param {Function}   onComplete  - called with collected values on finish
   * @param {OBDManager} obdManager  - optional OBDManager instance for OBD path
   */
  constructor(onComplete, obdManager) {
    this._onComplete    = onComplete;
    this._obdManager    = obdManager || null;
    this._stepIndex     = 0;
    this._values        = {};          // { efficiency, fuelNeeded, ... }
    this._selectedCar   = null;        // { make, model, year, combined } | null
    this._overlay       = null;

    // OBD path state
    this._obdPath       = false;       // true when user chose OBD path
    this._obdConnected  = false;       // true after BLE connect
    this._obdUpdateTimer = null;       // setInterval id for dashboard refresh
  }

  // ── Public API ─────────────────────────────────────────────────

  mount(parentEl) {
    this._overlay = document.createElement('div');
    this._overlay.className = 'wizard-overlay';
    parentEl.appendChild(this._overlay);
    this._render();
  }

  // ── Rendering ──────────────────────────────────────────────────

  _render() {
    const step    = Wizard.STEPS[this._stepIndex];
    const isFirst = this._stepIndex === 0;

    this._overlay.innerHTML = `
      <div class="wizard-card" id="wizard-card">
        ${this._buildProgressHTML(isFirst)}
        <div class="wizard-body ${this._bodyClass(step)}">
          ${this._buildBodyHTML(step)}
        </div>
        <div class="wizard-footer${isFirst ? ' wizard-footer--welcome' : ''}">
          ${this._buildFooterHTML(step, isFirst)}
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      const card = document.getElementById('wizard-card');
      if (card) card.classList.add('wizard-card--visible');
    });

    this._bindEvents(step);
  }

  // ── Footer builder ─────────────────────────────────────────────

  _buildFooterHTML(step, isFirst) {
    if (isFirst) {
      // Welcome: two CTA buttons
      return `
        <button class="wizard-btn wizard-btn--obd" id="wiz-obd" aria-label="Connect OBD-II Scanner">
          <svg class="wizard-btn__icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6.5 6.5l11 11M6.5 17.5l11-11M12 2v20"/>
          </svg>
          Connect OBD-II
        </button>
        <button class="wizard-btn wizard-btn--primary" id="wiz-next">
          Get Started
        </button>
      `;
    }

    const backBtn = this._stepIndex > 0
      ? '<button class="wizard-btn wizard-btn--ghost" id="wiz-back">Back</button>'
      : '<span></span>';

    // On the OBD step, disable the CTA until connected
    const obdDisabled = (step.type === 'obd-connect' && !this._obdConnected) ? '' : '';

    return `
      ${backBtn}
      <button class="wizard-btn wizard-btn--primary" id="wiz-next" ${obdDisabled}>
        ${this._ctaLabel(step)}
      </button>
    `;
  }

  _bodyClass(step) {
    switch (step.type) {
      case 'welcome':     return 'wizard-body--welcome';
      case 'car-search':  return 'wizard-body--car-search';
      case 'obd-connect': return 'wizard-body--obd-connect';
      default:            return '';
    }
  }

  // ── Progress dots ──────────────────────────────────────────────

  _buildProgressHTML(isFirst) {
    if (isFirst) return '';

    // Show only the steps relevant to the current path
    const trackable = this._getPathSteps();
    const dots = trackable.map(s => {
      const abs    = Wizard.STEPS.indexOf(s);
      const isDone = abs < this._stepIndex;
      const isCurr = abs === this._stepIndex;
      let cls = 'wizard-dot';
      if (isCurr) cls += ' wizard-dot--active';
      else if (isDone) cls += ' wizard-dot--done';
      return `<span class="${cls}"></span>`;
    }).join('');

    return `<div class="wizard-progress">${dots}</div>`;
  }

  /**
   * Returns steps to show as progress dots based on the active path.
   * Manual: car-search, (efficiency,) fuel, confirm
   * OBD:    car-search, obd-connect, confirm
   */
  _getPathSteps() {
    if (this._obdPath) {
      return Wizard.STEPS.filter(s =>
        s.type === 'car-search' || s.type === 'obd-connect' || s.type === 'confirm'
      );
    }
    return Wizard.STEPS.filter(s =>
      s.type !== 'welcome' && s.type !== 'obd-connect'
    );
  }

  /**
   * Returns a dynamic step label ("Step N of M") for the current step.
   */
  _getStepLabel() {
    const pathSteps = this._getPathSteps().filter(s => s.type !== 'confirm');
    const step = Wizard.STEPS[this._stepIndex];
    const idx  = pathSteps.indexOf(step);
    if (idx === -1) return '';
    return `Step ${idx + 1} of ${pathSteps.length}`;
  }

  // ── Body HTML ──────────────────────────────────────────────────

  _buildBodyHTML(step) {
    switch (step.type) {

      case 'welcome':
        return `
          <div class="wizard-welcome-mark" aria-hidden="true"></div>
          <p class="wizard-eyebrow">Ottawa &mdash; Gas Price Analysis</p>
          <h2 class="wizard-heading">Smart Gas Map</h2>
          <p class="wizard-desc">
            Find out whether driving further for cheaper gas is actually worth it &mdash;
            accounting for traffic, stop-and-go city driving, and time-of-day pricing.
          </p>
          <p class="wizard-desc wizard-desc--sub">
            Enter your car manually, or connect your OBD-II Bluetooth scanner
            for live trip analysis.
          </p>
        `;

      case 'car-search': {
        const stepLabel = this._getStepLabel();
        const chipVisible  = this._selectedCar ? 'wizard-car-chip--visible' : '';
        const chipName     = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : '';
        const chipEff      = this._selectedCar ? `${this._selectedCar.combined} L/100km` : '';
        const searchVal    = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : (this._values._searchQuery || '');
        const clearDisplay = searchVal ? 'display:block' : '';

        // Context-sensitive description
        const desc = this._obdPath
          ? 'Search by make or model for accurate tank capacity and trip analysis. ' +
            'You can also skip and use defaults.'
          : step.description;

        const skipText = this._obdPath
          ? 'Skip — use default values'
          : 'Enter fuel efficiency manually instead';

        return `
          <p class="wizard-step-label">${stepLabel}</p>
          <h2 class="wizard-heading">${step.heading}</h2>
          <p class="wizard-desc">${desc}</p>

          <!-- Selected car chip (shown after selection) -->
          <div class="wizard-car-chip ${chipVisible}" id="wiz-chip">
            <span class="wizard-car-chip__name">${chipName}</span>
            <span class="wizard-car-chip__eff">${chipEff}</span>
            <button class="wizard-car-chip__clear" id="wiz-chip-clear" aria-label="Clear selection">
              &times; Clear
            </button>
          </div>

          <!-- Search field (hidden once a car is selected) -->
          <div class="wizard-search-wrap" id="wiz-search-wrap"
               style="${this._selectedCar ? 'display:none' : ''}">
            <input
              class="wizard-search-input"
              type="text"
              id="wiz-car-search"
              placeholder="e.g. Kia Telluride, Honda Civic..."
              value="${searchVal}"
              autocomplete="off"
              aria-label="Search your car"
            />
            <button class="wizard-search-clear" id="wiz-search-clear"
                    style="${clearDisplay}" aria-label="Clear search">&times;</button>
          </div>

          <!-- Results list -->
          <div class="wizard-car-results" id="wiz-results"></div>

          <!-- Skip link -->
          <button class="wizard-skip-link" id="wiz-skip">
            ${skipText}
          </button>
        `;
      }

      case 'input':
        return `
          <p class="wizard-step-label">${this._getStepLabel()}</p>
          <h2 class="wizard-heading">${step.heading}</h2>
          <p class="wizard-desc">${step.description}</p>
          <div class="wizard-input-wrap">
            <input
              class="wizard-input"
              type="number"
              id="${step.inputId}"
              min="${step.min}"
              max="${step.max}"
              step="${step.step}"
              value="${this._values[step.resultKey] ?? step.defaultVal}"
              aria-label="${step.heading}"
            />
            <span class="wizard-unit">${step.unit}</span>
          </div>
        `;

      case 'obd-connect': {
        const stepLabel = this._getStepLabel();
        const isConn = this._obdManager && this._obdManager.isConnected;

        return `
          <p class="wizard-step-label">${stepLabel}</p>
          <h2 class="wizard-heading">${step.heading}</h2>
          <p class="wizard-desc">${step.description}</p>

          <!-- Pre-connection: scan button -->
          <div class="wiz-obd-pre" id="wiz-obd-pre" style="${isConn ? 'display:none' : ''}">
            <button class="wiz-obd-scan-btn" id="wiz-obd-scan">
              <span class="wiz-obd-scan-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6.5 6.5l11 11M6.5 17.5l11-11M12 2v20"/>
                </svg>
              </span>
              <span class="wiz-obd-scan-text" id="wiz-obd-scan-text">Scan for Adapter</span>
            </button>
            <p class="wiz-obd-hint">
              Make sure your ELM327 adapter (e.g. Veepeak Mini) is plugged into the OBD port
              and the engine is running.
            </p>
          </div>

          <!-- Post-connection: live trip dashboard -->
          <div class="wiz-obd-dash" id="wiz-obd-dash" style="${isConn ? '' : 'display:none'}">
            <div class="wiz-obd-connected-badge" id="wiz-obd-badge">
              <span class="wiz-obd-conn-dot"></span>
              <span>Connected</span>
            </div>

            <div class="wiz-obd-stats">
              <div class="wiz-obd-stat">
                <span class="wiz-obd-stat__icon">⛽</span>
                <div class="wiz-obd-stat__body">
                  <span class="wiz-obd-stat__label">Fuel Level</span>
                  <span class="wiz-obd-stat__value" id="wiz-fuel-val">—</span>
                </div>
              </div>
              <div class="wiz-obd-stat">
                <span class="wiz-obd-stat__icon">📊</span>
                <div class="wiz-obd-stat__body">
                  <span class="wiz-obd-stat__label">Live Efficiency</span>
                  <span class="wiz-obd-stat__value" id="wiz-eff-val">—</span>
                </div>
              </div>
              <div class="wiz-obd-stat">
                <span class="wiz-obd-stat__icon">🛣️</span>
                <div class="wiz-obd-stat__body">
                  <span class="wiz-obd-stat__label">Est. Range</span>
                  <span class="wiz-obd-stat__value" id="wiz-range-val">—</span>
                </div>
              </div>
              <div class="wiz-obd-stat wiz-obd-stat--grade">
                <span class="wiz-obd-stat__icon">🏆</span>
                <div class="wiz-obd-stat__body">
                  <span class="wiz-obd-stat__label">Grade</span>
                  <span class="wiz-obd-stat__value wiz-obd-grade" id="wiz-grade-val">—</span>
                </div>
              </div>
            </div>

            <div class="wiz-obd-trip-alert wiz-obd-trip-alert--neutral" id="wiz-trip-alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 2L2 22h20L12 2zM12 9v5M12 17h.01"/>
              </svg>
              <span id="wiz-trip-msg">Analyzing trip data…</span>
            </div>
          </div>

          <!-- Fallback: skip OBD and enter manually -->
          <button class="wizard-skip-link" id="wiz-obd-skip">
            Skip — enter values manually instead
          </button>
        `;
      }

      case 'confirm': {
        const eff  = this._values.efficiency ?? '–';
        const fuel = this._values.fuelNeeded  ?? '–';
        const car  = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : null;

        // OBD trip analysis rows for the summary table
        let tripRows = '';
        if (this._obdPath && this._values._obdRange) {
          const range = Math.round(this._values._obdRange);
          const grade = this._values._obdGrade || { label: '—', color: 'var(--text-muted)' };
          const alert = this._tripAlert(range);
          tripRows = `
            <div class="wizard-summary-row">
              <span>Est. Range</span>
              <strong>${range} km</strong>
            </div>
            <div class="wizard-summary-row">
              <span>Efficiency Grade</span>
              <strong style="color:${grade.color}">${grade.label}</strong>
            </div>
            <div class="wizard-summary-row wiz-confirm-alert wiz-confirm-alert--${alert.type}">
              <span colspan="2">${alert.text}</span>
            </div>
          `;
        }

        const descText = this._obdPath
          ? 'Live OBD data is powering your trip analysis. The app will find the best gas station and tell you when to stop.'
          : 'The app will calculate the true cost of each station including the fuel burned getting there.';

        return `
          <h2 class="wizard-heading">All Set</h2>
          <p class="wizard-desc">
            ${car ? `Your <strong>${car}</strong> uses` : 'Your car uses'}
            <strong>${eff}&thinsp;L/100&thinsp;km</strong> and you plan to pump
            <strong>${fuel}&thinsp;litres</strong>.
            ${descText}
          </p>
          <div class="wizard-summary">
            ${car ? `<div class="wizard-summary-row"><span>Vehicle</span><strong>${car}</strong></div>` : ''}
            <div class="wizard-summary-row">
              <span>Fuel efficiency</span>
              <strong>${eff} L / 100 km</strong>
            </div>
            <div class="wizard-summary-row">
              <span>Fuel to pump</span>
              <strong>${fuel} L</strong>
            </div>
            ${tripRows}
          </div>
        `;
      }

      default:
        return '';
    }
  }

  _ctaLabel(step) {
    switch (step.type) {
      case 'welcome':     return 'Get Started';
      case 'car-search':  return this._selectedCar ? 'Continue' : 'Skip';
      case 'input':       return 'Continue';
      case 'obd-connect': return this._obdConnected ? 'Continue' : 'Skip Scanner';
      case 'confirm':     return 'Find Best Price';
      default:            return 'Next';
    }
  }

  // ── Event binding ──────────────────────────────────────────────

  _bindEvents(step) {
    const nextBtn = document.getElementById('wiz-next');
    const backBtn = document.getElementById('wiz-back');

    if (step.type === 'welcome') {
      // "Get Started" → manual path
      if (nextBtn) nextBtn.addEventListener('click', () => {
        this._obdPath = false;
        this._advance();
      });
      // "Connect OBD-II" → OBD path
      const obdBtn = document.getElementById('wiz-obd');
      if (obdBtn) obdBtn.addEventListener('click', () => {
        this._obdPath = true;
        this._advance();
      });
      return;
    }

    if (nextBtn) nextBtn.addEventListener('click', () => this._advance());
    if (backBtn) backBtn.addEventListener('click', () => this._retreat());

    if (step.type === 'car-search') {
      this._bindCarSearchEvents();
    }

    if (step.type === 'input') {
      const input = document.getElementById(step.inputId);
      if (input) {
        input.focus();
        input.select();
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') this._advance();
        });
      }
    }

    if (step.type === 'obd-connect') {
      this._bindOBDEvents();
    }
  }

  // ── Car search events (unchanged from original) ────────────────

  _bindCarSearchEvents() {
    const searchInput = document.getElementById('wiz-car-search');
    const resultsEl   = document.getElementById('wiz-results');
    const clearBtn    = document.getElementById('wiz-search-clear');
    const chipEl      = document.getElementById('wiz-chip');
    const chipClear   = document.getElementById('wiz-chip-clear');
    const skipBtn     = document.getElementById('wiz-skip');
    const searchWrap  = document.getElementById('wiz-search-wrap');

    if (this._selectedCar) {
      chipEl.classList.add('wizard-car-chip--visible');
      searchWrap.style.display = 'none';
    }

    // Live filtering
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        this._values._searchQuery = searchInput.value;

        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

        if (q.length < 2) {
          resultsEl.classList.remove('wizard-car-results--open');
          resultsEl.innerHTML = '';
          return;
        }

        const matches = CAR_DATABASE.filter(car => {
          const haystack = `${car.make} ${car.model} ${car.year}`.toLowerCase();
          return haystack.includes(q);
        }).slice(0, 7);

        if (matches.length === 0) {
          resultsEl.classList.remove('wizard-car-results--open');
          resultsEl.innerHTML = '';
          return;
        }

        resultsEl.innerHTML = matches.map((car, i) =>
          `<div class="wizard-car-option" data-index="${i}">
            <span class="wizard-car-name">${car.year} ${car.make} ${car.model}</span>
            <span class="wizard-car-eff">${car.combined} L/100km</span>
          </div>`
        ).join('');

        resultsEl.classList.add('wizard-car-results--open');

        resultsEl.querySelectorAll('.wizard-car-option').forEach((el, i) => {
          el.addEventListener('click', () => this._selectCar(matches[i]));
        });
      });

      if (searchInput.value) {
        searchInput.dispatchEvent(new Event('input'));
      }
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this._values._searchQuery = '';
        clearBtn.style.display = 'none';
        resultsEl.classList.remove('wizard-car-results--open');
        resultsEl.innerHTML = '';
        searchInput.focus();
      });
    }

    if (chipClear) {
      chipClear.addEventListener('click', () => {
        this._selectedCar = null;
        chipEl.classList.remove('wizard-car-chip--visible');
        searchWrap.style.display = '';
        resultsEl.classList.remove('wizard-car-results--open');
        resultsEl.innerHTML = '';
        searchInput.value = '';
        this._values._searchQuery = '';
        if (clearBtn) clearBtn.style.display = 'none';
        const nextBtn = document.getElementById('wiz-next');
        if (nextBtn) nextBtn.textContent = 'Skip';
        searchInput.focus();
      });
    }

    // Skip link: path-aware destination
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this._selectedCar = null;
        if (this._obdPath) {
          this._transition(4); // OBD connect
        } else {
          this._transition(2); // efficiency
        }
      });
    }
  }

  _selectCar(car) {
    this._selectedCar = car;

    const chipEl   = document.getElementById('wiz-chip');
    const nameEl   = chipEl.querySelector('.wizard-car-chip__name');
    const effEl    = chipEl.querySelector('.wizard-car-chip__eff');
    const wrapEl   = document.getElementById('wiz-search-wrap');
    const resultsEl = document.getElementById('wiz-results');
    const nextBtn   = document.getElementById('wiz-next');

    nameEl.textContent = `${car.year} ${car.make} ${car.model}`;
    effEl.textContent  = `${car.combined} L/100km`;
    chipEl.classList.add('wizard-car-chip--visible');

    wrapEl.style.display = 'none';
    resultsEl.classList.remove('wizard-car-results--open');

    if (nextBtn) nextBtn.textContent = 'Continue';
  }

  // ── OBD connect step events ────────────────────────────────────

  _bindOBDEvents() {
    const scanBtn   = document.getElementById('wiz-obd-scan');
    const scanText  = document.getElementById('wiz-obd-scan-text');
    const skipBtn   = document.getElementById('wiz-obd-skip');

    // Scan button → trigger Bluetooth pairing
    if (scanBtn && this._obdManager) {
      scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        if (scanText) scanText.textContent = 'Scanning…';
        scanBtn.classList.add('wiz-obd-scan-btn--scanning');

        const ok = await this._obdManager.connect();

        scanBtn.classList.remove('wiz-obd-scan-btn--scanning');
        if (ok) {
          this._obdConnected = true;
          const pre  = document.getElementById('wiz-obd-pre');
          const dash = document.getElementById('wiz-obd-dash');
          if (pre)  pre.style.display  = 'none';
          if (dash) dash.style.display = 'block';

          const nextBtn = document.getElementById('wiz-next');
          if (nextBtn) nextBtn.textContent = 'Continue';

          this._startOBDUpdates();
        } else {
          scanBtn.disabled = false;
          if (scanText) scanText.textContent = 'Try Again';
        }
      });
    } else if (scanBtn && !this._obdManager) {
      // No OBD manager — show unsupported message
      scanBtn.addEventListener('click', () => {
        const hint = document.querySelector('.wiz-obd-hint');
        if (hint) hint.textContent = 'Web Bluetooth is not available. Use Chrome on Windows with Bluetooth enabled.';
        hint?.classList.add('wiz-obd-hint--error');
      });
    }

    // Skip link → fall back to manual path
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this._stopOBDUpdates();
        this._obdPath = false;
        this._transition(2); // go to efficiency step (manual path)
      });
    }

    // If already connected (navigated back to this step)
    if (this._obdManager && this._obdManager.isConnected) {
      this._obdConnected = true;
      const pre  = document.getElementById('wiz-obd-pre');
      const dash = document.getElementById('wiz-obd-dash');
      if (pre)  pre.style.display  = 'none';
      if (dash) dash.style.display = 'block';

      const nextBtn = document.getElementById('wiz-next');
      if (nextBtn) nextBtn.textContent = 'Continue';

      this._startOBDUpdates();
    }
  }

  // ── OBD live dashboard updates ─────────────────────────────────

  _startOBDUpdates() {
    this._refreshOBDDashboard();
    this._obdUpdateTimer = setInterval(() => this._refreshOBDDashboard(), 600);
  }

  _stopOBDUpdates() {
    if (this._obdUpdateTimer) {
      clearInterval(this._obdUpdateTimer);
      this._obdUpdateTimer = null;
    }
  }

  _refreshOBDDashboard() {
    if (!this._obdManager) return;
    const m = this._obdManager.metrics;

    // Fuel level
    const fuelEl = document.getElementById('wiz-fuel-val');
    if (fuelEl) {
      fuelEl.textContent = (m.fuel !== null && m.fuel !== undefined)
        ? m.fuel + '%'
        : '—';
    }

    // Live efficiency estimate
    const eff = this._liveEfficiency(m);
    const effEl = document.getElementById('wiz-eff-val');
    if (effEl) {
      effEl.textContent = eff !== null
        ? eff.toFixed(1) + ' L/100km'
        : '—';
    }

    // Estimated range
    const range = this._estimateRange(m, eff);
    const rangeEl = document.getElementById('wiz-range-val');
    if (rangeEl) {
      rangeEl.textContent = range !== null
        ? Math.round(range) + ' km'
        : '—';
    }

    // Efficiency grade
    const grade = this._efficiencyGrade(eff || (this._selectedCar?.combined));
    const gradeEl = document.getElementById('wiz-grade-val');
    if (gradeEl) {
      gradeEl.textContent = grade.label;
      gradeEl.style.color = grade.color;
    }

    // Trip alert
    const alertEl  = document.getElementById('wiz-trip-alert');
    const alertMsg = document.getElementById('wiz-trip-msg');
    if (alertEl && alertMsg) {
      const alert = this._tripAlert(range);
      alertMsg.textContent = alert.text;
      alertEl.className = 'wiz-obd-trip-alert wiz-obd-trip-alert--' + alert.type;
    }

    // Stash computed values for the confirm step
    this._values._obdEfficiency = eff;
    this._values._obdRange      = range;
    this._values._obdGrade      = grade;
  }

  // ── OBD analysis helpers ───────────────────────────────────────

  /**
   * Estimates current fuel consumption (L/100km) from OBD metrics.
   * Simplified model based on RPM + throttle + speed.
   */
  _liveEfficiency(metrics) {
    const { speed, rpm, throttle } = metrics;
    if (!speed || speed < 5 || !rpm) return null;

    const idleRate    = 2.0;    // L/h at idle
    const throttlePct = (throttle ?? 20) / 100;
    const rpmFactor   = Math.max(0.3, rpm / 6000);
    const fuelRate    = idleRate + (8.0 * rpmFactor * throttlePct);
    const lPer100km   = (fuelRate / speed) * 100;

    return (lPer100km > 3 && lPer100km < 40) ? lPer100km : null;
  }

  /**
   * Returns the tank capacity in litres for the selected car,
   * or DEFAULT_TANK if unknown.
   */
  _getTankCapacity() {
    if (this._selectedCar) {
      const key = `${this._selectedCar.make} ${this._selectedCar.model}`;
      if (Wizard.TANK_MAP[key]) return Wizard.TANK_MAP[key];
    }
    return Wizard.DEFAULT_TANK;
  }

  /**
   * Estimates remaining driving range in km.
   */
  _estimateRange(metrics, efficiency) {
    if (metrics.fuel === null || metrics.fuel === undefined) return null;
    const eff = efficiency || (this._selectedCar?.combined) || 10;
    const tankCap = this._getTankCapacity();
    const fuelRemaining = (metrics.fuel / 100) * tankCap;
    return (fuelRemaining / eff) * 100;
  }

  /**
   * Grades fuel efficiency: A+ through F.
   */
  _efficiencyGrade(eff) {
    if (!eff) return { label: '—', color: 'var(--text-muted)' };
    if (eff <= 6)  return { label: 'A+', color: '#2DB86A' };
    if (eff <= 8)  return { label: 'A',  color: '#2DB86A' };
    if (eff <= 10) return { label: 'B',  color: '#38bdf8' };
    if (eff <= 13) return { label: 'C',  color: '#f59e0b' };
    if (eff <= 16) return { label: 'D',  color: '#fb923c' };
    return                { label: 'F',  color: '#ef4444' };
  }

  /**
   * Generates a contextual trip alert based on estimated range.
   */
  _tripAlert(range) {
    if (range === null || range === undefined) {
      return { text: 'Waiting for fuel level data…', type: 'neutral' };
    }
    if (range > 500) return { text: `Plenty of fuel — no stop needed for ~${Math.round(range)} km.`, type: 'good' };
    if (range > 200) return { text: `You can travel ~${Math.round(range)} km before refueling.`,     type: 'ok' };
    if (range > 50)  return { text: `Consider refueling within the next ~${Math.round(range)} km.`,  type: 'warn' };
    return             { text: `Low fuel! Only ~${Math.round(range)} km remaining. Refuel soon.`,    type: 'danger' };
  }

  // ── Navigation ─────────────────────────────────────────────────

  _getNextStepIndex() {
    const step = Wizard.STEPS[this._stepIndex];

    // Welcome → car search (both paths)
    if (step.type === 'welcome') return 1;

    // Car search
    if (step.type === 'car-search') {
      if (this._obdPath)     return 4; // → OBD connect
      if (this._selectedCar) return 3; // → fuel (skip efficiency)
      return 2;                        // → efficiency
    }

    // Fuel to pump → confirm (skip OBD step on manual path)
    if (this._stepIndex === 3) return 5;

    // OBD connect → confirm
    if (step.type === 'obd-connect') return 5;

    return this._stepIndex + 1;
  }

  _getPrevStepIndex() {
    // Confirm → back depends on path
    if (this._stepIndex === 5) {
      return this._obdPath ? 4 : 3;
    }

    // OBD connect → car search
    if (this._stepIndex === 4) return 1;

    // Fuel to pump with car selected → car search (skip efficiency)
    if (this._stepIndex === 3 && this._selectedCar) return 1;

    return this._stepIndex - 1;
  }

  _advance() {
    const step = Wizard.STEPS[this._stepIndex];

    // Validate input steps
    if (step.type === 'input') {
      const input = document.getElementById(step.inputId);
      const val   = parseFloat(input.value);
      if (!val || val < step.min || val > step.max) {
        this._shakeInput(input);
        return;
      }
      this._values[step.resultKey] = val;
    }

    // Car-search: auto-populate efficiency from selected car
    if (step.type === 'car-search' && this._selectedCar) {
      this._values.efficiency = this._selectedCar.combined;
    }

    // OBD connect: extract live values for confirm step
    if (step.type === 'obd-connect') {
      this._stopOBDUpdates();

      if (this._obdManager && this._obdManager.isConnected) {
        const metrics = this._obdManager.metrics;

        // Use OBD efficiency if available, else car database value
        const obdEff = this._liveEfficiency(metrics);
        if (obdEff) {
          this._values.efficiency = Math.round(obdEff * 10) / 10;
        } else if (this._selectedCar) {
          this._values.efficiency = this._selectedCar.combined;
        } else if (!this._values.efficiency) {
          this._values.efficiency = 9.5;
        }

        // Calculate fuel to pump from fuel level
        const tankCap = this._getTankCapacity();
        if (metrics.fuel !== null && metrics.fuel !== undefined) {
          const fuelRemaining = (metrics.fuel / 100) * tankCap;
          const fuelToPump = Math.round(tankCap - fuelRemaining);
          this._values.fuelNeeded = Math.max(1, fuelToPump);
        } else {
          this._values.fuelNeeded = this._values.fuelNeeded || 40;
        }

        // Range + grade for confirm display
        const range = this._estimateRange(metrics, this._values.efficiency);
        const grade = this._efficiencyGrade(obdEff || this._values.efficiency);
        this._values._obdRange = range;
        this._values._obdGrade = grade;
      } else {
        // OBD was skipped — ensure we have defaults
        if (!this._values.efficiency) {
          this._values.efficiency = this._selectedCar?.combined || 9.5;
        }
        if (!this._values.fuelNeeded) {
          this._values.fuelNeeded = 40;
        }
      }
    }

    const isLast = this._stepIndex === Wizard.STEPS.length - 1;
    if (isLast) {
      this._complete();
    } else {
      this._transition(this._getNextStepIndex());
    }
  }

  _retreat() {
    if (this._stepIndex > 0) {
      this._transition(this._getPrevStepIndex());
    }
  }

  _transition(nextIndex) {
    // Clean up OBD polling if leaving the OBD step
    if (Wizard.STEPS[this._stepIndex].type === 'obd-connect') {
      this._stopOBDUpdates();
    }

    const card = document.getElementById('wizard-card');
    if (card) card.classList.add('wizard-card--exit');
    setTimeout(() => {
      this._stepIndex = nextIndex;
      this._render();
    }, 180);
  }

  _complete() {
    this._stopOBDUpdates();

    const card = document.getElementById('wizard-card');
    if (card) card.classList.add('wizard-card--exit');

    setTimeout(() => {
      this._overlay.classList.add('wizard-overlay--exit');
      setTimeout(() => {
        this._overlay.remove();

        // Build payload: strip internal keys
        const { _searchQuery, _obdEfficiency, _obdRange, _obdGrade, ...payload } = this._values;

        if (this._selectedCar) {
          payload.carName =
            `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`;
        }

        // Include trip analysis if OBD was used
        if (this._obdPath) {
          payload.obdConnected = true;
          if (_obdRange) payload.obdRange = Math.round(_obdRange);
          if (_obdGrade) payload.obdGrade = _obdGrade.label;
        }

        this._onComplete(payload);
      }, 380);
    }, 180);
  }

  // ── Helpers ────────────────────────────────────────────────────

  _shakeInput(input) {
    input.classList.add('wizard-input--error');
    input.focus();
    setTimeout(() => input.classList.remove('wizard-input--error'), 500);
  }
}
