// Metro does not treat .sqlite as an asset by default, so the bundled RxNorm
// database would not be packaged into the APK without this. It fails at runtime
// rather than at build time, which makes it an easy hour to lose.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('sqlite');

module.exports = config;
