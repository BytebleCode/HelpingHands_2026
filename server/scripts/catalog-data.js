// Source data for the static DB. Institutions, merchants, partners, people and routing numbers are fictional;
// charities are real Jacksonville nonprofits (see markets/ and pull-charities.js).

// ABA routing number check digit: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10)
export function aba(prefix8) {
  const d = prefix8.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5]);
  return prefix8 + ((10 - (sum % 10)) % 10);
}

export const INSTITUTIONS = [
  { instNbr: '0101', instNme: 'First Coast Community Bank', rtnNbr: aba('06310174'), shortNme: 'First Coast' },
  { instNbr: '0207', instNme: 'Riverbend Federal Credit Union', rtnNbr: aba('26307719'), shortNme: 'Riverbend FCU' },
  { instNbr: '0315', instNme: 'Harbor State Bank', rtnNbr: aba('06310352'), shortNme: 'Harbor State' },
  { instNbr: '0420', instNme: 'Lantern Trust Company', rtnNbr: aba('06310429'), shortNme: 'Lantern Trust' },
  { instNbr: '0533', instNme: 'St. Johns Commerce Bank', rtnNbr: aba('06310533'), shortNme: 'St. Johns Commerce' },
].map((i) => ({ ...i, coreSys: 'FIS IBS', cityNme: 'Jacksonville', stCde: 'FL' }));

// The program sponsor's pooled rewards account (donations and cash-outs are funded from here).
export const REWARDS_POOL = { instNbr: '0420', applCde: 'DD', acctNbr: '4200009001', nme: 'Helping Hands Rewards Pool' };

// Partners: merchants that bank on an FIS-core institution and fund offers.
export const PARTNERS = [
  { id: 'harvest-table', name: 'Harvest Table Market', category: 'groceries', mcc: 5411, settleInst: '0315', blurb: 'Neighborhood grocer with fresh produce and pantry staples.' },
  { id: 'greenleaf', name: 'Greenleaf Grocer', category: 'groceries', mcc: 5411, settleInst: '0533', blurb: 'Value-focused grocery with SNAP-friendly pricing.' },
  { id: 'crescent-pharmacy', name: 'Crescent Pharmacy', category: 'pharmacy', mcc: 5912, settleInst: '0315', blurb: 'Prescriptions, wellness and everyday health.' },
  { id: 'coastal-power', name: 'Coastal Power & Light', category: 'utilities', mcc: 4900, settleInst: '0533', payee: 'UTIL', blurb: 'Regional electric and water utility.' },
  { id: 'first-coast-transit', name: 'First Coast Transit', category: 'transit', mcc: 4111, settleInst: '0533', blurb: 'Buses, the Skyway and on-demand shuttles.' },
  { id: 'meridian-fuel', name: 'Meridian Fuel', category: 'fuel', mcc: 5541, settleInst: '0315', blurb: 'Fuel and convenience across Duval County.' },
  { id: 'little-oaks', name: 'Little Oaks Early Learning', category: 'childcare', mcc: 8351, settleInst: '0101', payee: 'CHILDCARE', blurb: 'Licensed early learning and after-school care.' },
  { id: 'riverside-clinic', name: 'Riverside Family Clinic', category: 'medical', mcc: 8011, settleInst: '0101', blurb: 'Primary and pediatric care, sliding-scale fees.' },
  { id: 'bridge-wireless', name: 'Bridge Wireless', category: 'telecom', mcc: 4814, settleInst: '0533', payee: 'PHONE', blurb: 'Phone and home internet plans.' },
  { id: 'ledger-quill', name: 'Ledger & Quill Supply', category: 'school', mcc: 5943, settleInst: '0207', blurb: 'School and office supplies.' },
  { id: 'mainline-auto', name: 'Mainline Auto Care', category: 'auto', mcc: 7538, settleInst: '0207', blurb: 'Honest repairs, tires and inspections.' },
  { id: 'threadline', name: 'Threadline Family Outfitters', category: 'clothing', mcc: 5651, settleInst: '0315', blurb: 'Durable everyday clothing for the whole family.' },
  { id: 'homestead-goods', name: 'Homestead Goods', category: 'household', mcc: 5331, settleInst: '0533', blurb: 'Cleaning, laundry and home essentials.' },
  // Discretionary partners. Their offers exist in the catalog but are withheld by the needs filter.
  { id: 'lumiere', name: 'Lumière Brasserie', category: 'dining', mcc: 5812, settleInst: '0315', blurb: 'French brasserie.' },
  { id: 'aurelia', name: 'Aurelia Jewelers', category: 'luxury', mcc: 5944, settleInst: '0533', blurb: 'Fine jewelry.' },
  { id: 'starlight', name: 'Starlight Cinema', category: 'entertainment', mcc: 7832, settleInst: '0533', blurb: 'Luxury recliner cinema.' },
  { id: 'jetcoast', name: 'JetCoast Airways', category: 'travel', mcc: 4511, settleInst: '0315', blurb: 'Regional airline.' },
  { id: 'velvet-room', name: 'The Velvet Room', category: 'bars', mcc: 5813, settleInst: '0101', blurb: 'Cocktail lounge.' },
];

