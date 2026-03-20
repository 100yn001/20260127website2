# Story Queue System Setup Guide

## Overview
The new story queue system allows users to submit stories for generation, which then process in the background. Users receive iOS notifications when stories are ready.

## Required Installations

Run these commands to install the necessary dependencies:

```bash
# Install expo-notifications for push notifications
npx expo install expo-notifications

# Install react-native-svg for circular progress indicators
npx expo install react-native-svg

# Install expo-blur for modal effects (optional, can remove if not needed)
npx expo install expo-blur
```

## iOS Notification Setup

### 1. Update app.json
Add notification configuration to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#030213",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#030213",
      "iosDisplayInForeground": true
    }
  }
}
```

### 2. Request Notification Permissions
The StoryQueueContext automatically handles this, but you can also manually request:

```typescript
import * as Notifications from 'expo-notifications';

// Request permissions
const { status } = await Notifications.requestPermissionsAsync();
if (status !== 'granted') {
  alert('Failed to get push token for notifications!');
}
```

### 3. Handle Notification Taps
Add this to your root _layout.tsx to handle when users tap notifications:

```typescript
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const { storyId, queueId } = response.notification.request.content.data;
    
    // Navigate to the story
    router.push({
      pathname: '/player',
      params: { storyId },
    });
  });

  return () => subscription.remove();
}, []);
```

## New Flow

### Old Flow (Removed):
1. Recipe → Followup → **Loading Screen** → Player
2. User waits on loading screen while story generates

### New Flow:
1. Recipe → Followup → **Modal** → Back to app
2. Story added to queue and generates in background
3. User can continue using app
4. **Notification sent** when story is ready
5. User taps "My Stories" tab to listen

## Features Implemented

### ✅ Story Queue Context
- **File**: `/contexts/StoryQueueContext.tsx`
- Manages queue of stories being generated
- Processes one story at a time
- Tracks progress (0-100%)
- Sends notifications when complete

### ✅ My Stories Tab
- **File**: `/app/(tabs)/mystories.tsx`
- Replaces "Bookmarks" in bottom navigation
- Shows all queued/generating/completed stories
- Circular progress bars for generating stories
- Tap to play when complete

### ✅ Story Submitted Modal
- **File**: `/components/StorySubmittedModal.tsx`
- Shows after answering followup questions
- Two options:
  - "Keep Creating" → Returns to recipe screen
  - "Add to Your Character Card" → Opens character quiz

### ✅ Character Quiz
- **File**: `/app/character-quiz.tsx`
- Repeats onboarding questions (doesn't save)
- Loops infinitely until user presses back
- Back button returns to previous screen

### ✅ Background Generation
- Stories generate while user continues using app
- Progress updates every 3 seconds
- No blocking UI - user can navigate freely

### ✅ Notifications
- Sent when story generation completes
- Includes story title and tap action
- Opens player when tapped

## Testing

### 1. Test Queue Submission
- Create a recipe
- Answer followup questions
- Tap "Let's hear it"
- Modal should appear
- Story should appear in "My Stories" with progress

### 2. Test Background Generation
- Submit a story
- Navigate away from "My Stories"
- Check back after a few minutes
- Story should show 100% complete

### 3. Test Notifications
- Submit a story
- Put app in background
- Wait for generation to complete
- Should receive notification
- Tap notification → should open player

### 4. Test Character Quiz
- Submit a story
- Choose "Add to your character card"
- Answer quiz questions
- Quiz should loop back to start
- Tap back button → should return to app

## Troubleshooting

### Notifications not working
- Check `app.json` configuration
- Request permissions in settings
- Test on physical device (simulator may not support notifications)

### Progress stuck at 0%
- Check Firebase Storage rules are set
- Check Firebase Authentication is working
- Check network connection

### Modal not appearing
- Check StoryQueueProvider is in _layout.tsx
- Check imports in followup.tsx
- Check React state updates

### Can't install dependencies
```bash
# Clear cache and reinstall
rm -rf node_modules
npm cache clean --force
npm install
npx expo install expo-notifications react-native-svg
```

## Architecture

```
User Flow:
┌─────────────┐
│   Recipe    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Followup   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ StorySubmittedModal │ ◄── "Your story will be ready in a few minutes"
└──────┬──────┬───────┘
       │      │
Keep   │      │ Build
Creating      Profile
       │      │
       ▼      ▼
┌─────────┐  ┌──────────────┐
│ Recipe  │  │ CharacterQuiz│
└─────────┘  └──────────────┘

Background:
┌──────────────────┐
│ StoryQueueContext│ ◄── Manages queue
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ generateAudio    │ ◄── Generates story
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Notification    │ ◄── Sends when ready
└──────────────────┘

User Views:
┌──────────────┐
│  My Stories  │ ◄── Shows queue with progress
└──────────────┘
```

## Next Steps

1. **Install dependencies** (see above)
2. **Update app.json** for notifications
3. **Test on physical device** (iOS simulator has limited notification support)
4. **Customize notification sounds/icons** (optional)
5. **Add error retry logic** (already implemented in mystories.tsx)

## Notes

- Loading screen (`/app/loading.tsx`) is still in the codebase but no longer used
- Can be safely deleted or kept for backward compatibility
- The queue processes one story at a time to avoid overwhelming the APIs
- Stories remain in queue until user manually removes them
