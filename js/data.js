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
  },
  {
    id: 7,
    name:          'Merivale Costco',
    coords:        [45.3283, -75.7335],
    basePrice:     1.37,
    distance:      12.5,
    baseTravelMin: 20,
    intersections: 14
  },
  {
    id: 8,
    name:          'St. Laurent Shell',
    coords:        [45.4214, -75.6385],
    basePrice:     1.49,
    distance:      4.8,
    baseTravelMin: 12,
    intersections: 10
  },
  {
    id: 9,
    name:          'Hunt Club Pioneer',
    coords:        [45.3340, -75.6601],
    basePrice:     1.42,
    distance:      10.5,
    baseTravelMin: 18,
    intersections: 11
  },
  {
    id: 10,
    name:          'Carling Esso',
    coords:        [45.3725, -75.7533],
    basePrice:     1.46,
    distance:      7.2,
    baseTravelMin: 15,
    intersections: 13
  },
  {
    id: 11,
    name:          'Montreal Rd Ultramar',
    coords:        [45.4410, -75.6410],
    basePrice:     1.44,
    distance:      5.5,
    baseTravelMin: 14,
    intersections: 8
  },
  {
    id: 12,
    name:          'Bank St Canadian Tire',
    coords:        [45.3850, -75.6705],
    basePrice:     1.45,
    distance:      4.5,
    baseTravelMin: 10,
    intersections: 9
  }
];
