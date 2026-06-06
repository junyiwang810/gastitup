/**
 * Wizard.js
 *
 * A multi-step onboarding overlay that collects user inputs before
 * the main map is revealed. It mounts itself onto a parent element,
 * manages step transitions and custom navigation, validates inputs,
 * and calls an onComplete callback with the collected values.
 *
 * Steps:
 *   0 — Welcome        (info card)
 *   1 — Car Search     (live-filter search → auto-fills efficiency)
 *   2 — Fuel Efficiency (manual input, skipped when a car is selected)
 *   3 — Fuel to Pump   (number input)
 *   4 — Confirm        (summary + launch button)
 *
 * Navigation rules:
 *   Car Search → Next with car selected   : jump to step 3 (skip efficiency)
 *   Car Search → Next without car selected : go to step 2 (efficiency)
 *   Fuel to Pump → Back with car selected : jump to step 1 (skip efficiency)
 *   Fuel to Pump → Back without car       : go to step 2 (efficiency)
 *
 * Dependencies: carData.js (CAR_DATABASE global), styles.css
 * Used by: App.js
 */

class Wizard {

  // ── Step configuration ─────────────────────────────────────────
  static STEPS = [
    {
      type: 'welcome'
    },
    {
      type:        'car-search',
      stepLabel:   'Step 1 of 3',
      heading:     'Find Your Car',
      description: 'Search by make or model to automatically set your fuel efficiency. ' +
                   'You can also enter it manually on the next step.'
    },
    {
      type:        'input',
      stepLabel:   'Step 2 of 3',
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
    {
      type:        'input',
      stepLabel:   'Step 3 of 3',
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
    {
      type: 'confirm'
    }
  ];

  // ── Constructor ────────────────────────────────────────────────

  /**
   * @param {Function} onComplete - called with { efficiency, fuelNeeded, carName? }
   *                                once the user reaches the final step.
   */
  constructor(onComplete) {
    this._onComplete   = onComplete;
    this._stepIndex    = 0;
    this._values       = {};     // { efficiency, fuelNeeded }
    this._selectedCar  = null;  // { make, model, year, combined } | null
    this._overlay      = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Creates the overlay element and appends it to parentEl.
   * The overlay covers the full viewport; the map renders beneath it.
   *
   * @param {HTMLElement} parentEl
   */
  mount(parentEl) {
    this._overlay = document.createElement('div');
    this._overlay.className = 'wizard-overlay';
    parentEl.appendChild(this._overlay);
    this._render();
  }

  // ── Rendering ──────────────────────────────────────────────────

  /**
   * Builds and injects the HTML for the current step,
   * then triggers the entrance animation and binds events.
   */
  _render() {
    const step    = Wizard.STEPS[this._stepIndex];
    const isFirst = this._stepIndex === 0;

    this._overlay.innerHTML = `
      <div class="wizard-card" id="wizard-card">
        ${this._buildProgressHTML(isFirst)}
        <div class="wizard-body ${this._bodyClass(step)}">
          ${this._buildBodyHTML(step)}
        </div>
        <div class="wizard-footer">
          ${!isFirst
            ? '<button class="wizard-btn wizard-btn--ghost" id="wiz-back">Back</button>'
            : '<span></span>'
          }
          <button class="wizard-btn wizard-btn--primary" id="wiz-next">
            ${this._ctaLabel(step)}
          </button>
        </div>
      </div>
    `;

    // Entrance animation — run on next paint so CSS transition fires
    requestAnimationFrame(() => {
      const card = document.getElementById('wizard-card');
      if (card) card.classList.add('wizard-card--visible');
    });

    this._bindEvents(step);
  }

  /**
   * Returns the BEM modifier class for the body div.
   * @param {object} step
   * @returns {string}
   */
  _bodyClass(step) {
    switch (step.type) {
      case 'welcome':    return 'wizard-body--welcome';
      case 'car-search': return 'wizard-body--car-search';
      default:           return '';
    }
  }

  /**
   * Builds the step progress dots. Hidden on the welcome screen.
   * @param {boolean} isFirst
   * @returns {string} HTML
   */
  _buildProgressHTML(isFirst) {
    if (isFirst) return '';
    const trackable = Wizard.STEPS.filter(s => s.type !== 'welcome');
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
   * Builds the main content HTML for a step, based on its type.
   * @param {object} step
   * @returns {string} HTML
   */
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
        `;

      case 'car-search': {
        const chipVisible  = this._selectedCar ? 'wizard-car-chip--visible' : '';
        const chipName     = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : '';
        const chipEff      = this._selectedCar ? `${this._selectedCar.combined} L/100km` : '';
        const searchVal    = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : (this._values._searchQuery || '');
        const clearDisplay = searchVal ? 'display:block' : '';

        return `
          <p class="wizard-step-label">${step.stepLabel}</p>
          <h2 class="wizard-heading">${step.heading}</h2>
          <p class="wizard-desc">${step.description}</p>

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
              placeholder="e.g. Honda Civic, Toyota RAV4..."
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
            Enter fuel efficiency manually instead
          </button>
        `;
      }

      case 'input':
        return `
          <p class="wizard-step-label">${step.stepLabel}</p>
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

      case 'confirm': {
        const eff  = this._values.efficiency ?? '–';
        const fuel = this._values.fuelNeeded  ?? '–';
        const car  = this._selectedCar
          ? `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`
          : null;
        return `
          <h2 class="wizard-heading">All Set</h2>
          <p class="wizard-desc">
            ${car ? `Your <strong>${car}</strong> uses` : 'Your car uses'}
            <strong>${eff}&thinsp;L/100&thinsp;km</strong> and you plan to pump
            <strong>${fuel}&thinsp;litres</strong>.
            The app will calculate the true cost of each station including the fuel burned getting there.
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
          </div>
        `;
      }

      default:
        return '';
    }
  }

  /** @param {object} step @returns {string} CTA button label */
  _ctaLabel(step) {
    switch (step.type) {
      case 'welcome':    return 'Get Started';
      case 'car-search': return this._selectedCar ? 'Continue' : 'Skip';
      case 'input':      return 'Continue';
      case 'confirm':    return 'Find Best Price';
      default:           return 'Next';
    }
  }

  // ── Event binding ──────────────────────────────────────────────

  /**
   * Attaches all event listeners for the current step.
   * @param {object} step
   */
  _bindEvents(step) {
    const nextBtn = document.getElementById('wiz-next');
    const backBtn = document.getElementById('wiz-back');
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
  }

  /**
   * Wires up all interactivity for the car-search step:
   *   - Live filter on keyup
   *   - Clear button inside search field
   *   - Result row click → select car
   *   - Chip clear button → deselect car
   *   - Skip link → go to efficiency step directly
   */
  _bindCarSearchEvents() {
    const searchInput = document.getElementById('wiz-car-search');
    const resultsEl   = document.getElementById('wiz-results');
    const clearBtn    = document.getElementById('wiz-search-clear');
    const chipEl      = document.getElementById('wiz-chip');
    const chipClear   = document.getElementById('wiz-chip-clear');
    const skipBtn     = document.getElementById('wiz-skip');
    const searchWrap  = document.getElementById('wiz-search-wrap');

    // If a car is already selected, show chip, hide search
    if (this._selectedCar) {
      chipEl.classList.add('wizard-car-chip--visible');
      searchWrap.style.display = 'none';
    }

    // Live filtering
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        this._values._searchQuery = searchInput.value; // persist across re-renders

        // Toggle clear button
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

        if (q.length < 2) {
          resultsEl.classList.remove('wizard-car-results--open');
          resultsEl.innerHTML = '';
          return;
        }

        // Filter and score: matches at start of make get priority
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

        // Bind click on each result row
        resultsEl.querySelectorAll('.wizard-car-option').forEach((el, i) => {
          el.addEventListener('click', () => this._selectCar(matches[i]));
        });
      });

      // Trigger filter if there's a pre-existing query (coming back from next step)
      if (searchInput.value) {
        searchInput.dispatchEvent(new Event('input'));
      }
    }

