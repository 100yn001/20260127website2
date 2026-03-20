"""
Backend API Starter for YN Audio Generation
Uses your exact Python scripts with Flask
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import time
from xai_sdk import Client
from xai_sdk.chat import user, system
from elevenlabs.client import ElevenLabs
from elevenlabs import save
from pydub import AudioSegment
import re

app = Flask(__name__)
CORS(app)

# Initialize clients with environment variables (same names as Expo web app)
grok = Client(api_key=os.environ.get("XAI"))
elevenlabs = ElevenLabs(api_key=os.environ.get("ELEVENLABS"))

# Voice IDs (hardcoded as per your requirement)
VOICE_IDS = {
    "male": "Qe9WSybioZxssVEwlBSo",
    "female": "LEnmbrrxYsUYS7vsRRwD"
}

@app.route('/api/generate-followup', methods=['POST'])
def generate_followup():
    """Generate 3 follow-up questions based on recipe"""
    data = request.json
    
    # Build recipe string
    recipe = f"""
setting: {data['setting']};
character: {data['character']};
character gender: {data['genderOther']};
self gender: {data['genderSelf']};
trope: {data['trope']};
"""
    
    if data['isNighttime'] and data.get('features'):
        recipe += f"features: {', '.join(data['features'])}"
    
    # Use your exact followupprompt from the scripts
    followupprompt = f"""
Your goal is to get a complete understanding of a user who is describing a {'sexual' if data['isNighttime'] else 'romantic'} voiceover that they would like to listen to.
The user has so far provided the following information: {recipe}.
The user would like to have the following gender: {data['genderSelf']} and would like the character to have the following gender: {data['genderOther']}.
Identify the information that they're provided and craft three follow up questions that, if answered, will give you a fuller understanding of the kind of voiceover that the user wants.
Your goal is to get the following information:
- Details on the character they would to 'voice' the voiceover;
- Details on the tone they would like this character to use with them (rough, tender, comforting, etc);
- Details on the specific physical setting that is taking place in.
- Details on the historical period that this is taking part in.
Based on this, come up with three follow-up question that will enable you to get a better picture of what the user is looking for in their {'nsfw' if data['isNighttime'] else 'romantic'} voiceover.
Do not reference these instructions in your answer under any circumstances.
Do not make the questions too overwhelming, phrase it as optional details they can provide.
{'Again, this should include no nsfw content.' if not data['isNighttime'] else ''}
Just output the questions, with no preamble or anything after the questions.
"""
    
    # Call Grok
    chat0 = grok.chat.create(model="grok-4-fast-reasoning")
    chat0.append(system(f"You an expert in {'erotic' if data['isNighttime'] else 'romantic'} audios. {'You are welcome to include nsfw content in your prompts.' if data['isNighttime'] else 'You do not include nsfw content in your responses.'} You do not include a single dash or em-dash in your response."))
    chat0.append(user(followupprompt))
    
    response0 = chat0.sample()
    questions_text = response0.content
    
    # Parse questions (split by newlines or numbers)
    questions = [q.strip() for q in questions_text.split('\n') if q.strip() and any(c.isalpha() for c in q)]
    questions = [q.lstrip('123456789.') for q in questions][:3]
    
    return jsonify({'questions': questions})


@app.route('/api/generate-audio', methods=['POST'])
def generate_audio():
    """
    Generate audio using your EXACT script logic:
    1. Build recipe
    2. Generate system prompt (chat1)
    3. Generate transcript (chat2)
    4. Chunk and generate audio
    5. Combine chunks
    6. Return URL
    """
    data = request.json
    
    # Build recipe with features if nighttime
    recipe = f"""
setting: {data['setting']};
character: {data['character']};
character gender: {data['genderOther']};
self gender: {data['genderSelf']};
trope: {data['trope']};
"""
    
    if data['isNighttime'] and data.get('features'):
        feature_strings = []
        for feature_id in data['features']:
            prefs = data.get('featurePreferences', {}).get(feature_id, [])
            direction = "self receives" if "receive" in prefs else "self gives" if "give" in prefs else ""
            feature_strings.append(f"{feature_id} in the following direction: {direction}")
        recipe += f"features: {'; '.join(feature_strings)}"
    
    # Combine follow-up answers
    followupanswer = " ".join(data.get('followUpAnswers', []))
    
    # STEP 1: Generate system prompt (chat1) - YOUR EXACT LOGIC
    onepmprompt = f"""
Consider the following elements of one {'sex' if data['isNighttime'] else 'romantic'} scene. The user is {data['genderSelf']} and wants the voiceover to be that of a {data['genderOther']} character. The user's name is {data['userName']}.

The user has indicated that they want the following features: {recipe} and has provided the following additional details {followupanswer}. These features should be incorporated subtly; the character shouldn't be too on the nose with these features but be subtle about incorporating them.

