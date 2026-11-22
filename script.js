// =====================================
// AI VISION ROBOT
// script.js
// =====================================

// HTML ELEMENTS
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const capturedImage = document.getElementById("capturedImage");
const startCameraBtn = document.getElementById("startCameraBtn");
const connectBtn = document.getElementById("connectBtn");
const captureBtn = document.getElementById("captureBtn");
const describeBtn = document.getElementById("describeBtn");
const description = document.getElementById("description");
const historyList = document.getElementById("historyList");
const statusText = document.getElementById("statusText");
const statusCircle = document.getElementById("statusCircle");
const loading = document.getElementById("loading");
const resultImage = document.getElementById("resultImage");
const resultTitle = document.getElementById("resultTitle");
const resultMeta = document.getElementById("resultMeta");

let imageBase64 = "";
let port = null;
let cameraStream = null;

// =====================================
// CAMERA FUNCTION
// =====================================
async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("This browser does not support camera access.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        cameraStream = stream;
        if (video) {
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            await video.play().catch(() => {});
        }

        statusText.innerHTML = "Camera connected";
        statusCircle.style.background = "lime";
    } catch (error) {
        console.error(error);
        alert("Camera access failed. Check permission and allow webcam access.");
    }
}

// =====================================
// CAPTURE IMAGE
// =====================================
function showCapturedResult(imageSrc, title = "Captured Image") {
    if (resultImage) {
        resultImage.src = imageSrc;
    }

    if (resultTitle) {
        resultTitle.textContent = title;
    }

    if (resultMeta) {
        resultMeta.textContent = "Captured image ready for AI analysis.";
    }
}

