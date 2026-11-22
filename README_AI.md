# AI Server Setup

This project includes `ai_server.py`, a Flask-based image captioning app using Hugging Face `transformers`, served locally with Waitress. The Express app serves the web UI and starts the local AI service together.

To prepare the local AI environment once:

```bash
npm run setup:ai
```

Start the app:

```bash
npm start
```

Open the URL printed by the server (usually `http://localhost:3000`). The app's health check reports the AI as ready only when the configured OpenAI provider or local model service is available. The local model is downloaded on first run and requires internet access and disk space.

To run only the AI service for development, activate `.venv` and run `python ai_server.py`; it uses port 5001 by default. Set `AI_PORT` to use a different port.
