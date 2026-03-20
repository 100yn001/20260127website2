#!/bin/bash

echo "Installing audio generation dependencies..."
echo ""

# Install Expo audio and slider packages
npx expo install expo-av @react-native-community/slider

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "Next steps:"
echo "1. Create your Python backend with the 2 API endpoints"
echo "2. Deploy your backend and get the URL"
echo "3. Create .env file with: EXPO_PUBLIC_API_URL=your-backend-url"
echo "4. Set XAI and ELEVENLABS environment variables on your backend"
echo "   (You already have them in Expo web app)"
echo "5. Run: npm run ios"
echo ""
echo "See BACKEND_API_SETUP.md for backend implementation details"
echo "See AUDIO_GENERATION_COMPLETE.md for complete overview"
