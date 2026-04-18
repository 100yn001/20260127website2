import 'dotenv/config';

// Debug: Check if environment variables are loaded
console.log('📝 Environment check:', {
  XAI: process.env.XAI ? '✓ exists' : '✗ missing',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✓ exists' : '✗ missing',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓ exists' : '✗ missing',
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? '✓ exists' : '✗ missing',
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? '✓ exists' : '✗ missing',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'missing',
});

export default {
  expo: {
    name: "yn",
    slug: "yn",
    version: "1.0.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "yn",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.yn.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["audio"]
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
      name: "yn",
      description: "audio stories, crafted for you",
      backgroundColor: "#000000",
      themeColor: "#000000",
      bundler: "metro",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      [
        "expo-av",
        {
          microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone."
        }
      ]
    ],
    updates: {
      url: "https://u.expo.dev/bcc4ea76-879b-45d8-bcbf-345670f374fd"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      baseUrl: '/app',
    },
    // Add environment variables here
    extra: {
      eas: {
        projectId: "bcc4ea76-879b-45d8-bcbf-345670f374fd"
      },
      XAI: process.env.XAI,
      ELEVENLABS: process.env.ELEVENLABS,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    }
  }
};
