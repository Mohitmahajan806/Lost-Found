# AI Server Setup

This project includes `ai_server.py`, a small Flask-based image captioning server using Hugging Face `transformers`.

To prepare and run locally:

1. Create and activate the virtual environment and install dependencies:

```bash
./setup_ai.sh
```

2. Start the AI server (the script uses port 5001 by default):

```bash
source .venv/bin/activate
python ai_server.py
```

3. Open the web UI (`index.html`) and use the `Describe Image` button. The frontend calls `http://localhost:5001/analyze` first.

Notes:
- The `transformers` model will be downloaded on first run and requires internet and disk space.
- If you prefer a different port, set `AI_PORT` env var before running, e.g. `AI_PORT=3000 python ai_server.py`.
