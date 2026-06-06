/**
 * UIManager.js
 *
 * Owns all DOM reads and writes for the sidebar and floating overlay.
 * No calculations happen here — UIManager only presents data that
 * App.js passes to it.
 *
 * Responsibilities:
 *   - Cache references to every DOM element on construction.
 *   - Update the live clock display.
 *   - Render condition badges (rush hour / nighttime).
 *   - Update the floating map overlay indicator dots.
 *   - Render the sorted station result cards.
 *   - Read and validate user input fields.
 *
 * Dependencies: none (DOM must be ready when this is instantiated)
 * Used by: App.js
 */

class UIManager {

  // ── Constructor ────────────────────────────────────────────────

  /**
   * Caches all DOM element references.
   * Centralising element lookups here means the rest of the class
   * never calls document.getElementById() again, and any ID change
   * only requires an update in one place.
   */
  constructor() {
    this._clockEl       = document.getElementById('clock');
    this._badgesEl      = document.getElementById('condition-badges');
    this._hintEl        = document.getElementById('hint');
    this._resultPanel   = document.getElementById('results-panel');
    this._resultListEl  = document.getElementById('results-list');
    this._rushDotEl     = document.getElementById('rush-dot');
    this._rushLabelEl   = document.getElementById('rush-label');
    this._nightDotEl    = document.getElementById('night-dot');
    this._nightLabelEl  = document.getElementById('night-label');
    this._efficiencyEl  = document.getElementById('efficiency');
    this._fuelNeededEl  = document.getElementById('fuel-needed');
  }

  // ── Clock ──────────────────────────────────────────────────────

  /**
   * Reads the current time and writes it to the clock element.
   * Called every second by App.js via setInterval.
   */
  updateClock() {
    const now = new Date();
    this._clockEl.textContent = now.toLocaleTimeString('en-CA', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  // ── Conditions ─────────────────────────────────────────────────

  /**
   * Renders sidebar condition badges and updates the floating
   * map overlay indicator dots based on the current time conditions.
   *
   * @param {{ isRushHour: boolean, isNighttime: boolean }} conditions
   */
  renderConditions(conditions) {
    const { isRushHour, isNighttime } = conditions;

    // -- Sidebar badges --
    this._badgesEl.innerHTML = '';

    if (isRushHour) {
      this._badgesEl.appendChild(
        this._createBadge('Rush Hour — +50% travel time', 'badge--warn')
      );
    }

    if (isNighttime) {
      this._badgesEl.appendChild(
        this._createBadge('Night Mode — \u2212$0.04/L', 'badge--info')
      );
    }

    if (!isRushHour && !isNighttime) {
      this._badgesEl.appendChild(
        this._createBadge('Normal Conditions', 'badge--ok')
      );
    }

    // -- Floating overlay dots --
    this._updateOverlayRow(
      this._rushDotEl,
      this._rushLabelEl,
      isRushHour,
      'Rush hour: active (+50%)',
      'Rush hour: inactive',
      'dot--warn'
    );

    this._updateOverlayRow(
      this._nightDotEl,
      this._nightLabelEl,
      isNighttime,
      'Night discount: active (\u2212$0.04/L)',
      'Night discount: inactive',
      'dot--info'
    );
  }

  // ── Results ────────────────────────────────────────────────────

  /**
   * Clears the results list and renders one card per station.
   * Also hides the pre-calculation hint and shows the results panel.
   *
   * @param {object[]} results       - computeResult() objects, pre-sorted
   * @param {number}   bestId        - id of the cheapest station
   * @param {object}   closestResult - result of the nearest station (benchmark)
   * @param {object}   conditions    - { isRushHour, isNighttime }
   * @param {Function} onCardClick   - callback(result) when a card is clicked
   */
  renderResults(results, bestId, closestResult, conditions, onCardClick) {
    const { isRushHour } = conditions;
    this._resultListEl.innerHTML = '';

    results.forEach(r => {
      const isBest  = r.id === bestId;
      const isWorth = r.totalCost <= closestResult.totalCost;

      const card = this._createStationCard(r, isBest, isWorth, isRushHour);

      // Click / keyboard activation → notify App.js via callback
      const activate = () => onCardClick(r);
      card.addEventListener('click', activate);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      this._resultListEl.appendChild(card);
    });

    // Hide hint, reveal results panel
    this._hintEl.style.display    = 'none';
    this._resultPanel.style.display = 'block';

    // Trigger CSS transition on the next frame
    requestAnimationFrame(() => {
      this._resultPanel.classList.add('results--visible');
    });
  }

  // ── Inputs ─────────────────────────────────────────────────────

  /**
   * Reads the two user input fields and validates them.
   * Returns null if either value is missing or non-positive.
   *
   * @returns {{ efficiency: number, fuelNeeded: number } | null}
   */
  getInputs() {
    const efficiency = parseFloat(this._efficiencyEl.value);
    const fuelNeeded = parseFloat(this._fuelNeededEl.value);

    if (!efficiency || efficiency <= 0 || !fuelNeeded || fuelNeeded <= 0) {
      return null;
    }

    return { efficiency, fuelNeeded };
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Creates a <span> badge element.
   *
   * @param {string} text          - badge label text
   * @param {string} modifierClass - BEM modifier class (e.g. 'badge--warn')
   * @returns {HTMLSpanElement}
   */
  _createBadge(text, modifierClass) {
    const el = document.createElement('span');
    el.className   = `badge ${modifierClass}`;
    el.textContent = text;
    return el;
  }

  /**
   * Updates one row of the floating map overlay.
   *
   * @param {HTMLElement} dotEl       - the coloured indicator dot element
   * @param {HTMLElement} labelEl     - the text label element
   * @param {boolean}     isActive    - whether the condition is active
   * @param {string}      activeText  - label when active
   * @param {string}      inactiveText - label when inactive
   * @param {string}      activeClass - CSS class applied to the dot when active
   */
  _updateOverlayRow(dotEl, labelEl, isActive, activeText, inactiveText, activeClass) {
    // Reset and re-apply so toggling between states is clean
    dotEl.className   = 'overlay-dot' + (isActive ? ` ${activeClass}` : '');
    labelEl.textContent = isActive ? activeText : inactiveText;
    labelEl.style.color  = isActive ? ''           : 'var(--text-muted)';
  }

  /**
   * Builds a single station result card as an <article> element.
   *
   * @param {object}  r           - result object
   * @param {boolean} isBest      - whether this is the best deal
   * @param {boolean} isWorth     - whether it's cheaper than the nearest station
   * @param {boolean} isRushHour  - used to style the travel time tag
   * @returns {HTMLElement}
   */
  _createStationCard(r, isBest, isWorth, isRushHour) {
    const card = document.createElement('article');
    card.className = `station-card${isBest ? ' station-card--best' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${r.name}, true cost $${r.totalCost.toFixed(2)}`);

    card.innerHTML = `
      <div class="card-row card-row--header">
        <span class="card-name">${r.name}</span>
        <span class="card-price">$${r.adjPrice.toFixed(3)}</span>
      </div>
      <div class="card-row card-row--meta">
        <span class="tag">${r.distance.toFixed(1)} km</span>
        <span class="tag ${isRushHour ? 'tag--warn' : ''}">${Math.round(r.travelMin)} min</span>
        <span class="tag tag--cost">$${r.totalCost.toFixed(2)} total</span>
        <span class="tag ${(isWorth || isBest) ? 'tag--ok' : 'tag--no'}">
          ${(isWorth || isBest) ? 'Worth it' : 'Skip'}
        </span>
      </div>
    `;

    return card;
  }
}
