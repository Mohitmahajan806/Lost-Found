// =====================================
// AI Vision Robot Backend
// server.js
// =====================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const net = require("net");
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

const DEFAULT_AI_PORTS = [
    5001,
    5002,
    5003,
    5004,
    5005,
    5006,
    5007
];

const REQUEST_LIMIT = "50mb";

// =====================================
// Port configuration
// =====================================

const ENV_PORT = Number(process.env.PORT);
const ENV_AI_PORT = Number(process.env.AI_PORT);

const AI_PORT =
    Number.isInteger(ENV_AI_PORT) && ENV_AI_PORT > 0
        ? ENV_AI_PORT
        : DEFAULT_AI_PORTS[0];

const LOCAL_AI_URL =
    `http://127.0.0.1:${AI_PORT}/analyze`;

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

// =====================================
// Root endpoint
// =====================================

app.get("/", (req, res) => {
    res.json({
        name: "AI Vision Robot Backend",
        status: "running",

        endpoints: {
            health: "GET /health",
            analyze: "POST /analyze"
        }
    });
});

// =====================================
// Health endpoint
// =====================================

app.get("/health", (req, res) => {
    res.json({
        status: "ok",

        mode: hasValidOpenAIKey()
            ? "openai"
            : "local-model",

        openaiConfigured:
            hasValidOpenAIKey(),

        serverPort:
            req.app.get("port"),

        localAI:
            LOCAL_AI_URL
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

                                        text:
                                            "You are an objective image analyzer. Only describe what is visible in the image. " +
                                            "Do not invent facts or imply unseen context. Provide two outputs in valid JSON only: \n" +
                                            "1) `caption_short`: one-sentence summary (8-15 words).\n" +
                                            "2) `caption_long`: a 2-3 sentence detailed description.\n" +
                                            "3) `tags`: list of lowercase keywords.\n" +
                                            "4) `objects`: list of {type,count,confidence}.\n" +
                                            "5) `entities`: list of {type,name,count,confidence}.\n" +
                                            "6) `colors`: dominant colors list.\n" +
                                            "7) `actions`: verbs if visible.\n+                                        "8) `location_clues`: e.g., 'indoor','street','kitchen', or visible sign text.\n" +
                                            "9) `dimensions`: {width,height} if you can infer.\n+                                        "10) `safety_notes`: hazards if visible.\n+                                        "11) `confidence`: 0-1 overall.\n+                                        "12) `notes`: brief uncertainty notes.\n+                                        "Return ONLY a single JSON object matching this schema; do not add any extra text."
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
            `Using local AI: ${LOCAL_AI_URL}`
        );

        const controller =
            new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 30000);

        try {
            const localResponse =
                await fetch(
                    LOCAL_AI_URL,
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
                    `Local AI returned HTTP ${localResponse.status}: ${errorText}`
                );

                // Fall through to mock response below
            } else {
                const localData =
                    await localResponse.json();

                return res.json({
                    success: true,

                    mode: "local-model",

                    description:
                        localData.description ||
                        "The local AI did not return a description."
                });
            }
        } catch (error) {
            clearTimeout(timeout);

            console.warn(
                "Local AI fetch failed:",
                error && error.message
            );

            // Instead of failing, return a lightweight mock description
            return res.json({
                success: true,
                mode: "mock",
                description:
                    "AI server unavailable — returning mock description: image received."
            });
        }
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