    // Clear search field
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

    // Clear selected car chip
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
        // Update CTA label to "Skip"
        const nextBtn = document.getElementById('wiz-next');
        if (nextBtn) nextBtn.textContent = 'Skip';
        searchInput.focus();
      });
    }

    // Skip link → go directly to efficiency step
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this._selectedCar = null;
        this._transition(2); // step 2 = efficiency
      });
    }
  }

  /**
   * Selects a car from the results list.
   * Hides the search field, shows the selected chip, updates the CTA.
   *
   * @param {{ year, make, model, combined }} car
   */
  _selectCar(car) {
    this._selectedCar = car;

    // Populate chip
    const chipEl   = document.getElementById('wiz-chip');
    const nameEl   = chipEl.querySelector('.wizard-car-chip__name');
    const effEl    = chipEl.querySelector('.wizard-car-chip__eff');
    const wrapEl   = document.getElementById('wiz-search-wrap');
    const resultsEl = document.getElementById('wiz-results');
    const nextBtn   = document.getElementById('wiz-next');

    nameEl.textContent = `${car.year} ${car.make} ${car.model}`;
    effEl.textContent  = `${car.combined} L/100km`;
    chipEl.classList.add('wizard-car-chip--visible');

    // Hide search, collapse results
    wrapEl.style.display = 'none';
    resultsEl.classList.remove('wizard-car-results--open');

    // Update CTA to "Continue"
    if (nextBtn) nextBtn.textContent = 'Continue';
  }

  // ── Navigation ─────────────────────────────────────────────────

  /**
   * Returns the index of the next step, applying skip logic
   * when a car has been selected (bypass the efficiency step).
   * @returns {number}
   */
  _getNextStepIndex() {
    // Advancing from car-search with a car selected → skip efficiency (step 2)
    if (Wizard.STEPS[this._stepIndex].type === 'car-search' && this._selectedCar) {
      return this._stepIndex + 2;
    }
    return this._stepIndex + 1;
  }

  /**
   * Returns the index of the previous step, applying skip logic
   * when a car has been selected (bypass the efficiency step going back).
   * @returns {number}
   */
  _getPrevStepIndex() {
    // Retreating from fuel-needed (step 3) when efficiency was skipped → back to car-search (step 1)
    if (this._stepIndex === 3 && this._selectedCar) {
      return 1;
    }
    return this._stepIndex - 1;
  }

  /**
   * Validates the current step (input steps only), saves the value,
   * then either advances to the next step or completes the wizard.
   */
  _advance() {
    const step = Wizard.STEPS[this._stepIndex];

    if (step.type === 'input') {
      const input = document.getElementById(step.inputId);
      const val   = parseFloat(input.value);
      if (!val || val < step.min || val > step.max) {
        this._shakeInput(input);
        return;
      }
      this._values[step.resultKey] = val;
    }

    // Car-search step: auto-populate efficiency from selected car
    if (step.type === 'car-search' && this._selectedCar) {
      this._values.efficiency = this._selectedCar.combined;
    }

    const isLast = this._stepIndex === Wizard.STEPS.length - 1;
    if (isLast) {
      this._complete();
    } else {
      this._transition(this._getNextStepIndex());
    }
  }

  /**
   * Returns to the previous step (with skip logic).
   */
  _retreat() {
    if (this._stepIndex > 0) {
      this._transition(this._getPrevStepIndex());
    }
  }

  /**
   * Fades out the current card, updates step index, re-renders.
   * @param {number} nextIndex
   */
  _transition(nextIndex) {
    const card = document.getElementById('wizard-card');
    if (card) card.classList.add('wizard-card--exit');
    setTimeout(() => {
      this._stepIndex = nextIndex;
      this._render();
    }, 180);
  }

  /**
   * Animates the wizard out and calls onComplete with the collected values.
   */
  _complete() {
    const card = document.getElementById('wizard-card');
    if (card) card.classList.add('wizard-card--exit');

    setTimeout(() => {
      this._overlay.classList.add('wizard-overlay--exit');
      setTimeout(() => {
        this._overlay.remove();

        // Build the payload: strip the internal _searchQuery key
        const { _searchQuery, ...payload } = this._values;

        // If a car was used, include its display name
        if (this._selectedCar) {
          payload.carName =
            `${this._selectedCar.year} ${this._selectedCar.make} ${this._selectedCar.model}`;
        }

        this._onComplete(payload);
      }, 380);
    }, 180);
  }

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Applies a brief shake animation to signal a validation failure.
   * @param {HTMLInputElement} input
   */
  _shakeInput(input) {
    input.classList.add('wizard-input--error');
    input.focus();
    setTimeout(() => input.classList.remove('wizard-input--error'), 500);
  }
}
