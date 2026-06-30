from flask import Flask, render_template, request, jsonify
from groq import Groq
from dotenv import load_dotenv
import os

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
        "would with his creator."
    )
}

conversation_history = [SYSTEM_PROMPT]

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    user_input = request.json.get('message')
    if not user_input:
        return jsonify({'error': 'No message provided'}), 400

    # Append user input to conversation history
    conversation_history.append({
        "role": "user",
        "content": user_input
    })

    # Generate response using Groq API
    completion = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=conversation_history,
        temperature=0.6, # Control the randomness of the response
        max_tokens=300 # Limit the response to 300 tokens, keeps replies tight
    )

    bot_response = completion.choices[0].message.content

    #Append model response to conversation history
    conversation_history.append({
        "role": "assistant",
        "content": bot_response
    })

    return jsonify({
        'response': bot_response
    })
if __name__ == '__main__':
    app.run(debug=True)