async function uploadCapture(imageData) {
    try {
        if (!imageData || !imageData.startsWith('data:image/')) {
            throw new Error('No valid captured image data');
        }

        loading.style.display = "block";
        statusText.innerHTML = "Uploading capture...";

        const res = await fetch('/captures-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });

        const json = await res.json();
        loading.style.display = "none";

        if (!json || !json.success) {
            statusText.innerHTML = "Upload failed";
            addHistory('Upload failed');
            return { success: false, error: json?.description || 'Upload failed' };
        }

        statusText.innerHTML = "Capture uploaded";
        addHistory('Capture uploaded');
        fetchGallery();
        return { success: true, capture: json.capture };
    } catch (e) {
        loading.style.display = "none";
        console.error(e);
        statusText.innerHTML = "Upload error";
        addHistory('Upload error');
        return { success: false, error: e.message || 'Upload error' };
    }
}

async function captureImage() {
    if (!video || !video.srcObject) {
        alert("Start camera first");
        return;
    }

    try {
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        imageBase64 = canvas.toDataURL("image/jpeg");

        capturedImage.src = imageBase64;
        showCapturedResult(imageBase64, "Captured Image");
        statusText.innerHTML = "Image Captured";
        addHistory("Image captured");

        const uploadResult = await uploadCapture(imageBase64);
        if (uploadResult.success) {
            await describeImage(imageBase64);
        }
    } catch (error) {
        console.error('Capture failed', error);
        statusText.innerHTML = "Upload error";
    }
}

// Gallery + Search
const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');

async function fetchGallery() {
    try {
        const res = await fetch('/captures-api');
        const json = await res.json();
        if (!json.success) return;
        renderGallery(json.captures);
    } catch (e) {
        console.error('Failed to fetch gallery', e);
    }
}

function renderGallery(items) {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';
    if (!items || items.length === 0) {
        galleryGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#ddd;">No captures yet</div>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'galleryCard';
        div.style.cursor = 'pointer';
        div.style.border = '1px solid rgba(255,255,255,.08)';
        div.style.borderRadius = '12px';
        div.style.overflow = 'hidden';
        div.style.background = 'rgba(255,255,255,.02)';

        const imageEl = document.createElement('img');
        const imageUrl = item.image_path ? item.image_path.replace(/^\//, '/') : '/' + item.image_path;
        imageEl.src = imageUrl;
        imageEl.style.width = '100%';
        imageEl.style.height = '160px';
        imageEl.style.objectFit = 'cover';
        imageEl.style.display = 'block';
        imageEl.alt = item.name || 'Capture image';

        const infoBox = document.createElement('div');
        infoBox.style.padding = '10px';
        infoBox.style.display = 'flex';
        infoBox.style.flexDirection = 'column';
        infoBox.style.gap = '8px';

        const timeText = document.createElement('div');
        timeText.textContent = new Date(item.timestamp).toLocaleString();
        timeText.style.color = '#cfcfcf';
        timeText.style.fontSize = '12px';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = item.name || item.caption_short || 'Untitled capture';
        nameInput.placeholder = 'Image name';
        nameInput.style.width = '100%';
        nameInput.style.boxSizing = 'border-box';
        nameInput.style.padding = '8px 10px';
        nameInput.style.borderRadius = '8px';
        nameInput.style.border = '1px solid rgba(255,255,255,.12)';
        nameInput.style.background = '#0f172a';
        nameInput.style.color = '#fff';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.style.flex = '1';
        saveBtn.style.padding = '8px 10px';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '8px';
        saveBtn.style.background = '#4f46e5';
        saveBtn.style.color = '#fff';
        saveBtn.style.cursor = 'pointer';
        saveBtn.onclick = async (event) => {
            event.stopPropagation();
            const newName = nameInput.value.trim();
            if (!newName) {
                alert('Please enter a name before saving.');
                return;
            }
            const result = await saveCaptureName(item.id, newName);
            if (result.success) {
                item.name = newName;
                nameInput.value = newName;
                statusText.innerHTML = 'Image name saved';
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.flex = '1';
        deleteBtn.style.padding = '8px 10px';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '8px';
        deleteBtn.style.background = '#ef4444';
        deleteBtn.style.color = '#fff';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.onclick = async (event) => {
            event.stopPropagation();
            const ok = confirm('Delete this saved image?');
            if (!ok) return;
            const result = await deleteCapture(item.id);
            if (result.success) {
                fetchGallery();
            }
        };

        actions.appendChild(saveBtn);
        actions.appendChild(deleteBtn);
        infoBox.appendChild(timeText);
        infoBox.appendChild(nameInput);
        infoBox.appendChild(actions);

        div.appendChild(imageEl);
        div.appendChild(infoBox);
        div.onclick = (event) => {
            if (event.target === nameInput || event.target === saveBtn || event.target === deleteBtn) return;
            openDetail(item.id);
        };

        galleryGrid.appendChild(div);
    });
}

async function openDetail(id) {
    try {
        const res = await fetch(`/captures-api/${id}`);
        const json = await res.json();
        if (!json.success) return;
        const cap = json.capture;
        const imageUrl = '/' + cap.image_path.replace(/^\//, '');
        capturedImage.src = imageUrl;
        showCapturedResult(imageUrl, cap.caption_short || 'Captured Image');
        description.innerHTML = cap.caption_long || cap.caption_short || cap.description || 'No description';
        if (resultMeta) {
            resultMeta.innerHTML = `<strong>Saved capture:</strong> ${new Date(cap.timestamp).toLocaleString()}`;
        }
    } catch (e) {
        console.error(e);
    }
}

function debounce(fn, wait = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

async function saveCaptureName(id, name) {
    try {
        const res = await fetch(`/captures-api/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const json = await res.json();
        if (!json || !json.success) {
            return { success: false, error: json?.description || 'Unable to save name' };
        }

        return { success: true, name: json.name };
    } catch (e) {
        console.error(e);
        return { success: false, error: 'Unable to save name' };
    }
}

async function deleteCapture(id) {
    try {
        const res = await fetch(`/captures-api/${id}`, {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!json || !json.success) {
            return { success: false, error: json?.description || 'Delete failed' };
        }

        statusText.innerHTML = 'Capture deleted';
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, error: 'Delete failed' };
    }
}

async function deleteAllCaptures() {
    const ok = confirm('Delete all saved images? This cannot be undone.');
    if (!ok) return;

    try {
        const res = await fetch('/captures-api/all', {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!json || !json.success) {
            alert(json?.description || 'Unable to delete all images');
            return;
        }
        fetchGallery();
        statusText.innerHTML = 'All images deleted';
    } catch (e) {
        console.error(e);
        alert('Unable to delete all images');
    }
}

if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
        const q = e.target.value.trim();
        if (!q) { fetchGallery(); return; }
        try {
            const res = await fetch(`/captures-api/search?q=${encodeURIComponent(q)}`);
            const json = await res.json();
            if (!json.success) return;
            const results = await Promise.all(json.results.map(r => fetch(`/captures-api/${r.id}`).then(r => r.json()).then(j => j.capture)));
            renderGallery(results);
        } catch (e) {
            console.error(e);
        }
    }, 400));
}

const deleteAllCapturesBtn = document.getElementById('deleteAllCapturesBtn');
if (deleteAllCapturesBtn) {
    deleteAllCapturesBtn.onclick = deleteAllCaptures;
}

// initial gallery load
fetchGallery();

// =====================================
// AI DESCRIPTION
// =====================================
async function renderDetailedDescription(result) {
    const structured = result && result.structured ? result.structured : {};
    const parts = [];

    if (structured.image_title) {
        parts.push(`<strong>Title:</strong> ${structured.image_title}`);
    }

    if (structured.caption_short) {
        parts.push(`<strong>Short caption:</strong> ${structured.caption_short}`);
    }

    if (structured.caption_long) {
        parts.push(`<strong>Detailed caption:</strong> ${structured.caption_long}`);
    }

    if (result && result.description) {
        parts.push(`<strong>AI description:</strong> ${result.description}`);
    }

    if (structured.tags && structured.tags.length) {
        parts.push(`<strong>Tags:</strong> ${structured.tags.join(', ')}`);
    }

    if (structured.objects && structured.objects.length) {
        const objectText = structured.objects.map(obj => `${obj.type || 'object'} (${obj.count || 1})`).join(', ');
        parts.push(`<strong>Objects:</strong> ${objectText}`);
    }

    const text = parts.length > 0 ? parts.join('<br><br>') : 'No detailed image analysis available yet.';
    description.innerHTML = text;

    if (structured.image_title) {
        showCapturedResult(imageBase64, structured.image_title);
    }

    if (resultMeta) {
        resultMeta.innerHTML = parts.length > 0 ? parts[0] : 'AI analysis is ready.';
    }
}

async function ensureAiAvailable() {
    try {
        const response = await fetch('/health', { method: 'GET' });
        if (!response.ok) {
            return false;
        }

        const health = await response.json();
        return health.aiAvailable === true;
    } catch (error) {
        console.warn("Could not check AI server health:", error);
        return false;
    }
}

async function describeImage(imageData = imageBase64) {
    if (!imageData || imageData === "") {
        alert("Capture image first");
        return;
    }

    const aiReady = await ensureAiAvailable();
    if (!aiReady) {
        description.textContent = "AI server is unavailable. Wait for it to finish starting, or check the npm start output.";
        statusText.innerHTML = "AI server offline";
        return;
    }

    loading.style.display = "block";
    description.innerHTML = "AI analyzing image...";

    try {
        const response = await fetch("/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image: imageData
            })
        });

        if (!response.ok) {
            throw new Error(`AI analysis failed (HTTP ${response.status})`);
        }

        const result = await response.json();
        if (!result || !result.description) {
            throw new Error("AI server returned no description");
        }

        loading.style.display = "none";
        renderDetailedDescription(result);
        speak(result.description || 'Image analyzed successfully.');
        addHistory("AI description generated");
    } catch (error) {
        console.log(error);
        description.innerHTML = "Cannot connect to AI server. Start the AI service and try again.";
        loading.style.display = "none";
        statusText.innerHTML = "AI server unavailable";
    }
}

// =====================================
// SPEECH
// =====================================
function speak(text) {
    if (!('speechSynthesis' in window)) {
        return;
    }

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((voice) => {
        const normalized = `${voice.name} ${voice.lang}`.toLowerCase();
        return normalized.includes('female') || normalized.includes('zira') || normalized.includes('samantha') || normalized.includes('aria') || normalized.includes('google uk english female');
    }) || voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) || voices[0];

    let speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 1;
    speech.pitch = 1.2;
    speech.volume = 1;

    if (preferredVoice) {
        speech.voice = preferredVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
}

if (window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => {
        // allow voice list to load before speaking
    };
}

// =====================================
// HISTORY
// =====================================
function addHistory(text) {
    if (historyList.children.length === 1 && historyList.children[0].innerText === "No detection yet.") {
        historyList.innerHTML = "";
    }

    const li = document.createElement("li");
    li.innerHTML = new Date().toLocaleTimeString() + " - " + text;
    historyList.prepend(li);
}

// =====================================
// ARDUINO CONNECTION
// =====================================
async function connectArduino() {
    if (!("serial" in navigator)) {
        alert("Use Chrome or Edge browser");
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        statusText.innerHTML = "Arduino Connected";
        readArduino();
    } catch (error) {
        console.log(error);
    }
}

// =====================================
// READ ARDUINO
// =====================================
async function readArduino() {
    let decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);

    let reader = decoder.readable.getReader();

    while (true) {
        let { value } = await reader.read();

        if (value) {
            console.log("Arduino:", value);

            if (value.includes("CAPTURE")) {
                statusText.innerHTML = "Object detected <15cm";
                captureImage();
                setTimeout(() => {
                    describeImage();
                }, 1000);
            }
        }
    }
}

// =====================================
// BUTTON EVENTS
// =====================================
startCameraBtn.onclick = startCamera;
captureBtn.onclick = captureImage;
describeBtn.onclick = describeImage;
connectBtn.onclick = connectArduino;

statusCircle.style.background = "red";
statusText.innerHTML = "Waiting for sensor...";