// Non-partner merchants so transaction history looks real.
export const OTHER_MERCHANTS = [
  ['SUNMART GROCERY #212', 5411], ['BAYSIDE FOODS', 5411], ['CORNER DRUG CO', 5912], ['QUIKSTOP FUEL 88', 5541],
  ['DUVAL DENTAL ASSOC', 8021], ['VISIONPOINT OPTICAL', 8042], ['BRIGHTSTART DAYCARE', 8351],
  ['ROUTE 1 AUTO PARTS', 5533], ['DOLLAR DEPOT', 5310], ['ACE HARDWARE CO', 5251], ['SUDS LAUNDROMAT', 7211],
  ['KIDS CLOSET', 5641], ['STRIDE SHOES', 5661], ['RIDENOW TRIP', 4121], ['PIZZA PALACE', 5814],
  ['BURGER BARN', 5814], ['VOLT ELECTRONICS', 5732], ['BAYVIEW BISTRO', 5812], ['OCEANSIDE GRILL', 5812],
  ['PIXELPLAY STREAMING', 5815], ['SOUNDWAVE MUSIC', 5818], ['COASTLINE CABLE TV', 4899], ['ARENA TICKETS', 7922],
  ['FAIRWAY GOLF CLUB', 7997], ['THE TAPHOUSE', 5813], ['MARQUEE HOTEL', 7011], ['WANDERLUST TRAVEL', 4722],
  ['GILDED JEWELERS', 5944], ['FAST CASH PAWN', 5933], ['QUICKCHECK CASHING', 6051], ['OFFICE CORNER', 5943],
  ['PARKSIDE PEDIATRICS', 8011], ['ST VINCENT GENERAL HOSP', 8062], ['TRUCARE URGENT CARE', 8099],
];

