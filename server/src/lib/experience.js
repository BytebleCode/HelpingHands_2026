// How the site adapts to a member's benefit tier: lower-income households see a savings-first
// experience (offers, boosts, cash-out); higher-income households see a giving-first one
// (Neighbor Funds, matches, charities), with offers moved down the page.
export const EXPERIENCES = {
  save: {
    key: 'save', label: 'Savings first',
    summary: 'Leads with boosted essentials offers and cash-out. Giving is framed around small gifts.',
    homeLead: 'Boosted offers for essentials', pointsUse: 'Cash out or keep for essentials',
    nav: ['home', 'rewards', 'give', 'account'],
  },
  balance: {
    key: 'balance', label: 'Save & give',
    summary: 'Offers first, with Neighbor Funds and matches close behind.',
    homeLead: 'Offers, then ways to give', pointsUse: 'Split between saving and giving',
    nav: ['home', 'rewards', 'give', 'account'],
  },
  give: {
    key: 'give', label: 'Giving first',
    summary: 'Leads with neighborhoods that need help most, partner matches and charities. Offers move down the page.',
    homeLead: 'Neighbor Funds and matched giving', pointsUse: 'Give to neighbors and charities',
    nav: ['home', 'give', 'rewards', 'account'],
  },
};

export function experienceFor(tier) {
  if (tier.key === 'cornerstone' || tier.key === 'foundation') return EXPERIENCES.save;
  if (tier.key === 'keystone') return EXPERIENCES.balance;
  return EXPERIENCES.give;
}
