# Firebase Setup Guide

This guide walks you through setting up Firebase for authentication and storage.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "yn-app")
4. Follow the setup wizard

## Step 2: Add Web App

1. In your Firebase project, click the **Web** icon (`</>`)
2. Register app with nickname "yn-web"
3. Copy the firebaseConfig object

## Step 3: Add Firebase Config to .env

Add these values to your `.env` file (get them from the firebaseConfig object):

```
FIREBASE_API_KEY=AIza...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=1234567890
FIREBASE_APP_ID=1:1234567890:web:abc123
```

## Step 4: Enable Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Click "Save"

## Step 5: Create Firestore Database

1. Go to **Firestore Database** → **Create database**
2. Select **Start in production mode** (we'll set rules next)
3. Choose a location (e.g., us-central)
4. Click "Enable"

### Firestore Rules

Go to **Rules** tab and paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own stories
    match /stories/{storyId} {
      allow read: if request.auth != null && 
                   resource.data.userId == request.auth.uid;
      allow write: if request.auth != null && 
                    request.resource.data.userId == request.auth.uid;
    }
    
    // Everyone can read pre-generated stories
    match /preGeneratedStories/{storyId} {
      allow read: if true;
      allow write: if false; // Only admins via Firebase Console
    }
  }
}
```

## Step 6: Set up Cloud Storage

1. Go to **Storage** → **Get started**
2. Select **Start in production mode**
3. Choose same location as Firestore
4. Click "Done"

### Storage Rules

Go to **Rules** tab and paste this:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can upload/read their own audio files
    match /audio/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Step 7: Firestore Collections Structure

### `stories` Collection
User-generated stories:
```json
{
  "id": "auto-generated",
  "userId": "firebase-auth-uid",
  "title": "Cozy Cabin Romance",
  "audioUrl": "https://storage.googleapis.com/...",
  "transcript": "Full transcript text...",
  "setting": "nighttime",
  "location": "cabin",
  "character": "mysterious stranger",
  "trope": "enemies to lovers",
  "isNighttime": false,
  "features": [],
  "createdAt": "2024-01-01T00:00:00Z",
  "duration": 300
}
```

### `preGeneratedStories` Collection
Admin-curated stories for all users:
```json
{
  "id": "auto-generated",
  "title": "Moonlit Confession",
  "description": "A romantic encounter under the stars",
  "audioUrl": "https://storage.googleapis.com/...",
  "transcript": "Full transcript...",
  "setting": "daytime",
  "character": "best friend",
  "trope": "friends to lovers",
  "isNighttime": false,
  "thumbnailUrl": "https://...",
  "duration": 420,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## Step 8: Test Firebase Connection

After adding environment variables to `.env`:

1. Stop your dev server (Ctrl+C)
2. Restart: `npm start -- --clear`
3. Try signing up with a test email

## Next Steps

- Update library screen to display user stories
- Add save functionality after audio generation
- Create admin panel to add pre-generated stories

## Troubleshooting

**"Firebase API key not found"**
- Make sure `.env` has all Firebase variables
- Restart dev server with `npm start -- --clear`

**"Permission denied" errors**
- Check Firestore/Storage rules are correctly set
- Verify user is authenticated before accessing data

**Can't sign up**
- Ensure Email/Password auth is enabled in Firebase Console
- Check browser console for detailed error messages
