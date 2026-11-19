import type {TariffDefinition} from './electricity-billing';

export const EDESUR_PROVINCES = ['Buenos Aires', 'Ciudad Autónoma de Buenos Aires'];
export const EDESUR_PARTIDOS = ['Almirante Brown', 'Avellaneda', 'Berazategui', 'Cañuelas',
  'Esteban Echeverría', 'Ezeiza', 'Florencio Varela', 'Lanús', 'Lomas de Zamora',
  'Presidente Perón', 'Quilmes', 'San Vicente'];
const OCTOBER = 'https://www.enre.gov.ar/web/tarifasd.nsf/todoscuadros/937BAA27CA170F3503258E820069D790';
const NOVEMBER = 'https://www.enre.gov.ar/web/tarifasd.nsf/todoscuadros/0083D74210C6DE0303258EAD004257AD';
const reviewedOn = '2026-11-18';
const residentialLimits = [150, 400, 500, 600, 700, Infinity];
const generalLimits = [800, 2000, Infinity];

export const EDESUR_CATEGORIES = [
  ...residentialLimits.map((_, index) => ({code: 'R' + (index + 1), group: 'Residencial'})),
  ...generalLimits.map((_, index) => ({code: 'G' + (index + 1), group: 'General'})),
].map(category => ({
  ...category, label: category.group + ' · ' + category.code, pricingAvailable: true,
  source: NOVEMBER, reviewedOn, effectiveFrom: '2026-10-01',
}));

const tables = [
  {
    from: '2026-10-01', to: '2026-11-01', source: OCTOBER,
    fixed: [1771.06, 3717.51, 12168.59, 19843.84, 42905.86, 65106.92],
    rates: [157.116, 157.692, 169.922, 174.056, 186.593, 203.605],
    baseRates: [59.251, 59.827, 72.057, 76.191, 88.728, 105.740],
    generalFixed: 19613.84, generalRates: [252.856, 277.318, 284.307],
  },
  {
    from: '2026-11-01', to: '2026-12-01', source: NOVEMBER,
    fixed: [1826.26, 3833.37, 12547.86, 20462.33, 44243.15, 67136.17],
    rates: [161.157, 161.751, 174.362, 178.624, 191.552, 209.094],
    baseRates: [62.817, 63.411, 76.022, 80.285, 93.212, 110.754],
    generalFixed: 20225.17, generalRates: [266.081, 291.306, 298.513],
  },
];

export const EDESUR_TARIFFS: TariffDefinition[] = EDESUR_PROVINCES.flatMap(province =>
  tables.flatMap(table => {
    const common = {
      provider: 'EDESUR', jurisdiction: 'AR-' + province,
      effectiveFrom: table.from, effectiveTo: table.to, source: table.source, reviewedOn,
      rule: 'selected-tier-all-kwh' as const, referenceDays: 30, normalizeConsumption: true,
      adjustmentsComplete: false, taxesComplete: false, credits: [], taxes: [],
    };
    const residential = residentialLimits.map((maxKwh, index) => ({
      maxKwh, code: 'R' + (index + 1), fixed: table.fixed[index], rate: table.rates[index],
    }));
    return [
      {...common, id: 'edesur-r-sin-' + table.from, category: 'Residencial', segment: 'unsubsidized', tiers: residential},
      {...common, id: 'edesur-r-con-' + table.from, category: 'Residencial', segment: 'subsidized',
        tiers: residential.map((tier, index) => ({...tier, baseRate: table.baseRates[index], baseKwh: 150}))},
      {...common, id: 'edesur-g-' + table.from, category: 'General', segment: 'general',
        tiers: generalLimits.map((maxKwh, index) => ({
          maxKwh, code: 'G' + (index + 1), fixed: table.generalFixed, rate: table.generalRates[index],
        }))},
    ];
  }));