// Needs-focused offers (with base rates before the tier multiplier) plus a handful of discretionary ones
// that the recommender deliberately withholds.
export const OFFERS = [
  { id: 'off-harvest-produce', partnerId: 'harvest-table', image: 'hero-rewards', title: 'Fresh produce, every week', kind: 'percent', baseRate: 5, minSpend: 25, maxReward: 15, desc: 'Back on any Harvest Table purchase of $25 or more.' },
  { id: 'off-harvest-staples', partnerId: 'harvest-table', image: 'cat-pantry', title: 'Pantry staples bonus', kind: 'fixed', baseAmount: 4, minSpend: 60, maxReward: 4, desc: 'A flat credit when your basket reaches $60.' },
  { id: 'off-greenleaf', partnerId: 'greenleaf', title: 'Everyday grocery savings', kind: 'percent', baseRate: 4, minSpend: 20, maxReward: 12, desc: 'Back on groceries at any Greenleaf location.' },
  { id: 'off-crescent-rx', partnerId: 'crescent-pharmacy', title: 'Prescriptions & wellness', kind: 'percent', baseRate: 6, minSpend: 10, maxReward: 12, desc: 'Back on prescriptions, first-aid and wellness items.' },
  { id: 'off-coastal-autopay', partnerId: 'coastal-power', title: 'Utility bill credit', kind: 'fixed', baseAmount: 5, minSpend: 50, maxReward: 5, desc: 'A credit toward your next electric & water bill.' },
  { id: 'off-transit-pass', partnerId: 'first-coast-transit', title: 'Monthly pass rebate', kind: 'percent', baseRate: 8, minSpend: 5, maxReward: 10, desc: 'Back on fares and monthly passes.' },
  { id: 'off-meridian-fuel', partnerId: 'meridian-fuel', title: 'Fuel for the commute', kind: 'percent', baseRate: 3, minSpend: 20, maxReward: 9, desc: 'Back at the pump on fill-ups of $20 or more.' },
  { id: 'off-little-oaks', partnerId: 'little-oaks', title: 'Childcare tuition relief', kind: 'percent', baseRate: 2, minSpend: 100, maxReward: 25, desc: 'Back on weekly or monthly tuition payments.' },
  { id: 'off-riverside-visit', partnerId: 'riverside-clinic', title: 'Family clinic copay', kind: 'fixed', baseAmount: 6, minSpend: 15, maxReward: 6, desc: 'A credit toward any visit copay.' },
  { id: 'off-bridge-plan', partnerId: 'bridge-wireless', title: 'Phone & internet bill', kind: 'percent', baseRate: 5, minSpend: 30, maxReward: 8, desc: 'Back on your monthly plan payment.' },
  { id: 'off-ledger-school', partnerId: 'ledger-quill', title: 'Back-to-school supplies', kind: 'percent', baseRate: 7, minSpend: 15, maxReward: 10, desc: 'Back on notebooks, backpacks and calculators.' },
  { id: 'off-mainline-repair', partnerId: 'mainline-auto', title: 'Keep the car running', kind: 'percent', baseRate: 5, minSpend: 50, maxReward: 20, desc: 'Back on repairs, tires and inspections.' },
  { id: 'off-threadline', partnerId: 'threadline', title: 'Kids’ clothing & shoes', kind: 'percent', baseRate: 5, minSpend: 25, maxReward: 10, desc: 'Back on everyday clothing for the whole family.' },
  { id: 'off-homestead', partnerId: 'homestead-goods', title: 'Home essentials', kind: 'percent', baseRate: 5, minSpend: 15, maxReward: 8, desc: 'Back on cleaning, laundry and paper goods.' },
  { id: 'off-lumiere', partnerId: 'lumiere', title: 'Prix fixe dinner', kind: 'percent', baseRate: 15, minSpend: 80, maxReward: 30, desc: 'Back on dinner for two.' },
  { id: 'off-aurelia', partnerId: 'aurelia', title: 'Fine jewelry event', kind: 'percent', baseRate: 10, minSpend: 300, maxReward: 100, desc: 'Back on any piece over $300.' },
  { id: 'off-starlight', partnerId: 'starlight', title: 'Premiere night', kind: 'fixed', baseAmount: 10, minSpend: 30, maxReward: 10, desc: 'Credit on two premium seats.' },
  { id: 'off-jetcoast', partnerId: 'jetcoast', title: 'Weekend getaway fares', kind: 'percent', baseRate: 8, minSpend: 150, maxReward: 60, desc: 'Back on round-trip fares.' },
  { id: 'off-velvet', partnerId: 'velvet-room', title: 'Cocktail hour', kind: 'percent', baseRate: 20, minSpend: 40, maxReward: 15, desc: 'Back on the tab.' },
];

