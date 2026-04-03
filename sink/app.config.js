import 'dotenv/config';

export default {
  expo: {
    name: "sink",
    slug: "sink",
    owner: "100yn001",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "sink",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.yn.sink",
      infoPlist: {
        UIBackgroundModes: ["audio"],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    updates: {
      url: "https://u.expo.dev/48870673-7265-4e87-8aba-54c5053a567f",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    plugins: [
      "expo-router",
      [
        "expo-av",
        {
          microphonePermission: false,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "48870673-7265-4e87-8aba-54c5053a567f",
      },
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    },
  },
};
