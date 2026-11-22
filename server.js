// =====================================
// AI Vision Robot Backend
// server.js
// =====================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const app = express();

// =====================================
// Configuration
// =====================================

const DEFAULT_PORTS = [
    3000,
    3001,
    3002,
    3003,
    3004,
    3005,
    3006,
    3007,
    3008,
    3009
];

const DEFAULT_AI_PORTS = Array.from(
    { length: 20 },
    (_, index) => 5001 + index
);

const REQUEST_LIMIT = "50mb";

// =====================================
// Port configuration
// =====================================

const ENV_PORT = Number(process.env.PORT);
const ENV_AI_PORT = Number(process.env.AI_PORT);

const AI_PORT_CANDIDATES = (() => {
    const preferred =
        Number.isInteger(ENV_AI_PORT) && ENV_AI_PORT > 0
            ? [ENV_AI_PORT]
            : [];

    const fallback = DEFAULT_AI_PORTS.filter(
        (port) => !preferred.includes(port)
    );

    return [...preferred, ...fallback];
})();

const LOCAL_AI_URLS =
    AI_PORT_CANDIDATES.map(
        (port) => `http://127.0.0.1:${port}/analyze`
    );

const LOCAL_AI_HEALTH_URLS =
    AI_PORT_CANDIDATES.map(
        (port) => `http://127.0.0.1:${port}/health`
    );

const LOCAL_AI_URL = LOCAL_AI_URLS[0] || "http://127.0.0.1:5002/analyze";
const LOCAL_AI_HEALTH_TIMEOUT_MS = 1000;

// =====================================
// Check whether a port is available
// =====================================

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", () => {
            resolve(false);
        });

        server.once("listening", () => {
            server.close(() => {
                resolve(true);
            });
        });

        server.listen(port, "0.0.0.0");
    });
}

// =====================================
// Find an available port
// =====================================

async function findAvailablePort(ports) {
    for (const port of ports) {
        const available = await isPortAvailable(port);

        if (available) {
            return port;
        }
    }

    return null;
}

// =====================================
// OpenAI configuration
// =====================================

function hasValidOpenAIKey() {
    const key = process.env.OPENAI_API_KEY;

    return (
        typeof key === "string" &&
        key.trim().length > 0 &&
        key.trim() !== "your_openai_api_key_here"
    );
}

const openai = hasValidOpenAIKey()
    ? new OpenAI({
          apiKey: process.env.OPENAI_API_KEY.trim()
      })
    : null;

// =====================================
// Express middleware
// =====================================

app.use(
    cors({
        origin: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type"]
    })
);

app.use(
    express.json({
        limit: REQUEST_LIMIT
    })
);

// Initialize database and routes for captures
const dbService = require('./services/db');
const db = dbService.init();

// Ensure captures directory exists
const fs = require('fs');
const capturesDir = path.join(__dirname, 'captures');
if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });

// Mount captures routes
try {
    require('./routes/captures')(app, db);
} catch (e) {
    console.error('Failed to mount captures routes', e);
}

app.get("/script.js", (req, res) => {
    res.sendFile(path.join(__dirname, "script.js"));
});

app.get("/style.css", (req, res) => {
    res.sendFile(path.join(__dirname, "style.css"));
});

async function isLocalAiAvailable() {
    const healthChecks = await Promise.all(
        LOCAL_AI_HEALTH_URLS.map(async (url) => {
            const controller = new AbortController();
            const timeout = setTimeout(
                () => controller.abort(),
                LOCAL_AI_HEALTH_TIMEOUT_MS
            );

            try {
                const response = await fetch(url, {
                    signal: controller.signal
                });
                return response.ok;
            } catch {
                return false;
            } finally {
                clearTimeout(timeout);
            }
        })
    );

    return healthChecks.some(Boolean);
}

// =====================================
// Root endpoint
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================
// Health endpoint
// =====================================

app.get("/health", async (req, res) => {
    const openaiConfigured = hasValidOpenAIKey();
    const localAiAvailable = openaiConfigured
        ? false
        : await isLocalAiAvailable();

    res.json({
        status: "ok",

        mode: openaiConfigured
            ? "openai"
            : "local-model",

        openaiConfigured,

        aiAvailable: openaiConfigured || localAiAvailable,

        serverPort:
            req.app.get("port"),

        localAI: LOCAL_AI_URLS
    });
});

