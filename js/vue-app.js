/**
 * vue-app.js — Smart Gas Map (Vue 3 CDN, Composition API)
 *
 * All UI is driven by Vue reactive state. Business logic classes
 * (GasStation, TimeConditions, MapManager, OBDManager) are unchanged
 * and used as plain JS modules inside Vue composables.
 */

const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, Transition, TransitionGroup } = Vue;

// ─── Utility ──────────────────────────────────────────────────────────────
function formatTime(d) {
  return d.toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

// ─── STATION CARD component ────────────────────────────────────────────────
const StationCard = {
  name: 'StationCard',
  props: {
    result: { type: Object, required: true },
    isBest: { type: Boolean, default: false },
    isWorth: { type: Boolean, default: false },
    isRushHour: { type: Boolean, default: false },
    trend: { type: String, default: null }, // 'up' or 'down'
  },
  emits: ['click'],
  template: `
    <article
      :class="['station-card', isBest && 'station-card--best']"
      role="button"
      tabindex="0"
      :aria-label="result.name + ', true cost $' + result.totalCost.toFixed(2)"
      @click="$emit('click')"
      @keydown.enter="$emit('click')"
      @keydown.space.prevent="$emit('click')"
    >
      <span v-if="isBest" class="station-card__badge">★ BEST</span>

      <div class="station-card__row">
        <span class="station-card__name">{{ result.name }}</span>
        <span :key="result.adjPrice" :class="['station-card__price', trend === 'up' ? 'price-flash-up' : trend === 'down' ? 'price-flash-down' : '']">\${{ result.adjPrice.toFixed(3) }}</span>
      </div>

      <div class="station-card__tags">
        <span class="tag">{{ result.distance.toFixed(1) }} km</span>
        <span :class="['tag', isRushHour && 'tag--amber']">
          {{ Math.round(result.travelMin) }} min<template v-if="isRushHour"> ⚡</template>
        </span>
        <span class="tag tag--bold">\${{ result.totalCost.toFixed(2) }} total</span>
        <span :class="['tag', (isWorth || isBest) ? 'tag--green' : '']">
          {{ (isWorth || isBest) ? 'Worth it ✓' : 'Skip' }}
        </span>
      </div>
    </article>
  `,
};

// ─── CONDITION PILL component ──────────────────────────────────────────────
const ConditionPill = {
  name: 'ConditionPill',
  props: {
    conditions: { type: Object, required: true },
  },
  computed: {
    pills() {
      const out = [];
      if (this.conditions.isRushHour) out.push({ text: 'Rush Hour +50%', cls: 'pill--amber' });
      if (this.conditions.isNighttime) out.push({ text: 'Night −$0.04/L', cls: 'pill--green' });
      return out;
    },
  },
  template: `
    <div class="panel__conditions" v-if="pills.length">
      <span v-for="p in pills" :key="p.text" :class="['pill', p.cls]">
        <span class="pill__dot"></span>{{ p.text }}
      </span>
    </div>
  `,
};

// ─── MAP OVERLAY component ─────────────────────────────────────────────────
const MapOverlay = {
  name: 'MapOverlay',
  props: { conditions: { type: Object, required: true } },
  template: `
    <aside class="map-overlay" aria-label="Active map modifiers">
      <p class="map-overlay__title">Active Modifiers</p>
      <div class="map-overlay__row">
        <span :class="['map-overlay__dot', conditions.isRushHour && 'map-overlay__dot--rush']"></span>
        <span :class="['map-overlay__label', conditions.isRushHour && 'map-overlay__label--active']">
          {{ conditions.isRushHour ? 'Rush hour: active (+50%)' : 'Rush hour: inactive' }}
        </span>
      </div>
      <div class="map-overlay__row">
        <span :class="['map-overlay__dot', conditions.isNighttime && 'map-overlay__dot--night']"></span>
        <span :class="['map-overlay__label', conditions.isNighttime && 'map-overlay__label--active']">
          {{ conditions.isNighttime ? 'Night discount: active (−$0.04/L)' : 'Night discount: inactive' }}
        </span>
      </div>
    </aside>
  `,
};

// ─── CLOCK WIDGET component ────────────────────────────────────────────────
const ClockWidget = {
  name: 'ClockWidget',
  data() {
    return { time: formatTime(new Date()), timer: null };
  },
  mounted() {
    this.timer = setInterval(() => { this.time = formatTime(new Date()); }, 1000);
  },
  unmounted() { clearInterval(this.timer); },
  template: `
    <div class="clock-widget" aria-label="Local time">
      <span class="clock-widget__dot" aria-hidden="true"></span>
      <span class="clock-widget__time">{{ time }}</span>
    </div>
  `,
};

// ─── WIZARD OVERLAY component ──────────────────────────────────────────────
const WizardOverlay = {
  name: 'WizardOverlay',
  emits: ['complete'],
  props: { obdManager: { default: null } },
  data() {
    return {
      // Step flow
      step: 'welcome',      // welcome | car-search | efficiency | fuel | obd | confirm
      obdPath: false,
      direction: 1,         // 1 = forward, -1 = backward (for slide direction)

      // Collected values
      selectedCar: null,
      searchQuery: '',
      searchResults: [],
      efficiency: 9.5,
      fuelNeeded: 40,

      // OBD live
      obdConnected: false,
      obdScanning: false,
      obdMetrics: { fuel: null, rpm: null, speed: null },
      obdTimer: null,

      // Computed OBD values
      liveEff: null,
      liveRange: null,
      liveGrade: null,
    };
  },
  computed: {
    pathSteps() {
      if (this.obdPath) return ['car-search', 'obd', 'confirm'];
      return ['car-search', 'efficiency', 'fuel', 'confirm'];
    },
    stepIndex() { return this.pathSteps.indexOf(this.step); },
    isConfirm() { return this.step === 'confirm'; },
    carName() {
      return this.selectedCar
        ? `${this.selectedCar.year} ${this.selectedCar.make} ${this.selectedCar.model}`
        : null;
    },
    effDisplay() { return this.liveEff ? this.liveEff.toFixed(1) : this.efficiency; },
    fuelDisplay() { return this.fuelNeeded; },
    effGrade() { return this._computeGrade(this.liveEff || this.efficiency); },
  },
  methods: {
    // ── Navigation ─────────────────────────────────────────────────
    toStep(s) {
      const prev = this.pathSteps.indexOf(this.step);
      const next = this.pathSteps.indexOf(s);
      this.direction = (next >= prev) ? 1 : -1;
      this.step = s;
    },
    next() {
      if (this.step === 'welcome') { this.obdPath = false; this.step = 'car-search'; return; }
      const i = this.pathSteps.indexOf(this.step);
      if (i < this.pathSteps.length - 1) this.toStep(this.pathSteps[i + 1]);
      else this.finish();
    },
    back() {
      const i = this.pathSteps.indexOf(this.step);
      if (i > 0) this.toStep(this.pathSteps[i - 1]);
      else this.step = 'welcome';
    },
    startOBD() { this.obdPath = true; this.step = 'car-search'; },
    skipToEfficiency() { this.selectedCar = null; this.obdPath = false; this.toStep('efficiency'); },
    skipToOBD() { this.selectedCar = null; this.obdPath = true; this.toStep('obd'); },

    // ── Car search ─────────────────────────────────────────────────
    onSearchInput(e) {
      this.searchQuery = e.target.value;
      const q = this.searchQuery.trim().toLowerCase();
      if (q.length < 2) { this.searchResults = []; return; }
      this.searchResults = CAR_DATABASE.filter(c => {
        return `${c.make} ${c.model} ${c.year}`.toLowerCase().includes(q);
      }).slice(0, 8);
    },
    selectCar(car) {
      this.selectedCar = car;
      this.efficiency = car.combined;
      this.searchResults = [];
    },
    clearCar() {
      this.selectedCar = null;
      this.searchQuery = '';
      this.searchResults = [];
      this.$nextTick(() => { const el = document.getElementById('wiz-search'); if (el) el.focus(); });
    },
    clearSearch() {
      this.searchQuery = '';
      this.searchResults = [];
      this.$nextTick(() => { const el = document.getElementById('wiz-search'); if (el) el.focus(); });
    },

    // ── OBD ────────────────────────────────────────────────────────
    async scanOBD() {
      if (!this.obdManager) {
        alert('Web Bluetooth is not available. Use Chrome on Windows with Bluetooth enabled.');
        return;
      }
      this.obdScanning = true;
      const ok = await this.obdManager.connect();
      this.obdScanning = false;
      if (ok) {
        this.obdConnected = true;
        this.obdTimer = setInterval(() => this.refreshOBD(), 600);
      }
    },
    skipOBD() {
      this.stopOBDTimer();
      this.obdPath = false;
      this.toStep('efficiency');
    },
    stopOBDTimer() {
      if (this.obdTimer) { clearInterval(this.obdTimer); this.obdTimer = null; }
    },
    refreshOBD() {
      if (!this.obdManager) return;
      const m = this.obdManager.metrics;
      this.obdMetrics = { ...m };

      // Estimate efficiency from RPM + speed (simplified)
      if (m.rpm && m.speed && m.speed > 5) {
        const approx = 3.785 * (m.rpm / (m.speed * 60 * 0.6));
        this.liveEff = Math.min(Math.max(approx, 4), 25);
      }

      const tankCap = (this.selectedCar && Wizard?.TANK_MAP?.[`${this.selectedCar.make} ${this.selectedCar.model}`])
        || 55;
      if (m.fuel !== null && this.liveEff) {
        const litresLeft = (m.fuel / 100) * tankCap;
        this.liveRange = Math.round(litresLeft * (100 / this.liveEff));
        this.fuelNeeded = Math.round(tankCap - litresLeft);
      }

      this.liveGrade = this._computeGrade(this.liveEff || this.efficiency);
    },
    _computeGrade(eff) {
      if (!eff) return null;
      if (eff < 7)  return { label: 'A+', color: '#16A34A' };
      if (eff < 9)  return { label: 'A',  color: '#22C55E' };
      if (eff < 11) return { label: 'B',  color: '#84CC16' };
      if (eff < 14) return { label: 'C',  color: '#F59E0B' };
      return { label: 'D', color: '#EF4444' };
    },

    // ── Finish ─────────────────────────────────────────────────────
    finish() {
      this.stopOBDTimer();
      this.$emit('complete', {
        efficiency: this.liveEff || this.efficiency,
        fuelNeeded: this.fuelNeeded,
        carName: this.carName,
        obdConnected: this.obdConnected,
        obdRange: this.liveRange,
        obdGrade: this.liveGrade,
      });
    },
  },
  unmounted() { this.stopOBDTimer(); },
  template: `
    <div class="wizard-overlay">
      <transition name="wizard-card" appear>
        <div class="wizard-card">

          <!-- Header: progress dots -->
          <div class="wizard-header" v-if="step !== 'welcome'">
            <div class="wizard-progress">
              <span
                v-for="(s, i) in pathSteps"
                :key="s"
                :class="['wizard-dot',
                  i < stepIndex ? 'wizard-dot--done' :
                  i === stepIndex ? 'wizard-dot--active' : '']"
              ></span>
            </div>
          </div>

          <!-- Body: step content -->
          <div class="wizard-body" style="position:relative">
            <transition :name="direction > 0 ? 'step' : 'step-back'" mode="out-in">

              <!-- WELCOME -->
              <div v-if="step === 'welcome'" key="welcome">
                <div class="wizard-art">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 17h1m16 0h1M5 17H4l1-4 2-2h10l2 2 1 4H5z"/>
                    <circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>
                    <path d="M8 9h8M12 5v6"/>
                  </svg>
                </div>
                <p class="wizard-eyebrow">Ottawa — Gas Price Analysis</p>
                <h2 class="wizard-heading">Smart<br>Gas Map</h2>
                <p class="wizard-desc">
                  Find out whether driving further for cheaper gas is actually worth it —
                  accounting for traffic, stop-and-go city driving, and time-of-day pricing.
                </p>
              </div>

              <!-- CAR SEARCH -->
              <div v-else-if="step === 'car-search'" key="car-search">
                <p class="wizard-step-label">{{ obdPath ? 'Step 1 of ' + pathSteps.length : 'Step 1 of ' + pathSteps.length }}</p>
                <h2 class="wizard-heading wizard-heading--sm">Find Your Car</h2>
                <p class="wizard-desc">Search by make or model to set fuel efficiency automatically.</p>

                <!-- Chip: car selected -->
                <div v-if="selectedCar" class="car-chip">
                  <span class="car-chip__name">{{ carName }}</span>
                  <span class="car-chip__eff">{{ selectedCar.combined }} L/100km</span>
                  <button class="car-chip__clear" @click="clearCar">✕ Clear</button>
                </div>

                <!-- Search field -->
                <div v-else class="search-wrap">
                  <input
                    id="wiz-search"
                    class="search-input"
                    type="text"
                    placeholder="e.g. Kia Telluride, Honda Civic…"
                    :value="searchQuery"
                    @input="onSearchInput"
                    autocomplete="off"
                  />
                  <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>
                </div>

                <!-- Results list -->
                <div v-if="searchResults.length" class="car-results">
                  <div
                    v-for="car in searchResults" :key="car.year + car.make + car.model"
                    class="car-option"
                    @click="selectCar(car)"
                  >
                    <span class="car-option__name">{{ car.year }} {{ car.make }} {{ car.model }}</span>
                    <span class="car-option__eff">{{ car.combined }} L/100km</span>
                  </div>
                </div>

                <button class="skip-link" @click="obdPath ? skipToOBD() : skipToEfficiency()">
                  {{ obdPath ? 'Skip — use default tank size' : 'Enter fuel efficiency manually instead' }}
                </button>
              </div>

              <!-- EFFICIENCY -->
              <div v-else-if="step === 'efficiency'" key="efficiency">
                <p class="wizard-step-label">Step {{ stepIndex + 1 }} of {{ pathSteps.length }}</p>
                <h2 class="wizard-heading wizard-heading--sm">Fuel Efficiency</h2>
                <p class="wizard-desc">How many litres does your car consume per 100 km?</p>
                <div class="wizard-input-wrap">
                  <input
                    class="wizard-input"
                    type="number"
                    min="3" max="30" step="0.1"
                    v-model.number="efficiency"
                    @keydown.enter="next"
                  />
                  <span class="wizard-unit">L / 100 km</span>
                </div>
              </div>

              <!-- FUEL TO PUMP -->
              <div v-else-if="step === 'fuel'" key="fuel">
                <p class="wizard-step-label">Step {{ stepIndex + 1 }} of {{ pathSteps.length }}</p>
                <h2 class="wizard-heading wizard-heading--sm">Fuel to Pump</h2>
                <p class="wizard-desc">How many litres do you plan to fill up? A typical tank holds 40–60 L.</p>
                <div class="wizard-input-wrap">
                  <input
                    class="wizard-input"
                    type="number"
                    min="1" max="200" step="1"
                    v-model.number="fuelNeeded"
                    @keydown.enter="next"
                  />
                  <span class="wizard-unit">litres</span>
                </div>
              </div>

              <!-- OBD CONNECT -->
              <div v-else-if="step === 'obd'" key="obd">
                <p class="wizard-step-label">Step {{ stepIndex + 1 }} of {{ pathSteps.length }}</p>
                <h2 class="wizard-heading wizard-heading--sm">Connect Scanner</h2>
                <p class="wizard-desc">Pair your ELM327 OBD-II Bluetooth adapter for live trip analysis.</p>

                <!-- Not connected -->
                <div v-if="!obdConnected">
                  <button class="obd-scan-btn" @click="scanOBD" :disabled="obdScanning">
                    <div class="obd-scan-btn__icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.56 2.9A7 7 0 0 1 19 9v4h2a2 2 0 0 1 0 4h-2a7 7 0 0 1-14 0H3a2 2 0 0 1 0-4h2V9a7 7 0 0 1 3.56-6.1z"/>
                      </svg>
                    </div>
                    <span class="obd-scan-btn__label">{{ obdScanning ? 'Scanning…' : 'Scan for Adapter' }}</span>
                    <span class="obd-scan-btn__hint">ELM327 adapter must be plugged in and engine running</span>
                  </button>
                </div>

                <!-- Connected -->
                <div v-else>
                  <div class="obd-badge">
                    <span class="obd-conn-dot"></span> Connected
                  </div>
                  <div class="obd-stats">
                    <div class="obd-stat">
                      <span class="obd-stat__icon">⛽</span>
                      <div>
                        <span class="obd-stat__label">Fuel Level</span>
                        <span class="obd-stat__value">{{ obdMetrics.fuel !== null ? obdMetrics.fuel + '%' : '—' }}</span>
                      </div>
                    </div>
                    <div class="obd-stat">
                      <span class="obd-stat__icon">📊</span>
                      <div>
                        <span class="obd-stat__label">Live Efficiency</span>
                        <span class="obd-stat__value">{{ liveEff ? liveEff.toFixed(1) + ' L/100km' : '—' }}</span>
                      </div>
                    </div>
                    <div class="obd-stat">
                      <span class="obd-stat__icon">🛣️</span>
                      <div>
                        <span class="obd-stat__label">Est. Range</span>
                        <span class="obd-stat__value">{{ liveRange ? liveRange + ' km' : '—' }}</span>
                      </div>
                    </div>
                    <div class="obd-stat">
                      <span class="obd-stat__icon">🏆</span>
                      <div>
                        <span class="obd-stat__label">Grade</span>
                        <span class="obd-stat__value" :style="liveGrade ? { color: liveGrade.color } : {}">
                          {{ liveGrade ? liveGrade.label : '—' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <button class="skip-link" @click="skipOBD">Skip — enter values manually instead</button>
              </div>

              <!-- CONFIRM -->
              <div v-else-if="step === 'confirm'" key="confirm">
                <h2 class="wizard-heading wizard-heading--sm">All Set 🎉</h2>
                <p class="wizard-desc">
                  <template v-if="carName">Your <strong>{{ carName }}</strong> uses</template>
                  <template v-else>Your car uses</template>
                  <strong> {{ effDisplay }} L/100km</strong> and you'll pump
                  <strong>{{ fuelDisplay }} L</strong>.
                  We'll calculate the true cost of each station.
                </p>
                <div class="wizard-summary">
                  <div v-if="carName" class="wizard-summary-row">
                    <span>Vehicle</span><strong>{{ carName }}</strong>
                  </div>
                  <div class="wizard-summary-row">
                    <span>Fuel efficiency</span><strong>{{ effDisplay }} L / 100 km</strong>
                  </div>
                  <div class="wizard-summary-row">
                    <span>Fuel to pump</span><strong>{{ fuelDisplay }} L</strong>
                  </div>
                  <div v-if="obdConnected && liveRange" class="wizard-summary-row">
                    <span>Est. Range</span><strong>{{ liveRange }} km</strong>
                  </div>
                </div>
              </div>

            </transition>
          </div>

          <!-- Footer: navigation buttons -->
          <div :class="['wizard-footer', step === 'welcome' && 'wizard-footer--single']">

            <!-- Welcome: two CTA buttons -->
            <template v-if="step === 'welcome'">
              <button class="wiz-btn wiz-btn--obd" @click="startOBD">
                🔵 Connect OBD-II
              </button>
              <button class="wiz-btn wiz-btn--primary" @click="next">
                Get Started →
              </button>
            </template>

            <!-- All other steps -->
            <template v-else>
              <button class="wiz-btn wiz-btn--ghost" @click="back">← Back</button>
              <button class="wiz-btn wiz-btn--primary" @click="isConfirm ? finish() : next()">
                {{ isConfirm ? 'Find Best Price 🚀' : (step === 'car-search' && !selectedCar ? 'Skip →' : 'Continue →') }}
              </button>
            </template>

          </div>
        </div>
      </transition>
    </div>
  `,
};

// ─── CONTROL PANEL component ───────────────────────────────────────────────
const ControlPanel = {
  name: 'ControlPanel',
  components: { StationCard, ConditionPill, TransitionGroup },
  props: {
    conditions: { type: Object, required: true },
    results: { type: Array, default: null },
    bestId: { type: Number, default: null },
    closestCost: { type: Number, default: null },
    panelSide: { type: Boolean, default: false },
    efficiency: { type: Number, default: 9.5 },
    fuelNeeded: { type: Number, default: 40 },
    priceTrends: { type: Object, default: () => ({}) },
  },
  emits: ['calculate', 'viewMap', 'editSettings', 'cardClick', 'update:efficiency', 'update:fuelNeeded'],
  computed: {
    sortedResults() {
      if (!this.results) return [];
      return [...this.results].sort((a, b) => a.totalCost - b.totalCost);
    },
  },
  template: `
    <aside
      :class="['panel', panelSide && 'panel--side']"
      aria-label="Gas Map Controls"
    >
      <!-- Header -->
      <header class="panel__header">
        <div class="panel__brand">
          <div class="panel__logo-dot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 17h1m16 0h1M5 17H4l1-4 2-2h10l2 2 1 4H5z"/>
              <circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>
            </svg>
          </div>
          <button v-if="results" class="btn btn--icon" @click="$emit('editSettings')" title="Edit settings" style="margin-left: auto;">
            ✏️
          </button>
        </div>
        <h1 class="panel__title" style="display: flex; align-items: center; justify-content: space-between;">
          <span>Smart <em>Gas Map</em></span>
          <span class="live-badge" title="Simulated live prices active">
            <span class="live-badge__dot"></span> Live
          </span>
        </h1>
        <p class="panel__subtitle">Ottawa — Know Your True Cost</p>

        <!-- Condition pills -->
        <condition-pill :conditions="conditions" />
      </header>

      <!-- Body -->
      <div class="panel__body">

        <!-- Inputs section — always visible -->
        <section class="panel__section" v-if="!results || !results.length">
          <div class="form-group">
            <label class="form-label" for="efficiency">
              Fuel Efficiency
              <span class="form-label-unit">L / 100 km</span>
            </label>
            <input
              id="efficiency"
              class="form-input"
              type="number"
              min="3" max="30" step="0.1"
              :value="efficiency"
              @input="$emit('update:efficiency', parseFloat($event.target.value))"
              @keydown.enter="$emit('calculate')"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="fuel-needed">
              Fuel to Pump
              <span class="form-label-unit">litres</span>
            </label>
            <input
              id="fuel-needed"
              class="form-input"
              type="number"
              min="1" max="200" step="1"
              :value="fuelNeeded"
              @input="$emit('update:fuelNeeded', parseFloat($event.target.value))"
              @keydown.enter="$emit('calculate')"
            />
          </div>
        </section>

        <!-- Results section -->
        <section class="panel__section" v-if="results && results.length">
          <h2 class="section-title">Results <span style="margin-left:auto;font-size:0.62rem;color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;">sorted by true cost</span></h2>
          <transition-group name="card-list" tag="div" class="card-list">
            <station-card
              v-for="r in sortedResults"
              :key="r.id"
              :result="r"
              :is-best="r.id === bestId"
              :is-worth="r.totalCost <= closestCost"
              :is-rush-hour="conditions.isRushHour"
              :trend="priceTrends[r.id]"
              @click="$emit('cardClick', r)"
            />
          </transition-group>
        </section>

      </div>

      <!-- Footer -->
      <footer class="panel__footer">
        <button
          v-if="results && results.length"
          class="btn btn--primary"
          @click="$emit('calculate')"
          style="margin-bottom:10px;"
        >Recalculate</button>

        <button
          v-else
          class="btn btn--primary"
          id="calculate-btn"
          @click="$emit('calculate')"
          aria-label="Calculate true cost for all stations"
          style="margin-bottom:10px;"
        >Calculate True Cost</button>

        <button class="btn btn--ghost" @click="$emit('viewMap')">
          🗺 View Map
        </button>
      </footer>
    </aside>
  `,
};

// ─── ROOT APP ──────────────────────────────────────────────────────────────
const App = {
  name: 'SmartGasMapApp',
  components: { WizardOverlay, ControlPanel, MapOverlay, ClockWidget, Transition, TransitionGroup },

  setup() {
    // ── State ────────────────────────────────────────────────────────
    const showWizard   = ref(true);
    const showPanel    = ref(false);
    const panelSide    = ref(false);
    const conditions   = reactive({ isRushHour: false, isNighttime: false });

    const results      = ref(null);
    const bestId       = ref(null);
    const closestCost  = ref(null);

    const efficiency   = ref(9.5);
    const fuelNeeded   = ref(40);
    const priceTrends  = reactive({}); // Tracks 'up' or 'down' for each station ID

    // ── Business logic singletons ─────────────────────────────────
    const timeConditions = new TimeConditions();
    const stations = STATION_DATA.map(d => new GasStation(d));
    let mapManager = null;

    const obdManager = new OBDManager(
      () => {},
      () => {}
    );

    // ── Conditions ticker ─────────────────────────────────────────
    function refreshConditions() {
      const snap = timeConditions.snapshot();
      conditions.isRushHour = snap.isRushHour;
      conditions.isNighttime = snap.isNighttime;
    }

    let conditionTimer = null;
    let livePriceTimer = null;
    onMounted(() => {
      // Init Leaflet map
      mapManager = new MapManager('map', USER_ORIGIN, 12);
      stations.forEach(s => mapManager.addStationMarker(s));

      // Conditions
      refreshConditions();
      conditionTimer = setInterval(refreshConditions, 30_000);

      // Start live price simulator
      livePriceTimer = setInterval(simulateLivePrices, 4000);
    });

    onUnmounted(() => {
      clearInterval(conditionTimer);
      clearInterval(livePriceTimer);
    });

    // ── Live Price Simulator ──────────────────────────────────────
    function simulateLivePrices() {
      let changed = false;
      // Randomly pick 1 to 3 stations to fluctuate
      const numToChange = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < numToChange; i++) {
        const stationIdx = Math.floor(Math.random() * stations.length);
        const st = stations[stationIdx];
        
        // Pick a small random diff
        const diffs = [-0.02, -0.01, 0.01, 0.02];
        const diff = diffs[Math.floor(Math.random() * diffs.length)];
        
        // Ensure price doesn't drift too far from the original base price
        const originalBase = STATION_DATA.find(d => d.id === st.id).basePrice;
        let newPrice = st.basePrice + diff;
        if (Math.abs(newPrice - originalBase) > 0.05) {
          newPrice = originalBase; // Snap back if drifted too far
        }
        
        if (st.basePrice !== newPrice) {
          priceTrends[st.id] = newPrice > st.basePrice ? 'up' : 'down';
          // Update the internal value directly
          st._basePrice = newPrice;
          changed = true;
          
          // Clear the trend after animation completes
          setTimeout(() => {
            if (priceTrends[st.id]) {
              priceTrends[st.id] = null;
            }
          }, 1600);
        }
      }
      
      if (changed && results.value && results.value.length > 0) {
        calculate();
      }
    }

    // ── Calculation ───────────────────────────────────────────────
    function calculate() {
      const eff = parseFloat(efficiency.value);
      const fuel = parseFloat(fuelNeeded.value);
      if (!eff || eff <= 0 || !fuel || fuel <= 0) {
        alert('Please enter valid numbers for fuel efficiency and litres to pump.');
        return;
      }

      const snap = timeConditions.snapshot();
      conditions.isRushHour = snap.isRushHour;
      conditions.isNighttime = snap.isNighttime;

      const res = stations.map(s => s.computeResult(fuel, eff, snap));
      const best = res.reduce((a, b) => b.totalCost < a.totalCost ? b : a);
      const closest = res.reduce((a, b) => b.distance < a.distance ? b : a);

      results.value    = res;
      bestId.value     = best.id;
      closestCost.value = closest.totalCost;

      // Update map markers
      mapManager.updateMarkers(res, best.id, closest.totalCost, snap, stationId => {
        const r = res.find(r => r.id === stationId);
        if (r) {
          mapManager.focusStation(r.coords, r.id);
          panelSide.value = true;
        }
      });

      const allCoords = [USER_ORIGIN, ...stations.map(s => s.coords)];
      mapManager.flyToBounds(allCoords);
    }

    // ── Wizard complete ───────────────────────────────────────────
    function onWizardComplete(values) {
      efficiency.value = values.efficiency;
      fuelNeeded.value = values.fuelNeeded;
      showWizard.value = false;
      showPanel.value  = true;
      nextTick(() => calculate());
    }

    // ── Card click: dock panel to side ────────────────────────────
    function onCardClick(result) {
      mapManager.focusStation(result.coords, result.id);
      panelSide.value = true;
    }

    // ── View map: hide panel, show FAB ────────────────────────────
    const panelVisible = ref(true);
    function viewMap() { panelVisible.value = false; }
    function showControls() { panelVisible.value = true; panelSide.value = false; }

    // ── Edit settings: relaunch wizard ────────────────────────────
    function editSettings() {
      results.value = null;
      showWizard.value = true;
      panelSide.value = false;
    }

    return {
      showWizard, showPanel, panelSide, panelVisible,
      conditions, results, bestId, closestCost,
      efficiency, fuelNeeded,
      obdManager,
      calculate, onWizardComplete, onCardClick,
      viewMap, showControls, editSettings,
    };
  },

  template: `
    <div id="app">
      <!-- Map renders here (Leaflet writes into this div directly) -->
      <div id="map"></div>

      <!-- Map Overlay: active modifiers (top-right) -->
      <map-overlay :conditions="conditions" />

      <!-- Clock: bottom-right pill -->
      <clock-widget />

      <!-- Wizard overlay (on first load / edit settings) -->
      <transition name="wizard-overlay">
        <wizard-overlay
          v-if="showWizard"
          :obd-manager="obdManager"
          @complete="onWizardComplete"
        />
      </transition>

      <!-- Control Panel (floating card) -->
      <transition name="panel">
        <control-panel
          v-if="showPanel && panelVisible"
          :conditions="conditions"
          :results="results"
          :best-id="bestId"
          :closest-cost="closestCost"
          :panel-side="panelSide"
          :price-trends="priceTrends"
          v-model:efficiency="efficiency"
          v-model:fuelNeeded="fuelNeeded"
          @calculate="calculate"
          @viewMap="viewMap"
          @editSettings="editSettings"
          @cardClick="onCardClick"
        />
      </transition>

      <!-- FAB: show controls when panel is hidden -->
      <transition name="fab">
        <button
          v-if="showPanel && !panelVisible"
          class="fab"
          @click="showControls"
          aria-label="Show controls"
        >
          ☰ Show Controls
        </button>
      </transition>
    </div>
  `,
};

// ── Mount ──────────────────────────────────────────────────────────────────
createApp(App).mount('#app');
