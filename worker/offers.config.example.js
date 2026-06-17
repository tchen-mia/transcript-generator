// REDACTED EXAMPLE of offers.config.js.
// The REAL file (offers.config.js) holds the actual codes + pricing, is gitignored,
// and is bundled into the Worker at deploy — it never lives in this public repo.
// Copy this to offers.config.js, fill in real values, then: wrangler deploy
export default {
  codes: {
    lowincome: 'CODE_A',
    military: 'CODE_B',
    siblings: 'CODE_C',
    single: 'CODE_D',
  },
  warnings: [
    'Discounts are NOT automatically applied.',
    'You must copy & paste this code at checkout for each student to enjoy the discount.',
  ],
  validity: 'Codes are valid for 30 days and cannot be combined with any other offers.',
  income: {
    base: { '48': 0, HI: 0, AK: 0 },
    per: { '48': 0, HI: 0, AK: 0 },
  },
  offers: {
    lowincome: {
      variants: {
        k8: { sites: [{ name: 'K-8 sites', plans: [{ name: 'Monthly subscription', regular: 0, discounted: 0, unit: 'per child' }] }] },
        '7-12': { sites: [{ name: 'MiaPrep site', plans: [{ name: 'Monthly subscription', regular: 0, discounted: 0, unit: 'per child' }] }] },
        both: { sites: [{ name: 'K-8', plans: [] }, { name: 'MiaPrep', plans: [] }] },
      },
    },
    military: { variants: { k8: { sites: [] }, '7-12': { sites: [] } } },
    siblings: {
      variants: {
        k8: { sites: [] },
        '7-12': { sites: [] },
        both: { sites: [], extraNoteTemplate: 'Or, you can use code {SINGLE} to get a Family Lifetime Subscription. This includes full access for up to 4 siblings.' },
      },
    },
    single: { variants: { k8: { sites: [] }, '7-12': { sites: [] } } },
  },
};
