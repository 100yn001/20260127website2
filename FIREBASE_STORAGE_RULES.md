# Firebase Storage Security Rules

## Overview
Your app uses Firebase Storage to store generated audio files. Users can only access their own generated audio and shared static audio.

## Storage Structure
```
gs://yourname-7fc08.firebasestorage.app/
├── generated-audio/
│   ├── nighttime/
│   │   └── {userId}-{timestamp}.mp3
│   └── daytime/
│       └── {userId}-{timestamp}.mp3
└── static-audio/
    └── {storyId}.mp3
```

## Security Rules

Copy these rules to your Firebase Console under **Storage > Rules**, or deploy via `firebase deploy --only storage` (uses `storage.rules` in the repo root):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Allow authenticated users to read and write their own generated audio files
    // Filenames follow the pattern: {userId}-{timestamp}-chunk{index}.mp3
    match /generated-audio/{type}/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && filename.matches(request.auth.uid + '-.*');
    }

    // Allow all authenticated users to read static audio
    match /static-audio/{filename} {
      allow read: if request.auth != null;
      allow write: if false; // Only admins can upload via Firebase Console
    }

    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## How to Apply Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **yourname-7fc08**
3. Navigate to **Storage** in the left sidebar
4. Click on the **Rules** tab
5. Replace the existing rules with the rules above
6. Click **Publish**

## Testing

After applying the rules, test that:
- ✅ Users can upload audio to their own `generated-audio/{nighttime|daytime}/` folder
- ✅ Users can read their own audio files
- ✅ Users can read files from `static-audio/`
- ❌ Users cannot read other users' generated audio
- ❌ Users cannot write to `static-audio/`

## Firestore Security Rules

Also ensure your Firestore rules allow users to:
- Read/write their own stories in the `stories` collection
- Read/write their own user profile in the `users` collection
- Read static stories in the `staticStories` collection

Example Firestore rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User profiles
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // User's story queue (subcollection)
      match /queue/{queueId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    // User stories
    match /stories/{storyId} {
      allow read, write: if request.auth != null 
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null 
        && request.resource.data.userId == request.auth.uid;
    }
    
    // Static stories (available to all)
    match /staticStories/{storyId} {
      allow read: if request.auth != null;
      allow write: if false; // Admin only
    }
  }
}
```
