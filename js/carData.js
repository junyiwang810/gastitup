/**
 * carData.js
 *
 * A static database of popular vehicles sold in Canada with their
 * official combined fuel consumption ratings (L/100 km).
 *
 * Source: Natural Resources Canada fuel consumption guide (approximated
 * for educational use — not a live/official feed).
 *
 * Structure per record:
 *   year     {number}  — model year
 *   make     {string}  — manufacturer
 *   model    {string}  — model name
 *   combined {number}  — combined city/highway fuel use (L/100 km)
 */

const CAR_DATABASE = [
  // ── Subcompact / economy ────────────────────────────────────────
  { year: 2024, make: 'Hyundai',    model: 'Accent',        combined: 7.0 },
  { year: 2024, make: 'Kia',        model: 'Rio',            combined: 7.2 },
  { year: 2024, make: 'Toyota',     model: 'Yaris',          combined: 6.8 },
  { year: 2024, make: 'Nissan',     model: 'Micra',          combined: 6.9 },
  { year: 2024, make: 'Mitsubishi', model: 'Mirage',         combined: 6.7 },

  // ── Compact cars ────────────────────────────────────────────────
  { year: 2024, make: 'Honda',      model: 'Civic',          combined: 7.2 },
  { year: 2024, make: 'Toyota',     model: 'Corolla',        combined: 7.9 },
  { year: 2024, make: 'Mazda',      model: 'Mazda3',         combined: 7.5 },
  { year: 2024, make: 'Hyundai',    model: 'Elantra',        combined: 7.0 },
  { year: 2024, make: 'Kia',        model: 'Forte',          combined: 7.4 },
  { year: 2024, make: 'Volkswagen', model: 'Jetta',          combined: 7.8 },
  { year: 2024, make: 'Nissan',     model: 'Sentra',         combined: 7.4 },
  { year: 2024, make: 'Subaru',     model: 'Impreza',        combined: 8.1 },
  { year: 2024, make: 'Honda',      model: 'Civic Si',       combined: 8.1 },

  // ── Mid-size sedans ─────────────────────────────────────────────
  { year: 2024, make: 'Toyota',     model: 'Camry',          combined: 8.8 },
  { year: 2024, make: 'Honda',      model: 'Accord',         combined: 8.0 },
  { year: 2024, make: 'Mazda',      model: 'Mazda6',         combined: 8.4 },
  { year: 2024, make: 'Hyundai',    model: 'Sonata',         combined: 8.5 },
  { year: 2024, make: 'Kia',        model: 'K5',             combined: 8.2 },
  { year: 2024, make: 'Nissan',     model: 'Altima',         combined: 8.3 },
  { year: 2024, make: 'Subaru',     model: 'Legacy',         combined: 8.7 },
  { year: 2024, make: 'Volkswagen', model: 'Passat',         combined: 8.9 },
  { year: 2024, make: 'Chevrolet',  model: 'Malibu',         combined: 8.6 },

  // ── Compact SUVs / crossovers ───────────────────────────────────
  { year: 2024, make: 'Toyota',     model: 'RAV4',           combined: 9.7 },
  { year: 2024, make: 'Honda',      model: 'CR-V',           combined: 8.9 },
  { year: 2024, make: 'Mazda',      model: 'CX-5',           combined: 9.3 },
  { year: 2024, make: 'Hyundai',    model: 'Tucson',         combined: 9.4 },
  { year: 2024, make: 'Kia',        model: 'Sportage',       combined: 9.6 },
  { year: 2024, make: 'Ford',       model: 'Escape',         combined: 9.5 },
  { year: 2024, make: 'Nissan',     model: 'Rogue',          combined: 9.8 },
  { year: 2024, make: 'Subaru',     model: 'Forester',       combined: 9.8 },
  { year: 2024, make: 'Chevrolet',  model: 'Equinox',        combined: 10.2 },
  { year: 2024, make: 'Volkswagen', model: 'Tiguan',         combined: 10.4 },
  { year: 2024, make: 'Toyota',     model: 'Corolla Cross',  combined: 9.2 },
  { year: 2024, make: 'Hyundai',    model: 'Kona',           combined: 8.8 },
  { year: 2024, make: 'Kia',        model: 'Seltos',         combined: 9.0 },
  { year: 2024, make: 'Mitsubishi', model: 'Eclipse Cross',  combined: 10.0 },
  { year: 2024, make: 'Jeep',       model: 'Compass',        combined: 10.6 },

  // ── Mid-size SUVs ───────────────────────────────────────────────
  { year: 2024, make: 'Toyota',     model: 'Highlander',     combined: 11.2 },
  { year: 2024, make: 'Ford',       model: 'Explorer',       combined: 11.8 },
  { year: 2024, make: 'Honda',      model: 'Pilot',          combined: 11.4 },
  { year: 2024, make: 'Hyundai',    model: 'Santa Fe',       combined: 10.6 },
  { year: 2024, make: 'Kia',        model: 'Sorento',        combined: 10.4 },
  { year: 2024, make: 'Kia',        model: 'Telluride',      combined: 12.4 },
  { year: 2023, make: 'Kia',        model: 'Telluride',      combined: 12.6 },
  { year: 2022, make: 'Kia',        model: 'Telluride',      combined: 12.8 },
  { year: 2021, make: 'Kia',        model: 'Telluride',      combined: 12.8 },
  { year: 2020, make: 'Kia',        model: 'Telluride',      combined: 13.0 },
  { year: 2024, make: 'Nissan',     model: 'Pathfinder',     combined: 12.0 },
  { year: 2024, make: 'Chevrolet',  model: 'Traverse',       combined: 12.4 },
  { year: 2024, make: 'Mazda',      model: 'CX-9',           combined: 11.8 },
  { year: 2024, make: 'Mazda',      model: 'CX-90',          combined: 10.8 },
  { year: 2024, make: 'Jeep',       model: 'Grand Cherokee', combined: 12.2 },
  { year: 2024, make: 'Hyundai',    model: 'Palisade',       combined: 12.4 },
  { year: 2024, make: 'Volkswagen', model: 'Atlas',          combined: 12.8 },
  { year: 2024, make: 'Subaru',     model: 'Ascent',         combined: 11.6 },

  // ── Full-size SUVs ──────────────────────────────────────────────
  { year: 2024, make: 'Ford',       model: 'Expedition',     combined: 14.4 },
  { year: 2024, make: 'Chevrolet',  model: 'Tahoe',          combined: 14.8 },
  { year: 2024, make: 'GMC',        model: 'Yukon',          combined: 14.8 },
  { year: 2024, make: 'Nissan',     model: 'Armada',         combined: 16.0 },
  { year: 2024, make: 'Toyota',     model: 'Sequoia',        combined: 13.2 },

  // ── Pickup trucks ───────────────────────────────────────────────
  { year: 2024, make: 'Ford',       model: 'F-150',          combined: 13.8 },
  { year: 2024, make: 'RAM',        model: '1500',           combined: 13.2 },
  { year: 2024, make: 'Chevrolet',  model: 'Silverado 1500', combined: 13.6 },
  { year: 2024, make: 'GMC',        model: 'Sierra 1500',    combined: 13.4 },
  { year: 2024, make: 'Toyota',     model: 'Tacoma',         combined: 11.8 },
  { year: 2024, make: 'Nissan',     model: 'Frontier',       combined: 12.4 },
  { year: 2024, make: 'Ford',       model: 'F-250',          combined: 16.2 },
  { year: 2024, make: 'RAM',        model: '2500',           combined: 16.8 },

  // ── Minivans ────────────────────────────────────────────────────
  { year: 2024, make: 'Toyota',     model: 'Sienna',         combined: 9.0 },
  { year: 2024, make: 'Chrysler',   model: 'Pacifica',       combined: 11.5 },
  { year: 2024, make: 'Kia',        model: 'Carnival',       combined: 11.8 },
  { year: 2024, make: 'Honda',      model: 'Odyssey',        combined: 11.2 },

  // ── Sports / performance ────────────────────────────────────────
  { year: 2024, make: 'Ford',       model: 'Mustang',        combined: 13.5 },
  { year: 2024, make: 'Chevrolet',  model: 'Camaro',         combined: 13.2 },
  { year: 2024, make: 'Subaru',     model: 'WRX',            combined: 10.2 },
  { year: 2024, make: 'Toyota',     model: 'GR86',           combined: 9.8 },
  { year: 2024, make: 'Mazda',      model: 'MX-5 Miata',     combined: 8.0 },

  // ── Luxury sedans / SUVs ────────────────────────────────────────
  { year: 2024, make: 'BMW',        model: '3 Series',       combined: 9.8 },
  { year: 2024, make: 'BMW',        model: '5 Series',       combined: 10.8 },
  { year: 2024, make: 'BMW',        model: 'X3',             combined: 10.6 },
  { year: 2024, make: 'Mercedes',   model: 'C-Class',        combined: 10.2 },
  { year: 2024, make: 'Mercedes',   model: 'E-Class',        combined: 10.8 },
  { year: 2024, make: 'Mercedes',   model: 'GLC',            combined: 11.2 },
  { year: 2024, make: 'Audi',       model: 'A4',             combined: 9.6 },
  { year: 2024, make: 'Audi',       model: 'Q5',             combined: 10.8 },
  { year: 2024, make: 'Lexus',      model: 'IS',             combined: 10.8 },
  { year: 2024, make: 'Lexus',      model: 'RX',             combined: 11.4 },
  { year: 2024, make: 'Cadillac',   model: 'CT5',            combined: 10.6 },
  { year: 2024, make: 'Lincoln',    model: 'Corsair',        combined: 10.6 },
  { year: 2024, make: 'Volvo',      model: 'XC60',           combined: 10.4 },
  { year: 2024, make: 'Genesis',    model: 'G70',            combined: 10.0 }
];
