# Cloud Functions Setup for Background Story Generation

This enables stories to generate even when the app is closed.

## Prerequisites

1. Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

## Setup Steps

### 1. Install function dependencies
```bash
cd functions
npm install
```

### 2. Set up API key secrets
```bash
# Set your xAI API key
firebase functions:secrets:set XAI_API_KEY

# Set your ElevenLabs API key  
firebase functions:secrets:set ELEVENLABS_API_KEY
```

### 3. Deploy the functions
```bash
firebase deploy --only functions
```

## How It Works

1. When user adds a story to queue, the app writes to Firestore at:
   `users/{userId}/queue/{queueId}`

2. The Cloud Function `generateStory` triggers automatically on document creation

3. The function:
   - Generates system prompt (Grok API)
   - Generates transcript (Grok API)
   - Generates audio (ElevenLabs API)
   - Uploads audio to Firebase Storage
   - Saves story metadata to Firestore
   - Sends push notification via FCM

4. User receives notification "your story is ready" even if app is closed

## Testing Locally

```bash
cd functions
npm run serve
```

## Monitoring

View function logs:
```bash
firebase functions:log
```

## Cost Estimates

- **Cloud Functions**: ~$0.0000025 per invocation + compute time
- **Firebase Storage**: ~$0.026 per GB stored
- **Firestore**: Free tier covers most usage
- **API costs**: xAI + ElevenLabs (your existing costs)

Estimated cost per story: ~$0.01-0.05 (mostly API costs)
