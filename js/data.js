/**
 * data.js
 *
 * Application-wide constants:
 *   STATION_DATA  — mock gas station records for the Ottawa area.
 *   USER_ORIGIN   — the user's assumed starting coordinates (downtown Ottawa).
 *
 * In a production application, STATION_DATA would be fetched from a live
 * prices API (e.g. GasBuddy, Natural Resources Canada). It is hard-coded
 * here to avoid CORS restrictions and API billing in a school context.
 *
 * Each station record contains:
 *   id            {number}   — unique identifier
 *   name          {string}   — display name
 *   coords        {number[]} — [latitude, longitude]
 *   basePrice     {number}   — price per litre in CAD, before any adjustments
 *   distance      {number}   — route distance from USER_ORIGIN in km
 *   baseTravelMin {number}   — travel time under normal (non-rush) conditions, minutes
 *   intersections {number}   — controlled intersections on the route (stop-and-go)
 */

const USER_ORIGIN = [45.4215, -75.6972]; // Downtown Ottawa, ON

const STATION_DATA = [
  {
    id: 1,
    name:          'Main St. Gas',
    coords:        [45.4150, -75.6890],
    basePrice:     1.48,
    distance:      1.2,
    baseTravelMin: 5,
    intersections: 4
  },
  {
    id: 2,
    name:          'Rideau Fuel Stop',
    coords:        [45.4280, -75.7050],
    basePrice:     1.45,
    distance:      3.5,
    baseTravelMin: 11,
    intersections: 9
  },
  {
    id: 3,
    name:          'Kanata Petro Hub',
    coords:        [45.3485, -75.9180],
    basePrice:     1.41,
    distance:      22.0,
    baseTravelMin: 28,
    intersections: 18
  },
  {
    id: 4,
    name:          'Baseline QuickFill',
    coords:        [45.3760, -75.7620],
    basePrice:     1.44,
    distance:      8.4,
    baseTravelMin: 16,
    intersections: 12
  },
  {
    id: 5,
    name:          'Orleans Express',
    coords:        [45.4580, -75.5150],
    basePrice:     1.43,
    distance:      14.6,
    baseTravelMin: 22,
    intersections: 15
  },
  {
    id: 6,
    name:          'ByWard Budget Gas',
    coords:        [45.4270, -75.6920],
    basePrice:     1.50,
    distance:      2.8,
    baseTravelMin: 9,
    intersections: 7
  }
];
