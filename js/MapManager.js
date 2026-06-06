/**
 * MapManager.js
 *
 * Owns all Leaflet.js interactions: map initialisation, tile layer,
 * marker creation, marker colour updates, tooltip and popup binding,
 * and map camera animations.
 *
 * This class is the only place in the application that touches the
 * Leaflet API, keeping map concerns isolated from business logic.
 *
 * Marker colour scheme (3-colour palette):
 *   Amber  (#C8863C) — best deal (lowest true cost)
 *   Dim amber (#7A5E28) — worth the drive (cheaper than nearest)
 *   Dark   (#232638)  — not worth the drive
 *   Default (#1E2234) — before any calculation is run
 *
 * Dependencies: Leaflet.js (loaded via CDN before this file)
 * Used by: App.js
 */

class MapManager {

  // ── Marker fill colours ───────────────────────────────────────
  static COLOR_BEST    = '#2DB86A'; // green — best overall deal
  static COLOR_WORTH   = '#1A7A44'; // dark green — worth the drive
  static COLOR_NOPE    = '#232638'; // near-ink — not worth the drive
  static COLOR_DEFAULT = '#1E2234'; // surface-3 — pre-calculation state

  // ── Constructor ────────────────────────────────────────────────

  /**
   * Initialises the Leaflet map inside the given HTML element.
   *
   * @param {string}   containerId - ID of the <main> or <div> element
   * @param {number[]} center      - [latitude, longitude] for initial view
   * @param {number}   zoom        - initial zoom level
   */
  constructor(containerId, center, zoom) {
    this._center  = center;
    this._markers = {}; // stationId → Leaflet Marker reference

    // Initialise the Leaflet map
    this._map = L.map(containerId, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true
    });

