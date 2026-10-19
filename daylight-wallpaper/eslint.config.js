const { FlatCompat } = require('@eslint/eslintrc');
module.exports = [
  { ignores: ['android/**', 'ios/**', 'node_modules/**'] },
  ...new FlatCompat({ baseDirectory: __dirname }).extends('@react-native'),
];
