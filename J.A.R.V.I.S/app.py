from flask import Flask, render_template, request, jsonify
from groq import Groq
from dotenv import load_dotenv
import os
import tempfile

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Initialize Groq client with API key from environment variable
client = Groq(api_key=os.getenv("groq_api_key"))

#Store the conversation history
SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are Jarvis, a refined and highly capable AI assistant in the style "
        "of Tony Stark's AI from Iron Man. Your tone is calm, articulate, and "
        "dry-witted — understated British butler energy, not a chatty assistant. "
        "You are courteous and respectful by default, never rude, dismissive, or "
        "sarcastic at the user's expense. A light, clever quip is welcome now and "
        "then, but it should never read as mocking or curt. Keep responses concise "
        "and to the point rather than over-explaining. "
        "If the user identifies themselves as Tony Stark, address them as 'sir' "
        "and adopt a noticeably more deferential, warm, and loyal tone, as Jarvis "
        "would with his creator. "
        "You may be given a 'Live context' system note containing the user's "
        "current date/time, location, and weather. Treat it as ground truth and "
        "use it naturally when relevant (e.g. if asked the time, the weather, or "
        "where they are) — don't mention that it was 'provided to you', just "
        "answer as if you simply know it."
    )
}

conversation_history = [SYSTEM_PROMPT]

# Index of the live-context system message within conversation_history, once inserted.
# Kept separate from SYSTEM_PROMPT so it can be refreshed each turn without growing history.
context_message_index = None


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/chat', methods=['POST'])
def chat():
    data = request.json or {}
    user_input = data.get('message')
    context = data.get('context') or {}

    if not user_input:
        return jsonify({'error': 'No message provided'}), 400

    global context_message_index

    # Build/refresh a live-context note (date/time, location, weather) if provided.
    context_lines = []
    if context.get('datetime'):
        context_lines.append(f"Current date/time: {context['datetime']}")
    if context.get('location'):
        context_lines.append(f"User's current location: {context['location']}")
    if context.get('weather'):
        context_lines.append(f"Current weather at user's location: {context['weather']}")

    if context_lines:
        context_msg = {
            "role": "system",
            "content": "Live context — " + "; ".join(context_lines) + "."
        }
        if context_message_index is not None:
            conversation_history[context_message_index] = context_msg
        else:
            conversation_history.insert(1, context_msg)
            context_message_index = 1

    # Append user input to conversation history
    conversation_history.append({
        "role": "user",
        "content": user_input
    })

    # Generate response using Groq API
    completion = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=conversation_history,
        temperature=0.6,  # Control the randomness of the response
        max_tokens=300  # Limit the response to 300 tokens, keeps replies tight
    )

    bot_response = completion.choices[0].message.content

    # Append model response to conversation history
    conversation_history.append({
        "role": "assistant",
        "content": bot_response
    })

    return jsonify({
        'response': bot_response
    })


@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Fallback speech-to-text for browsers without native SpeechRecognition
    (e.g. Firefox, older Safari). Receives a recorded audio blob from the
    push-to-talk mic button and transcribes it with Groq's Whisper model.
    """
    audio_file = request.files.get('audio')
    if not audio_file:
        return jsonify({'error': 'No audio provided'}), 400

    try:
        # Groq's SDK needs a real file path/handle, so stage the upload to disk.
        suffix = os.path.splitext(audio_file.filename or 'audio.webm')[1] or '.webm'
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            audio_file.save(tmp.name)
            tmp_path = tmp.name

        with open(tmp_path, 'rb') as f:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(tmp_path), f.read()),
                model="whisper-large-v3-turbo",
                response_format="text"
            )

        os.remove(tmp_path)

        # response_format="text" returns a plain string from the SDK
        text = transcription if isinstance(transcription, str) else getattr(transcription, 'text', '')

        return jsonify({'text': text.strip()})

    except Exception as e:
        return jsonify({'error': f'Transcription failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True)