export const CAUSES = {
  food: 'Food Security', housing: 'Housing', health: 'Health', families: 'Families', youth: 'Youth',
  seniors: 'Seniors', veterans: 'Veterans', animals: 'Animals', environment: 'Environment',
};

// Pooled gifts to model-detected neighbors are held here until recipients use them.
export const NEIGHBOR_FUND = { instNbr: '0420', applCde: 'DD', acctNbr: '4200009002', nme: 'Helping Hands Neighbor Fund' };

// Sample volunteer shifts for the demo, keyed by charity EIN. Real roles live on each charity's site.
// dayOffset is relative to "today" (applied when the server reads it).
export const SAMPLE_SHIFTS = {
  '46-5014769': [
    { title: 'Warehouse Food Sort', dayOffset: 1, start: '09:00', hours: 3, spots: 30, taken: 18, familyFriendly: true, skills: ['Lifting', 'Teamwork'], desc: 'Sort and pack donated food for partner pantries.' },
    { title: 'Mobile Pantry Distribution', dayOffset: 6, start: '08:30', hours: 3, spots: 20, taken: 9, familyFriendly: true, skills: ['Customer service'], desc: 'Help neighbors pick up fresh produce and staples.' },
  ],
  '59-6002104': [{ title: 'Lunch Service', dayOffset: 2, start: '11:00', hours: 2, spots: 10, taken: 6, familyFriendly: false, skills: ['Food handling'], desc: 'Serve a hot midday meal in the downtown dining room.' }],
  '59-3229898': [{ title: 'Donation Center Shift', dayOffset: 4, start: '10:00', hours: 3, spots: 8, taken: 3, familyFriendly: false, skills: ['Organization'], desc: 'Sort clothing and hygiene donations for residents.' }],
  '59-2880071': [{ title: 'Saturday Build Crew', dayOffset: 8, start: '08:00', hours: 6, spots: 15, taken: 7, familyFriendly: false, skills: ['Tools', '16+'], desc: 'Frame, paint and finish homes alongside future homeowners.' }],
  '75-3002172': [{ title: 'Patient Welcome Desk', dayOffset: 5, start: '08:30', hours: 4, spots: 4, taken: 2, familyFriendly: false, skills: ['Bilingual a plus'], desc: 'Greet patients and help with intake paperwork.' }],
  '59-2625008': [{ title: 'Home-Cooked Dinner Team', dayOffset: 3, start: '16:30', hours: 3, spots: 8, taken: 4, familyFriendly: true, skills: ['Cooking'], desc: 'Cook and serve dinner for families staying at the House.' }],
  '59-2437003': [{ title: 'Client Intake Support', dayOffset: 7, start: '09:00', hours: 3, spots: 5, taken: 2, familyFriendly: false, skills: ['Patience', 'Computer basics'], desc: 'Help families prepare paperwork for emergency assistance.' }],
  '59-1814635': [{ title: 'Donation Drive Sorting', dayOffset: 10, start: '10:00', hours: 2, spots: 12, taken: 5, familyFriendly: false, skills: ['Organization'], desc: 'Sort essentials for families in shelter. Location shared after volunteer screening.' }],
  '59-0683256': [{ title: 'Mentor Info Session', dayOffset: 9, start: '18:00', hours: 1.5, spots: 25, taken: 11, familyFriendly: false, skills: ['21+'], desc: 'Learn how to become a Big and meet the match team.' }],
  '59-6167630': [{ title: 'Homework Help Hour', dayOffset: 2, start: '15:30', hours: 2, spots: 10, taken: 4, familyFriendly: false, skills: ['Math', 'Reading'], desc: 'Help club members with homework after school.' }],
  '27-1456179': [{ title: 'Senior Check-in Calls', dayOffset: 1, start: '13:00', hours: 1, spots: 20, taken: 7, familyFriendly: false, skills: ['Conversation'], desc: 'Friendly phone check-ins with older adults living alone.' }],
  '80-0962807': [{ title: 'Mock Interview Panel', dayOffset: 12, start: '17:30', hours: 2, spots: 6, taken: 2, familyFriendly: false, skills: ['Hiring experience'], desc: 'Coach veterans through practice interviews.' }],
  '59-0624410': [
    { title: 'Dog Walking & Socializing', dayOffset: 1, start: '08:00', hours: 2, spots: 12, taken: 7, familyFriendly: true, skills: ['Animals'], desc: 'Walk and socialize adoptable dogs.' },
    { title: 'Adoption Event Helper', dayOffset: 9, start: '11:00', hours: 4, spots: 10, taken: 3, familyFriendly: true, skills: ['Customer service'], desc: 'Help families meet their new companions.' },
  ],
  '01-0709158': [{ title: 'Pet Food Bank Packing', dayOffset: 4, start: '09:30', hours: 2, spots: 14, taken: 6, familyFriendly: true, skills: ['None needed'], desc: 'Pack pet food for families who need a hand feeding their pets.' }],
  '59-3611338': [{ title: 'River Cleanup', dayOffset: 6, start: '08:00', hours: 3, spots: 40, taken: 21, familyFriendly: true, skills: ['Outdoors'], desc: 'Pick up litter along the St. Johns River shoreline.' }],
  '47-2342111': [{ title: 'Creek Restoration Day', dayOffset: 13, start: '08:30', hours: 3, spots: 25, taken: 8, familyFriendly: true, skills: ['Outdoors', 'Tools'], desc: 'Plant natives and clear invasives along Hogans Creek.' }],
};

