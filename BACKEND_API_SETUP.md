# Backend API Setup for Audio Generation

## Required Dependencies

First, install the missing React Native packages:

```bash
npx expo install expo-av @react-native-community/slider
```

## Environment Variables

### Expo Environment (Already Set ✅)

You've already added these to your Expo web app:
```
ELEVENLABS=your_elevenlabs_api_key
XAI=your_grok_api_key
```

### Backend Environment

Your Python backend needs to access these same keys. You can:

**Option 1:** Pass them from Expo to backend in API requests (NOT RECOMMENDED for security)

**Option 2:** Set them as environment variables on your backend deployment:
```
ELEVENLABS=your_elevenlabs_api_key
XAI=your_grok_api_key
```

**Option 3:** Use the same values in your backend's environment

### Expo Client Environment

Add this to your Expo `.env` file for the API URL:
```
EXPO_PUBLIC_API_URL=https://your-backend-url.com
```

## Backend API Endpoints

You need to create a Python/Flask/FastAPI backend with these two endpoints:

### 1. Generate Follow-Up Questions

**Endpoint:** `POST /api/generate-followup`

**Request Body:**
```json
{
  "setting": "historical",
  "location": "beach",
  "character": "neighbour",
  "genderSelf": "female",
  "genderOther": "male",
  "trope": "enemies to lovers",
  "features": [],
  "isNighttime": false
}
```

**Response:**
```json
{
  "questions": [
    "Question 1 text here",
    "Question 2 text here",
    "Question 3 text here"
  ]
}
```

**Python Logic:**

```python
import os
from xai_sdk import Client
from elevenlabs.client import ElevenLabs

# Initialize clients with your environment variables
grok = Client(api_key=os.environ.get("XAI"))
elevenlabs = ElevenLabs(api_key=os.environ.get("ELEVENLABS"))

# Use the provided followupprompt from the scripts
# Call Grok API with system and user prompts
# Parse response to extract 3 questions
# Return as array
```

---

### 2. Generate Audio

**Endpoint:** `POST /api/generate-audio`

**Request Body:**
```json
{
  "userName": "julia",
  "setting": "historical",
  "location": "beach",  
  "character": "neighbour",
  "genderSelf": "female",
  "genderOther": "male",
  "trope": "enemies to lovers",
  "features": ["spanking", "blindfolding"],
  "featurePreferences": {
    "spanking": ["receive"],
    "blindfolding": ["receive", "give"]
  },
  "isNighttime": true,
  "followUpAnswers": [
    "Answer 1",
    "Answer 2",
    "Answer 3"
  ]
}
```

**Response:**
```json
{
  "audioUrl": "https://your-cdn.com/audio/story-abc123.mp3",
  "transcript": "The full transcript text..."
}
```

**Python Logic (EXACT STEPS FROM YOUR SCRIPTS):**

1. **Build Recipe String:**
   ```python
   recipe = f"""
   setting: {chosensetting};
   character: {chosenchar};
   character gender: {genderchar};
   self gender: {genderself};
   trope: {chosentrope};
   features: {feature1} in direction: {direction1}; {feature2}...
   """
   ```

2. **Generate System Prompt (chat1):**
   - Use `onepmprompt` exactly as in your script
   - Call Grok with reasoning model
   - Get system prompt for character

3. **Generate Transcript (chat2):**
   - Use generated system prompt
   - Add user prompt for 1000 words
   - Get transcript from Grok

4. **Generate Audio:**
   - Chunk transcript by full stops (MAX_CHARS = 9990)
   - For each chunk, call ElevenLabs TTS
   - Voice ID based on `genderOther`:
     - Male: `Qe9WSybioZxssVEwlBSo`
     - Female: `LEnmbrrxYsUYS7vsRRwD`
   - Use `eleven_multilingual_v2` model
   - Output format: `mp3_44100_128`

5. **Combine Audio Chunks:**
   - Use pydub to concatenate all MP3 parts
   - Export final audio
   - Upload to your CDN/storage
   - Return URL + transcript

---

## Voice ID Selection

```python
def get_voice_id(gender: str) -> str:
    return "Qe9WSybioZxssVEwlBSo" if gender == "male" else "LEnmbrrxYsUYS7vsRRwD"
```

## Daytime vs Nighttime Logic

**Daytime:**
- Use daytime prompts (SFW/romantic only)
- System prompt: "You do not include NSFW in your output"
- No features used in generation

**Nighttime:**
- Use nighttime prompts (NSFW content allowed)
- System prompt: "You are welcome to include nsfw content"
- Include features in recipe string
- Features incorporated subtly in transcript

## Error Handling

Your backend should handle:
- Grok API rate limits
- ElevenLabs API failures
- Audio chunk generation errors
- File storage errors

Return appropriate HTTP status codes and error messages.

## Testing

Test with curl:

```bash
# Generate follow-up
curl -X POST https://your-api.com/api/generate-followup \
  -H "Content-Type: application/json" \
  -d '{"setting":"modern","location":"office","character":"boss","genderSelf":"female","genderOther":"male","trope":"enemies to lovers","features":[],"isNighttime":false}'

# Generate audio  
curl -X POST https://your-api.com/api/generate-audio \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

## Next Steps

1. Create Python backend with Flask/FastAPI
2. Implement the two endpoints using your exact script logic
3. Deploy backend (Heroku, Railway, Render, etc.)
4. Update `EXPO_PUBLIC_API_URL` in your .env
5. Test the complete flow in your Expo app

The React Native app is ready and will work once these endpoints are live!
