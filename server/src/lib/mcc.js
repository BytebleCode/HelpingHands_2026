// Merchant Category Code (ISO 18245) \u2192 Helping Hands spending category.
// needWeight: 1 = essential need, 0 = pure want. Offers below OFFER_NEED_THRESHOLD are withheld.

export const OFFER_NEED_THRESHOLD = 0.6;

export const CATEGORIES = {
  groceries:     { label: 'Groceries',           needWeight: 1.0, group: 'need' },
  pharmacy:      { label: 'Pharmacy',            needWeight: 1.0, group: 'need' },
  medical:       { label: 'Medical & Dental',    needWeight: 1.0, group: 'need' },
  utilities:     { label: 'Utilities',           needWeight: 1.0, group: 'need' },
  childcare:     { label: 'Childcare',           needWeight: 1.0, group: 'need' },
  housing:       { label: 'Rent & Housing',      needWeight: 1.0, group: 'need' },
  fuel:          { label: 'Fuel',                needWeight: 0.9, group: 'need' },
  transit:       { label: 'Transit',             needWeight: 0.9, group: 'need' },
  insurance:     { label: 'Insurance',           needWeight: 0.9, group: 'need' },
  telecom:       { label: 'Phone & Internet',    needWeight: 0.8, group: 'need' },
  school:        { label: 'School Supplies',     needWeight: 0.8, group: 'need' },
  auto:          { label: 'Auto Care',           needWeight: 0.8, group: 'need' },
  household:     { label: 'Home Essentials',     needWeight: 0.7, group: 'need' },
  clothing:      { label: 'Everyday Clothing',   needWeight: 0.6, group: 'need' },
  rideshare:     { label: 'Rideshare',           needWeight: 0.5, group: 'flex' },
  fastfood:      { label: 'Quick Service',       needWeight: 0.3, group: 'want' },
  electronics:   { label: 'Electronics',         needWeight: 0.3, group: 'want' },
  dining:        { label: 'Restaurants',         needWeight: 0.2, group: 'want' },
  streaming:     { label: 'Streaming & Cable',   needWeight: 0.1, group: 'want' },
  entertainment: { label: 'Entertainment',       needWeight: 0.0, group: 'want' },
  bars:          { label: 'Bars & Lounges',      needWeight: 0.0, group: 'want' },
  travel:        { label: 'Travel',              needWeight: 0.0, group: 'want' },
  luxury:        { label: 'Jewelry & Designer',  needWeight: 0.0, group: 'want' },
  altfinance:    { label: 'Check Cashing & Pawn', needWeight: 0.5, group: 'flex', offerable: false },
  other:         { label: 'Other',               needWeight: 0.3, group: 'flex', offerable: false },
};

const MCC_TO_CATEGORY = {
  5411: 'groceries', 5422: 'groceries', 5451: 'groceries', 5499: 'groceries',
  5912: 'pharmacy',
  8011: 'medical', 8021: 'medical', 8042: 'medical', 8043: 'medical', 8062: 'medical', 8099: 'medical',
  4900: 'utilities',
  8351: 'childcare',
  6513: 'housing',
  5541: 'fuel', 5542: 'fuel',
  4111: 'transit', 4131: 'transit',
  6300: 'insurance',
  4814: 'telecom',
  5943: 'school', 8211: 'school',
  7538: 'auto', 5533: 'auto',
  5310: 'household', 5331: 'household', 5251: 'household', 5200: 'household', 7211: 'household',
  5651: 'clothing', 5641: 'clothing', 5661: 'clothing',
  4121: 'rideshare',
  5814: 'fastfood',
  5732: 'electronics',
  5812: 'dining',
  5815: 'streaming', 5818: 'streaming', 4899: 'streaming',
  7832: 'entertainment', 7922: 'entertainment', 7996: 'entertainment', 7997: 'entertainment',
  5813: 'bars',
  4511: 'travel', 7011: 'travel', 4722: 'travel',
  5944: 'luxury', 5681: 'luxury',
  5933: 'altfinance', 6051: 'altfinance',
};

// ACH bill payments carry a payee category instead of an MCC.
const PAYEE_TO_CATEGORY = {
  RENT: 'housing', MTG: 'housing', UTIL: 'utilities', INS: 'insurance', PHONE: 'telecom', CHILDCARE: 'childcare', LOAN: 'other',
};

export function categoryOf(tran) {
  if (tran.mrchCatCde && MCC_TO_CATEGORY[tran.mrchCatCde]) return MCC_TO_CATEGORY[tran.mrchCatCde];
  if (tran.payeeCatCde && PAYEE_TO_CATEGORY[tran.payeeCatCde]) return PAYEE_TO_CATEGORY[tran.payeeCatCde];
  return 'other';
}

export function needWeightOf(category) {
  return CATEGORIES[category]?.needWeight ?? 0.3;
}

export function isOfferable(category) {
  const c = CATEGORIES[category];
  return !!c && c.offerable !== false && c.needWeight >= OFFER_NEED_THRESHOLD;
}

export const DISCRETIONARY = new Set(['dining', 'bars', 'entertainment', 'travel', 'luxury', 'electronics', 'streaming']);
export const TRAVEL_LUXURY = new Set(['travel', 'luxury']);
