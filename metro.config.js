const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving shaka-player (web-only dep of react-native-track-player)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('shaka-player')) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