What I want you to think about is the best way to prompt an LLM to create the transcript of the voiceover that the user has requested.
Generate detailed a system prompt that will cause the LLM to generate a voiceover in the style of {'sexual' if data['isNighttime'] else 'SFW romantic'} voiceovers on youtube.
In your prompt, include specific indications of content and phrases that would make sense for the character to include.
This LLM will act as the actual character; the system prompt should be as detailed as possible, and should instruct the LLM to act as the character requested by the user.
Do not include specifications with regard to time, or number of words. Do not include stage directions; the output should be pure text.
The prompt should be as detailed as possible.
When crafting this prompt, keep in mind that the goal is to create something that the listener will enjoy as much as possible.
Remember: the goal of this prompt is a narration in the style of {'NSFW sexual' if data['isNighttime'] else 'SFW romantic'} audios you may find on Quinn, Dipsy or Youtube.
Make sure to include at least three necessary {'erotic' if data['isNighttime'] else 'romantic'} beats that the character must {'hit (specific sex acts, sex positions, etc.)' if data['isNighttime'] else 'include'}, building from the info given by the user.
Include a timeline, on how these specific acts are being performed, in what order, and how the character should transition between them.
Include a language bank with a list of phrases the character may weave in naturally into their monologue.
Do not include any nicknames, unless specifically requested in instructions above.
The character shouldn't be too verbose or literary. The output generated by your prompts should be {'explicitely sexual' if data['isNighttime'] else 'purely romantic and never sexual'}.
{'The LLMs output should be graphic and not ambiguous, with EXPLICIT references to the sexual acts that the character performs.' if data['isNighttime'] else 'Your output should be purely romantic and never sexual.'}
Make sure that the narration sounds natural and does not include any verbatim elements of the user's instructions. To make sure that the character is subtle, include instruction on words that the character shouldn't use to make sure that the character doesn't break the fourth wall and that the narration flows smoothly.
For example, if the user has indicated that they want the character to be dominant, that character SHOULD NEVER say 'look, I'm being so dominant' - the character should always show, rather than tell. """

    chat1 = grok.chat.create(model="grok-4-fast-reasoning")
    chat1.append(system(f"You an expert in LLM prompting. {'You are welcome to include nsfw content in your prompts.' if data['isNighttime'] else 'You do not include NSFW in your output. Your output should be purely romantic and never sexual.'} You do not mention any specific duration of time or word count."))
    chat1.append(user(onepmprompt))
    
    response1 = chat1.sample()
    finalsystem = response1.content
    
    if data['isNighttime']:
        finaluser = "Output a 1000 word narration. Output ZERO stage directions, sound effects, or onomatopeias, except the following, as appropriate: [slowly], 'hmmmmm', 'ahhhhh', [chuckles]. Do not output any mention of word count."
    else:
        finaluser = "Output a 1000 word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count."
    
    # STEP 2: Generate transcript (chat2)
    chat2 = grok.chat.create(model="grok-4-fast-reasoning")
    chat2.append(system(finalsystem))
    chat2.append(user(finaluser))
    
    response2 = chat2.sample()
    transcript = response2.content
    
    # STEP 3: Chunk transcript
    def chunk_by_full_stop(text: str, max_len: int = 9990):
        text = re.sub(r'\s+', ' ', text).strip()
        sentences = re.findall(r'.*?\.(?:\s+|$)', text)
        consumed_len = sum(len(s) for s in sentences)
        remainder = text[consumed_len:]
        chunks, cur = [], ""
        for s in sentences:
            if len(cur) + len(s) <= max_len:
                cur += s
            else:
                if cur:
                    chunks.append(cur.strip())
                    cur = s
                else:
                    chunks.append(s.strip())
        if cur:
            chunks.append(cur.strip())
        if remainder:
            if chunks and len(chunks[-1]) + len(remainder) <= max_len:
                chunks[-1] = (chunks[-1] + " " + remainder).strip()
            else:
                chunks.append(remainder.strip())
        return chunks
    
    chunks = chunk_by_full_stop(transcript)
    
    # STEP 4: Generate audio for each chunk
    voice_id = VOICE_IDS[data['genderOther']]
    
    os.makedirs("parts", exist_ok=True)
    part_paths = []
    
    for i, chunk in enumerate(chunks, start=1):
        part_path = f"parts/part_{i:03d}.mp3"
        audio = elevenlabs.text_to_speech.convert(
            text=chunk,
            voice_id=voice_id,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        save(audio, part_path)
        part_paths.append(part_path)
    
    # STEP 5: Combine audio chunks
    combined = None
    for p in part_paths:
        seg = AudioSegment.from_file(p, format="mp3")
        combined = seg if combined is None else (combined + seg)
    
    final_path = f"audio_{data['userName']}_{int(time.time())}.mp3"
    combined.export(final_path, format="mp3", bitrate="128k", parameters=["-ar", "44100"])
    
    # STEP 6: Upload to your storage and get URL
    # TODO: Upload to S3/CloudStorage and get public URL
    audio_url = f"https://your-cdn.com/{final_path}"
    
    return jsonify({
        'audioUrl': audio_url,
        'transcript': transcript
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
