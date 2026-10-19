import vuetify from 'eslint-config-vuetify'

export default vuetify({
  ts: true,
}, {
  // The app targets ES2022; toSorted/toReversed require ES2023 or polyfills.
  rules: {
    'unicorn/no-array-sort': 'off',
    'unicorn/no-array-reverse': 'off',
  },
})
