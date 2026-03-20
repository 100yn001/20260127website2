# Reset Onboarding

To see the onboarding quiz again, you need to clear AsyncStorage.

## Option 1: Using Expo Dev Menu
1. Shake your device or press `Cmd+D` (iOS) / `Cmd+M` (Android) to open the dev menu
2. Select "Clear AsyncStorage"
3. Reload the app

## Option 2: Using Code
Add this to your app temporarily and it will clear on next launch:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Add this in your index.tsx or _layout.tsx
AsyncStorage.clear();
```

## Option 3: Reinstall the app
Uninstall and reinstall the app to clear all data.