// =====================================
// Validate camera image
// =====================================

function isValidImage(image) {
    if (typeof image !== "string") {
        return false;
    }

    if (image.trim().length < 100) {
        return false;
    }

    // Browser camera image
    // Example:
    // data:image/jpeg;base64,...
    if (image.startsWith("data:image/")) {
        return true;
    }

    // Remote HTTPS image
    if (image.startsWith("https://")) {
        return true;
    }

    return false;
}

let localAiProcess = null;

function startLocalAiServer() {
    if (hasValidOpenAIKey()) {
        return;
    }

    const pythonExecutable =
        process.env.PYTHON_EXECUTABLE ||
        path.join(__dirname, ".venv", "bin", "python");

    if (!fs.existsSync(pythonExecutable)) {
        console.error(
            `Local AI server was not started: ${pythonExecutable} was not found. Run "npm run setup:ai" first.`
        );
        return;
    }

    localAiProcess = spawn(
        pythonExecutable,
        [path.join(__dirname, "ai_server.py")],
        {
            cwd: __dirname,
            env: process.env,
            stdio: "inherit"
        }
    );

    localAiProcess.once("error", (error) => {
        console.error("Failed to start the local AI server:", error);
    });

    localAiProcess.once("exit", (code, signal) => {
        if (code !== 0 && code !== null) {
            console.error(`Local AI server exited with code ${code}.`);
        } else if (signal) {
            console.error(`Local AI server exited after signal ${signal}.`);
        }
        localAiProcess = null;
    });
}

process.once("exit", () => {
    if (localAiProcess && !localAiProcess.killed) {
        localAiProcess.kill();
    }
});

// =====================================
// AI IMAGE ANALYSIS
// =====================================

app.post("/analyze", async (req, res) => {
    try {
        const image = req.body?.image;

        // ---------------------------------
        // Check image
        // ---------------------------------

        if (!image) {
            return res.status(400).json({
                success: false,
                description:
                    "No camera image was received."
            });
        }

        if (!isValidImage(image)) {
            return res.status(400).json({
                success: false,
                description:
                    "Invalid image format. Expected a camera image data URL."
            });
        }

        console.log(
            `Camera image received: ${Math.round(
                image.length / 1024
            )} KB`
        );

        // =================================
        // OPENAI MODE
        // =================================

        if (hasValidOpenAIKey() && openai) {
            console.log(
                "Analyzing image with OpenAI..."
            );

            const response =
                await openai.responses.create({
                    model: "gpt-4.1-mini",

                    input: [
                        {
                            role: "user",

                            content: [
                                {
                                    type: "input_text",
                                    text: `You are an objective image analyzer. Only describe what is visible in the image. Do not invent facts or imply unseen context. Return ONLY a single valid JSON object with the following fields: "image_title", "caption_short", "caption_long", "description", "tags", "objects", "entities", "colors", "actions", "location_clues", "text_detected", "safety_notes", "dimensions", "confidence", "notes".\n\nRequirements:\n- "image_title": 5-12 words descriptive title of the main subject.\n- "caption_short": one concise sentence (8-15 words).\n- "caption_long": 2-4 factual sentences.\n- "description": professional comprehensive visual description.\n- "tags": array of lowercase keywords.\n- "objects": array of {type,count,confidence}.\n- "entities": array of {type,name,count,confidence} or empty.\n- "colors": array of dominant colors.\n- "actions": array of visible verbs.\n- "location_clues": array like 'indoor','street','kitchen', or readable sign text.\n- "text_detected": array of strings with readable text; empty if none.\n- "safety_notes": visible hazards only.\n- "dimensions": {"width": NUMBER, "height": NUMBER} if you can infer; otherwise use nulls.\n- "confidence": number between 0 and 1.\n- "notes": short uncertainty notes or empty string.\n\nOnly include information that is clearly visible. Use "unknown" where identification is not possible. Do not include any explanatory text or markdown; output pure JSON.`
                                },

                                {
                                    type: "input_image",
                                    image_url: image
                                }
                            ]
                        }
                    ]
                });

                const rawOutput = response.output_text?.trim() || "";

                let parsed = null;
                let finalDescription = rawOutput;

                try {
                    parsed = JSON.parse(rawOutput);

                    // Prefer caption_long, fallback to caption_short
                    finalDescription = parsed.caption_long || parsed.caption_short || rawOutput;
                } catch (e) {
                    // Could not parse JSON — keep raw text as description
                    parsed = null;
                    finalDescription = rawOutput || "No description was returned.";
                }

                const resultPayload = {
                    success: true,
                    mode: "openai",
                    description: finalDescription
                };

                if (parsed) {
                    resultPayload.structured = parsed;
                }

                return res.json(resultPayload);
        }

        // =================================
        // LOCAL AI MODE
        // =================================

        console.log(
            `Using local AI endpoints: ${LOCAL_AI_URLS.join(", ")}`
        );

        let localData = null;
        let localError = null;

        for (const localAiUrl of LOCAL_AI_URLS) {
            const controller =
                new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, 30000);

            try {
                const localResponse =
                    await fetch(
                        localAiUrl,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                image
                            }),

                            signal:
                                controller.signal
                        }
                    );

                clearTimeout(timeout);

                if (!localResponse.ok) {
                    const errorText =
                        await localResponse.text();

                    console.warn(
                        `Local AI at ${localAiUrl} returned HTTP ${localResponse.status}: ${errorText}`
                    );

                    localError = new Error(`HTTP ${localResponse.status}`);
                    continue;
                }

                localData = await localResponse.json();
                return res.json({
                    success: true,

                    mode: "local-model",

                    description:
                        localData.description ||
                        "The local AI did not return a description."
                });
            } catch (error) {
                clearTimeout(timeout);

                console.warn(
                    `Local AI fetch failed for ${localAiUrl}:`,
                    error && error.message
                );

                localError = error;
            }
        }

        console.warn(
            "All local AI endpoints failed; returning mock description.",
            localError && localError.message
        );

        return res.json({
            success: true,
            mode: "mock",
            description:
                "AI server unavailable — returning mock description: image received."
        });
    } catch (error) {
        console.error("");
        console.error(
            "================================="
        );
        console.error(
            "AI ANALYSIS ERROR"
        );
        console.error(
            "================================="
        );
        console.error(error);
        console.error("");

        return res.status(500).json({
            success: false,

            description:
                "Unable to analyze the camera image.",

            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
        });
    }
});