// Name pools for the synthetic community households.
export const FIRST_NAMES = ['Aaliyah', 'Andre', 'Angela', 'Brandon', 'Carmen', 'Chris', 'Danielle', 'Darnell', 'Elena', 'Eric', 'Fatima', 'Gabriel', 'Hannah', 'Isaiah', 'Jasmine', 'Javier', 'Keisha', 'Kevin', 'Latoya', 'Luis', 'Megan', 'Marcus', 'Nadia', 'Nathan', 'Olivia', 'Omar', 'Paige', 'Rashad', 'Rosa', 'Samuel', 'Tanya', 'Terrence', 'Uma', 'Victor', 'Whitney', 'Xavier', 'Yolanda', 'Zach', 'Bianca', 'Derek', 'Ivy', 'Malik', 'Noor', 'Trevor'];
export const LAST_NAMES = ['Adams', 'Baker', 'Brooks', 'Campbell', 'Carter', 'Cruz', 'Diaz', 'Edwards', 'Foster', 'Garcia', 'Green', 'Hall', 'Harris', 'Hughes', 'Jackson', 'Jenkins', 'Kim', 'Lee', 'Lewis', 'Martin', 'Mitchell', 'Morales', 'Nguyen', 'Owens', 'Patel', 'Perez', 'Price', 'Reed', 'Rivera', 'Robinson', 'Sanders', 'Scott', 'Simmons', 'Torres', 'Turner', 'Walker', 'Ward', 'Washington', 'Watson', 'Williams', 'Wright', 'Young'];

export const CAMPAIGNS = [
  { id: 'camp-harvest-match', sponsorPartnerId: 'harvest-table', title: 'Harvest Table matches food gifts 1:1', causes: ['food'], ratio: 1, capPoints: 5000, endsInDays: 9 },
  { id: 'camp-harbor-match', sponsorPartnerId: 'crescent-pharmacy', title: 'Crescent Pharmacy doubles health & family gifts', causes: ['health', 'families'], ratio: 1, capPoints: 3000, endsInDays: 16 },
];

export const COMMUNITY_GOAL = {
  title: 'Northeast Florida Giving Season',
  subtitle: 'Rewards donated by the Helping Hands community this season',
  targetDollars: 250000,
  baselineDollars: 183420,
  contributors: 4182,
};
