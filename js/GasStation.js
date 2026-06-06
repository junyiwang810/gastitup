/**
 * GasStation.js
 *
 * Represents a single gas station and encapsulates every calculation
 * that depends on that station's attributes.
 *
 * Responsibilities:
 *   - Store raw station data as private fields.
 *   - Expose read-only getters for each attribute.
 *   - Implement the four core algorithms as instance methods:
 *       A. Nighttime price adjustment
 *       B. Rush hour travel time adjustment
 *       C. City driving fuel penalty (trip fuel used)
 *       D. True total cost (fuel wanted + trip fuel burned)
 *   - Provide computeResult() as a convenience method that returns
 *     a plain object with all computed values for a given scenario.
 *
 * Dependencies: none (loaded first by index.html)
 */

class GasStation {

  // ── Algorithm constants ────────────────────────────────────────
  //    Centralised here so any tuning change is made in one place.

  /** Price reduction per litre applied between 10 PM and 5 AM (CAD $). */
  static NIGHT_PRICE_DISCOUNT = 0.04;

  /** Travel time multiplier applied between 4 PM and 6 PM. */
  static RUSH_HOUR_MULTIPLIER = 1.5;

  /**
   * Extra litres burned per intersection stop.
   * Accounts for the fuel cost of braking and re-accelerating
   * at every controlled intersection on the route.
   */
  static FUEL_PER_INTERSECTION = 0.015; // litres

  // ── Constructor ────────────────────────────────────────────────

  /**
   * @param {object} data
   * @param {number}   data.id            - unique identifier
   * @param {string}   data.name          - display name
   * @param {number[]} data.coords        - [latitude, longitude]
   * @param {number}   data.basePrice     - base price per litre (CAD $)
   * @param {number}   data.distance      - route distance from user (km)
   * @param {number}   data.baseTravelMin - travel time, no traffic (min)
   * @param {number}   data.intersections - stop-and-go intersections on route
   */
  constructor({ id, name, coords, basePrice, distance, baseTravelMin, intersections }) {
    this._id             = id;
    this._name           = name;
    this._coords         = coords;
    this._basePrice      = basePrice;
    this._distance       = distance;
    this._baseTravelMin  = baseTravelMin;
    this._intersections  = intersections;
  }

  // ── Read-only getters ──────────────────────────────────────────

  get id()            { return this._id; }
  get name()          { return this._name; }
  get coords()        { return this._coords; }
  get basePrice()     { return this._basePrice; }
  get distance()      { return this._distance; }
  get intersections() { return this._intersections; }

  // ── Algorithm A — Nighttime Price Adjustment ───────────────────
  /**
   * Late-night stations lower their prices to attract drivers.
   * Deducts NIGHT_PRICE_DISCOUNT from the base price if isNighttime is true.
   *
   * @param {boolean} isNighttime
   * @returns {number} adjusted price per litre (CAD $)
   */
  getAdjustedPrice(isNighttime) {
    return isNighttime
      ? this._basePrice - GasStation.NIGHT_PRICE_DISCOUNT
      : this._basePrice;
  }

  // ── Algorithm B — Rush Hour Travel Time ───────────────────────
  /**
   * Rush hour traffic significantly extends trip duration.
   * Multiplies baseTravelMin by RUSH_HOUR_MULTIPLIER when isRushHour is true.
   *
   * @param {boolean} isRushHour
   * @returns {number} adjusted travel time in minutes
   */
  getTravelTime(isRushHour) {
    return isRushHour
      ? this._baseTravelMin * GasStation.RUSH_HOUR_MULTIPLIER
      : this._baseTravelMin;
  }

  // ── Algorithm C — City Driving Fuel Penalty ───────────────────
  /**
   * Calculates total fuel consumed on the trip using:
   *
   *   F_total = (D / E) + (I * P_stop)
   *
   * Where:
   *   D      = route distance (km)
   *   E      = fuel efficiency converted to km/L  (= 100 / L_per_100km)
   *   I      = number of intersections on the route
   *   P_stop = FUEL_PER_INTERSECTION (0.015 L)
   *
   * The second term (I * P_stop) is the "city driving penalty":
   * each time the car brakes at a light and then accelerates again,
   * roughly 0.015 extra litres are burned compared to steady cruising.
   *
   * @param {number} efficiencyL100km - the car's fuel rating (L/100 km)
   * @returns {number} total litres consumed on the trip
   */
  getTripFuelLitres(efficiencyL100km) {
    const kmPerLitre     = 100 / efficiencyL100km;
    const cruiseFuel     = this._distance / kmPerLitre;
    const intersectionPenalty = this._intersections * GasStation.FUEL_PER_INTERSECTION;
    return cruiseFuel + intersectionPenalty;
  }

  // ── Algorithm D — True Total Cost ─────────────────────────────
  /**
   * Calculates the real out-of-pocket cost of using this station:
   *
   *   True Cost = (fuelWanted + tripFuel) * pricePerLitre
   *
   * "fuelWanted" is what the driver intends to pump.
   * "tripFuel"   is the fuel burned just getting to the station.
   * Both quantities are multiplied by the adjusted price,
   * because the driver effectively pays for both at that station's rate.
   *
   * @param {number}  fuelNeededL     - litres the driver wants to pump
   * @param {number}  efficiencyL100km
   * @param {boolean} isNighttime
   * @returns {number} total cost (CAD $)
   */
  getTrueCost(fuelNeededL, efficiencyL100km, isNighttime) {
    const price    = this.getAdjustedPrice(isNighttime);
    const tripFuel = this.getTripFuelLitres(efficiencyL100km);
    return (fuelNeededL + tripFuel) * price;
  }

  // ── Convenience method ─────────────────────────────────────────
  /**
   * Runs all four algorithms for a single scenario and returns
   * a plain result object. Used by MapManager and UIManager
   * to avoid repeating the same calls.
   *
   * @param {number} fuelNeededL       - litres to pump
   * @param {number} efficiencyL100km  - car's L/100 km
   * @param {{ isRushHour: boolean, isNighttime: boolean }} conditions
   * @returns {{ id, name, coords, distance, intersections,
   *             adjPrice, travelMin, tripFuel, totalCost }}
   */
  computeResult(fuelNeededL, efficiencyL100km, conditions) {
    const { isRushHour, isNighttime } = conditions;

    const adjPrice  = this.getAdjustedPrice(isNighttime);
    const travelMin = this.getTravelTime(isRushHour);
    const tripFuel  = this.getTripFuelLitres(efficiencyL100km);
    const totalCost = (fuelNeededL + tripFuel) * adjPrice;

    return {
      id:            this._id,
      name:          this._name,
      coords:        this._coords,
      distance:      this._distance,
      intersections: this._intersections,
      adjPrice,
      travelMin,
      tripFuel,
      totalCost
    };
  }
}