// =====================================
// Start server
// =====================================

async function startServer() {
    startLocalAiServer();

    let port = null;

    // ---------------------------------
    // Try PORT from .env first
    // ---------------------------------

    if (
        Number.isInteger(ENV_PORT) &&
        ENV_PORT > 0
    ) {
        const available =
            await isPortAvailable(ENV_PORT);

        if (available) {
            port = ENV_PORT;
        }
    }

    // ---------------------------------
    // Otherwise find an available port
    // ---------------------------------

    if (!port) {
        port =
            await findAvailablePort(
                DEFAULT_PORTS
            );
    }

    // ---------------------------------
    // No port available
    // ---------------------------------

    if (!port) {
        console.error(
            "No available server port was found."
        );

        process.exit(1);
    }

    // ---------------------------------
    // Start Express
    // ---------------------------------

    const server =
        app.listen(
            port,
            "0.0.0.0",
            () => {
                app.set(
                    "port",
                    port
                );

                console.log("");
                console.log(
                    "================================="
                );
                console.log(
                    "      AI VISION ROBOT SERVER"
                );
                console.log(
                    "================================="
                );

                console.log(
                    `Server:    http://localhost:${port}`
                );

                console.log(
                    `Mode:      ${
                        hasValidOpenAIKey()
                            ? "OpenAI Vision"
                            : "Local AI"
                    }`
                );

                console.log(
                    `AI server: ${LOCAL_AI_URL}`
                );

                console.log(
                    `Health:    http://localhost:${port}/health`
                );

                console.log(
                    "================================="
                );

                console.log("");
            }
        );

    // ---------------------------------
    // Server error
    // ---------------------------------

    server.on(
        "error",
        (error) => {
            console.error(
                "Server failed to start:"
            );

            console.error(error);

            process.exit(1);
        }
    );
}

// =====================================
// Start application
// =====================================

startServer();
