// Jacksonville, FL: the first Helping Hands market.
// Charities are real nonprofits identified by EIN; `npm run pull-charities -- jacksonville-fl` refreshes
// their legal name and IRS address (ProPublica Nonprofit Explorer) and coordinates (US Census Geocoder).
// Neighborhood income levels are illustrative inputs for the synthetic population, not census figures.

export default {
  id: 'jacksonville-fl',
  name: 'Jacksonville',
  state: 'FL',
  center: [30.3322, -81.6557],
  neighborhoods: {
    arlington: { name: 'Arlington', zip: '32211', center: [30.34, -81.58], medianIncome: 50000 },
    northside: { name: 'Northside', zip: '32208', center: [30.40, -81.69], medianIncome: 40000 },
    springfield: { name: 'Springfield', zip: '32206', center: [30.348, -81.656], medianIncome: 37000 },
    moncrief: { name: 'Moncrief', zip: '32209', center: [30.36, -81.72], medianIncome: 33000 },
    westside: { name: 'Westside', zip: '32210', center: [30.27, -81.74], medianIncome: 47000 },
    downtown: { name: 'Downtown', zip: '32202', center: [30.327, -81.657], medianIncome: 39000 },
    murrayHill: { name: 'Murray Hill', zip: '32205', center: [30.306, -81.715], medianIncome: 57000 },
    riverside: { name: 'Riverside', zip: '32204', center: [30.315, -81.689], medianIncome: 64000 },
    southside: { name: 'Southside', zip: '32256', center: [30.22, -81.56], medianIncome: 72000 },
    mandarin: { name: 'Mandarin', zip: '32223', center: [30.16, -81.64], medianIncome: 84000 },
    sanMarco: { name: 'San Marco', zip: '32207', center: [30.305, -81.655], medianIncome: 90000 },
    beaches: { name: 'Jacksonville Beach', zip: '32250', center: [30.29, -81.395], medianIncome: 98000 },
  },
  charities: [
    { ein: '46-5014769', name: 'Feeding Northeast Florida', cause: 'food', website: 'https://feedingnefl.org', image: 'ch-food', impact: { unit: 'meals', perDollar: 3 }, mission: 'Food bank rescuing and distributing food through partner pantries across Northeast Florida.' },
    { ein: '59-6002104', name: 'Clara White Mission', cause: 'food', website: 'https://clarawhitemission.org', image: 'cat-pantry', impact: { unit: 'hot meals', perDollar: 0.5 }, mission: 'Meals, housing support and culinary job training in downtown Jacksonville.' },
    { ein: '59-3229898', name: 'Sulzbacher', cause: 'housing', website: 'https://sulzbacher.org', image: 'ch-housing', impact: { unit: 'nights of shelter', perDollar: 0.04 }, mission: 'Housing, health care and support for people experiencing homelessness.' },
    { ein: '59-2880071', name: 'First Coast Habitat for Humanity', cause: 'housing', website: 'https://www.firstcoasthabitat.org', image: 'cat-utilities', impact: { unit: 'build hours', perDollar: 0.05 }, mission: 'Builds and repairs affordable homes alongside Jacksonville families. Formerly HabiJax.' },
    { ein: '75-3002172', name: 'Volunteers in Medicine Jacksonville', cause: 'health', website: 'https://www.vimjax.org', image: 'ch-health', impact: { unit: 'patient visits', perDollar: 1 / 40 }, mission: 'Free medical care for working, uninsured adults in Northeast Florida.' },
    { ein: '59-2625008', name: 'Ronald McDonald House Jacksonville', cause: 'families', website: 'https://ronaldmcdonaldhousejax.org', image: 'cat-childcare', impact: { unit: 'family nights', perDollar: 0.02 }, mission: 'A home away from home for families with children receiving hospital care.' },
    { ein: '59-2437003', name: 'Downtown Ecumenical Services Council (DESC)', cause: 'families', website: 'https://www.descjax.org', image: 'ch-disaster', impact: { unit: 'days of utility relief', perDollar: 0.2 }, mission: 'Emergency help with rent, utilities and food for families in crisis.' },
    { ein: '59-1814635', name: 'Hubbard House', cause: 'families', website: 'https://www.hubbardhouse.org', image: 'hero-home', impact: { unit: 'safe nights', perDollar: 0.03 }, mission: 'Emergency shelter and support for survivors of domestic violence and their children.' },
    { ein: '59-0683256', name: 'Big Brothers Big Sisters of Northeast Florida', cause: 'youth', website: 'https://www.bbbsnefl.org', image: 'ch-youth', impact: { unit: 'mentoring hours', perDollar: 0.1 }, mission: 'One-to-one mentoring that helps young people reach their potential.' },
    { ein: '59-6167630', name: 'Boys & Girls Clubs of Northeast Florida', cause: 'youth', website: 'https://bgcnf.org', image: 'ch-literacy', impact: { unit: 'after-school days', perDollar: 0.1 }, mission: 'After-school and summer programs for kids and teens.' },
    { ein: '27-1456179', name: 'ElderSource', cause: 'seniors', website: 'https://myeldersource.org', image: 'ch-seniors', impact: { unit: 'home-delivered meals', perDollar: 0.125 }, mission: 'The area agency on aging connecting older adults and caregivers to services.' },
    { ein: '80-0962807', name: 'Operation New Uniform', cause: 'veterans', website: 'https://onuvets.org', image: 'ch-veterans', impact: { unit: 'career coaching hours', perDollar: 0.02 }, mission: 'Career transition training for veterans and military spouses.' },
    { ein: '59-0624410', name: 'Jacksonville Humane Society', cause: 'animals', website: 'https://jaxhumane.org', image: 'ch-animals', impact: { unit: 'shelter meals', perDollar: 2 }, mission: 'Adoption, veterinary care and community programs for pets and their people.' },
    { ein: '01-0709158', name: 'EveryPet', cause: 'animals', website: 'https://www.everypet.org', image: 'ch-vet', impact: { unit: 'pet food meals', perDollar: 3 }, mission: 'Affordable veterinary care and pet food assistance. Formerly First Coast No More Homeless Pets.' },
    { ein: '59-3611338', name: 'St. Johns Riverkeeper', cause: 'environment', website: 'https://www.stjohnsriverkeeper.org', image: 'ch-environment', impact: { unit: 'lbs of litter removed', perDollar: 0.5 }, mission: 'Advocacy, cleanups and education to protect the St. Johns River.' },
    { ein: '47-2342111', name: 'Groundwork Jacksonville', cause: 'environment', website: 'https://www.groundworkjacksonville.org', image: 'ch-garden', impact: { unit: 'native tree plantings', perDollar: 0.04 }, mission: 'Restoring urban creeks and building the Emerald Trail park network.' },
  ],
};
