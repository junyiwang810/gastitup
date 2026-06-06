/**
 * TimeConditions.js
 *
 * Reads the user's local system clock and exposes two boolean
 * properties indicating whether time-based price or traffic
 * modifiers are currently active.
 *
 * Modifier windows:
 *   Rush hour  — 16:00 to 18:00  (4 PM – 6 PM)
 *                Travel time ×1.5 (GasStation.RUSH_HOUR_MULTIPLIER)
 *
 *   Nighttime  — 22:00 to 05:00  (10 PM – 5 AM)
 *                Price −$0.04/L  (GasStation.NIGHT_PRICE_DISCOUNT)
 *
 * The nighttime window spans midnight, so the check requires
 * two separate range comparisons (see isNighttime getter).
 *
 * Dependencies: none
 * Used by: App.js (passes snapshots to GasStation, MapManager, UIManager)
 */

class TimeConditions {

  // ── Time boundary constants ───────────────────────────────────

  /** Rush hour start (inclusive), 24-hour format. */
  static RUSH_START  = 16;

  /** Rush hour end (exclusive), 24-hour format. */
  static RUSH_END    = 18;

  /** Nighttime discount start (inclusive), 24-hour format. */
  static NIGHT_START = 22;

  /** Nighttime discount end (exclusive), 24-hour format. */
  static NIGHT_END   = 5;

  // ── Computed getters ──────────────────────────────────────────

  /**
   * The user's current local hour (0–23), re-evaluated each access.
   * Using a getter rather than storing it as a field means the value
   * is always fresh without needing explicit refresh calls.
   *
   * @returns {number}
   */
  get currentHour() {
    return new Date().getHours();
  }

  /**
   * True between 16:00 (inclusive) and 18:00 (exclusive).
   *
   * @returns {boolean}
   */
  get isRushHour() {
    const h = this.currentHour;
    return h >= TimeConditions.RUSH_START && h < TimeConditions.RUSH_END;
  }

  /**
   * True between 22:00 and 05:00 (spans midnight).
   * Two range checks are required:
   *   22:00 – 23:59 : h >= NIGHT_START
   *   00:00 – 04:59 : h <  NIGHT_END
   *
   * @returns {boolean}
   */
  get isNighttime() {
    const h = this.currentHour;
    return h >= TimeConditions.NIGHT_START || h < TimeConditions.NIGHT_END;
  }

  // ── Snapshot ──────────────────────────────────────────────────

  /**
   * Returns a plain object containing both condition flags captured
   * at the same instant. Passing this snapshot (rather than `this`)
   * to other methods guarantees that rush hour and nighttime are
   * evaluated at identical milliseconds during one calculation run.
   *
   * @returns {{ isRushHour: boolean, isNighttime: boolean }}
   */
  snapshot() {
    return {
      isRushHour:  this.isRushHour,
      isNighttime: this.isNighttime
    };
  }
}