    // CartoDB Dark Matter tile layer — dark-themed, no API key required
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
          'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }
    ).addTo(this._map);

    this._placeUserMarker();
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Places a distinct marker at the user's starting location.
   * Uses the `.map-marker--user` CSS class (bone circle, amber ring).
   */
  _placeUserMarker() {
    const icon = L.divIcon({
      className:   '',
      html:        '<div class="map-marker map-marker--user"></div>',
      iconSize:    [14, 14],
      iconAnchor:  [7, 7],
      popupAnchor: [0, -12]
    });

    L.marker(this._center, { icon })
      .addTo(this._map)
      .bindTooltip('Your Location', { direction: 'top', offset: [0, -8] });
  }

  /**
   * Builds a round DivIcon for a gas station marker.
   *
   * @param {string} color - CSS colour string (hex)
   * @returns {L.DivIcon}
   */
  _buildStationIcon(color) {
    return L.divIcon({
      className:   '',
      html:        `<div class="map-marker" style="background:${color};"></div>`,
      iconSize:    [20, 20],
      iconAnchor:  [10, 10],
      popupAnchor: [0, -14]
    });
  }

  /**
   * Builds the HTML string that Leaflet renders inside a popup.
   * All CSS class names reference styles defined in styles.css.
   *
   * @param {object}  r             - result object from GasStation.computeResult()
   * @param {boolean} isBest        - true if this has the lowest total cost
   * @param {boolean} isWorth       - true if cheaper than the nearest station
   * @param {number}  closestCost   - true cost of the nearest station (benchmark)
   * @param {object}  conditions    - { isRushHour, isNighttime }
   * @returns {string} HTML string
   */
  _buildPopupHTML(r, isBest, isWorth, closestCost, { isRushHour, isNighttime }) {
    const diff       = (closestCost - r.totalCost).toFixed(2);
    const diffSign   = diff >= 0 ? '+' : '';
    const diffLabel  = Number(diff) >= 0
      ? `${diffSign}$${diff} saved vs. nearest`
      : `-$${Math.abs(diff)} more than nearest`;

    const verdictClass = (isBest || isWorth) ? 'verdict--positive' : 'verdict--negative';
    const verdictText  = (isBest || isWorth) ? 'Worth the drive'  : 'Stay closer to home';

    return `
      <div class="popup">
        <div class="popup__header">
          <span class="popup__name">${r.name}</span>
          <span class="popup__price">
            $${r.adjPrice.toFixed(3)}<small>/L${isNighttime ? ' (night rate)' : ''}</small>
          </span>
        </div>
        <div class="popup__body">
          <div class="popup__row">
            <span>Distance</span>
            <span>${r.distance.toFixed(1)} km</span>
          </div>
          <div class="popup__row">
            <span>Travel time</span>
            <span class="${isRushHour ? 'popup__value--rush' : ''}">
              ${Math.round(r.travelMin)} min${isRushHour ? ' — rush hour' : ''}
            </span>
          </div>
          <div class="popup__row">
            <span>Intersections</span>
            <span>${r.intersections} stops</span>
          </div>
          <div class="popup__row">
            <span>Fuel burned (trip)</span>
            <span>${r.tripFuel.toFixed(3)} L</span>
          </div>
          <div class="popup__row popup__row--total">
            <span>True cost</span>
            <span>$${r.totalCost.toFixed(2)}</span>
          </div>
          <div class="popup__row">
            <span>vs. nearest station</span>
            <span>${diffLabel}</span>
          </div>
        </div>
        <div class="popup__verdict ${verdictClass}">${verdictText}</div>
        <p class="popup__note">
          True cost = (fuel wanted + fuel burned driving here) &times; price/L
        </p>
      </div>
    `;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Adds a default (pre-calculation) marker for a station.
   * Called once per station during App.init().
   *
   * @param {GasStation} station
   */
  addStationMarker(station) {
    const icon   = this._buildStationIcon(MapManager.COLOR_DEFAULT);
    const marker = L.marker(station.coords, { icon }).addTo(this._map);

    marker.bindTooltip(
      `${station.name}  —  $${station.basePrice.toFixed(2)}/L`,
      { direction: 'top', offset: [0, -8] }
    );

    this._markers[station.id] = marker;
  }

  /**
   * Recolours every station marker and attaches updated popups
   * after a calculation has been run.
   *
   * @param {object[]} results      - array of computeResult() output objects
   * @param {number}   bestId       - id of the station with lowest totalCost
   * @param {number}   closestCost  - totalCost of the nearest station (benchmark)
   * @param {object}   conditions   - { isRushHour, isNighttime }
   * @param {Function} onClickCb    - callback(stationId) when a marker is clicked
   */
  updateMarkers(results, bestId, closestCost, conditions, onClickCb) {
    results.forEach(r => {
      const isBest  = r.id === bestId;
      const isWorth = r.totalCost <= closestCost;

      // Select fill colour based on recommendation outcome
      let color;
      if (isBest)        color = MapManager.COLOR_BEST;
      else if (isWorth)  color = MapManager.COLOR_WORTH;
      else               color = MapManager.COLOR_NOPE;

      const marker = this._markers[r.id];
      marker.setIcon(this._buildStationIcon(color));

      // Rebuild tooltip with updated price
      marker.unbindTooltip();
      marker.bindTooltip(
        `${r.name}  —  $${r.adjPrice.toFixed(3)}/L  |  True: $${r.totalCost.toFixed(2)}`,
        { direction: 'top', offset: [0, -8] }
      );

      // Rebuild popup with full calculation details
      marker.unbindPopup();
      marker.bindPopup(
        this._buildPopupHTML(r, isBest, isWorth, closestCost, conditions),
        { maxWidth: 280, minWidth: 240 }
      );

      // Replace any previous click listener
      marker.off('click');
      marker.on('click', () => onClickCb(r.id));
    });
  }

  /**
   * Smoothly pans and zooms the camera to encompass all provided
   * coordinates (stations + user origin).
   *
   * @param {number[][]} coordsList - array of [lat, lng] pairs
   */
  flyToBounds(coordsList) {
    const bounds = L.latLngBounds(coordsList);
    this._map.flyToBounds(bounds, {
      padding: [40, 40],
      maxZoom: 13,
      duration: 1
    });
  }

  /**
   * Flies to a station's location and opens its popup.
   *
   * @param {number[]} coords    - [lat, lng]
   * @param {number}   stationId - matches key in this._markers
   */
  focusStation(coords, stationId) {
    this._map.flyTo(coords, 14, { animate: true, duration: 0.8 });
    // Delay opening the popup until the fly animation completes
    setTimeout(() => {
      if (this._markers[stationId]) {
        this._markers[stationId].openPopup();
      }
    }, 900);
  }
}
