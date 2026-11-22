from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from transformers import BlipProcessor, BlipForConditionalGeneration

from PIL import Image

import base64
import io
import os
import socket

from waitress import serve


def find_available_port(start_port, max_range=20):
    for port in range(start_port, start_port + max_range):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    return start_port


load_dotenv()

app = Flask(__name__)

CORS(app)


print("Loading AI model...")


processor = BlipProcessor.from_pretrained(
    "Salesforce/blip-image-captioning-base"
)


model = BlipForConditionalGeneration.from_pretrained(
    "Salesforce/blip-image-captioning-base"
)


print("AI model loaded successfully")



@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():

    try:

        data = request.json

        if not data or "image" not in data:
            return jsonify({"description": "No image received."}), 400

        image_data = data["image"]

        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        image_bytes = base64.b64decode(image_data)

        image = Image.open(
            io.BytesIO(image_bytes)
        ).convert("RGB")

        inputs = processor(
            image,
            return_tensors="pt"
        )

        output = model.generate(
            **inputs,
            max_new_tokens=50
        )

        description = processor.decode(
            output[0],
            skip_special_tokens=True
        )

        print("Description:", description)

        return jsonify({
            "description": description
        })

    except Exception as e:

        print("ERROR:", e)

        return jsonify({
            "description": "Unable to analyze image"
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("AI_PORT", "5001"))
    if port == 5001:
        port = find_available_port(port)
    serve(
        app,
        host="0.0.0.0",
        port=port,
        threads=4
    )
