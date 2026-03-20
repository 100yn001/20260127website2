const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      
      // Add modular headers for specific Firebase pods only (not globally)
      // This avoids the gRPC-Core modulemap conflict
      const modularHeadersConfig = `
# Firebase modular headers configuration
pod 'FirebaseCore', :modular_headers => true
pod 'FirebaseCoreInternal', :modular_headers => true
pod 'FirebaseAuth', :modular_headers => true
pod 'FirebaseFirestore', :modular_headers => true
pod 'FirebaseStorage', :modular_headers => true
pod 'GoogleUtilities', :modular_headers => true
`;

      // Insert before the first target block
      if (!podfileContent.includes("pod 'FirebaseCore', :modular_headers => true")) {
        podfileContent = podfileContent.replace(
          /(target\s+['"].*?['"]\s+do)/,
          modularHeadersConfig + '\n$1'
        );
        fs.writeFileSync(podfilePath, podfileContent);
      }
      
      return config;
    },
  ]);
};
