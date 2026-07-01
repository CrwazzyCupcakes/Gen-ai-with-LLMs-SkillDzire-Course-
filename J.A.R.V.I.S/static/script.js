/* =========================================================
   JARVIS — core chat + HUD logic
   ========================================================= */

const chatbox = document.getElementById("chat-box");
const micBtn = document.getElementById("mic-btn");
const panelBars = document.getElementById("panel-bars");
const reactorFrame = document.getElementById("reactor-frame");
const statusVoice = document.getElementById("status-voice");
const voiceModeReadout = document.getElementById("voice-mode-readout");
const headerStatusText = document.getElementById("header-status-text");

// Live context sent to the backend with every chat message so Jarvis
// can reference the correct time, location, and weather.
const contextData = {
    datetime: null,
    location: null,
    weather: null
};

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/* =========================================================
   CHAT
   ========================================================= */

async function fetchData(overrideMessage) {
    const input = document.getElementById("user-input");
    const message = (overrideMessage !== undefined ? overrideMessage : input.value).trim();

    if (message === "") return;

    // Display user message
    chatbox.innerHTML += `
        <div class="message user">
            <div class="message-label">You</div>
            <div class="message-bubble">${escapeHtml(message)}</div>
        </div>
    `;

    if (overrideMessage === undefined) input.value = "";
    chatbox.scrollTop = chatbox.scrollHeight;

    // Typing indicator
    const typingId = "typing-" + Date.now();
    chatbox.innerHTML += `
        <div class="message bot typing" id="${typingId}">
            <div class="message-label">Jarvis</div>
            <div class="message-bubble"><span></span><span></span><span></span></div>
        </div>
    `;
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                context: {
                    datetime: contextData.datetime,
                    location: contextData.location,
                    weather: contextData.weather
                }
            })
        });

        if (!response.ok) {
            throw new Error("Server Error");
        }

        const data = await response.json();

        document.getElementById(typingId)?.remove();

        chatbox.innerHTML += `
            <div class="message bot">
                <div class="message-label">Jarvis</div>
                <div class="message-bubble">${escapeHtml(data.response)}</div>
            </div>
        `;

        chatbox.scrollTop = chatbox.scrollHeight;
        addLog("RESPONSE RECEIVED");

        if (voiceModeActive) speak(data.response);

    } catch (error) {
        console.error(error);
        document.getElementById(typingId)?.remove();

        chatbox.innerHTML += `
            <div class="message bot">
                <div class="message-label">Jarvis</div>
                <div class="message-bubble">⚠️ Unable to connect to the Stark Industries server.</div>
            </div>
        `;

        chatbox.scrollTop = chatbox.scrollHeight;
        addLog("CONNECTION ERROR");
    }
}

document.getElementById("user-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        fetchData();
    }
});

/* =========================================================
   LIVE CLOCK (real date + time in the user's own timezone)
   ========================================================= */

function tickClock() {
    const el = document.getElementById("clock");
    const now = new Date();

    const timeStr = now.toLocaleTimeString(undefined, { hour12: false });
    const dateStr = now.toLocaleDateString(undefined, {
        weekday: "short", year: "numeric", month: "short", day: "numeric"
    });

    if (el) el.textContent = `${timeStr} · ${dateStr}`;

    contextData.datetime = now.toString();
}
tickClock();
setInterval(tickClock, 1000);

/* =========================================================
   LOCATION + WEATHER
   ========================================================= */

const locationReadout = document.getElementById("location-readout");
const globeCaption = document.getElementById("globe-caption");
const weatherTemp = document.getElementById("weather-temp");
const weatherDesc = document.getElementById("weather-desc");

// Rough mapping of Open-Meteo weather codes to short descriptions.
const WMO = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
    75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Violent showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Severe thunderstorm"
};

async function acquireLocation() {
    if (!navigator.geolocation) {
        locationReadout.textContent = "LOCATION UNAVAILABLE";
        globeCaption.textContent = "unsupported";
        return;
    }

    locationReadout.textContent = "LOCATING...";
    globeCaption.textContent = "acquiring signal";

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
            const geoRes = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const geo = await geoRes.json();
            const city = geo.city || geo.locality || geo.principalSubdivision || "Unknown";
            const country = geo.countryName || "";
            const label = country ? `${city}, ${country}` : city;

            contextData.location = `${label} (lat ${latitude.toFixed(2)}, lon ${longitude.toFixed(2)})`;
            locationReadout.textContent = label.toUpperCase();
            globeCaption.textContent = label;
            addLog(`LOCATION ACQUIRED: ${label}`);
        } catch (e) {
            contextData.location = `lat ${latitude.toFixed(2)}, lon ${longitude.toFixed(2)}`;
            locationReadout.textContent = "COORDS ONLY";
            globeCaption.textContent = "geocode failed";
            addLog("REVERSE GEOCODE FAILED");
        }

        fetchWeather(latitude, longitude);

    }, (err) => {
        locationReadout.textContent = "LOCATION DENIED";
        globeCaption.textContent = "permission denied";
        addLog("LOCATION PERMISSION DENIED");
    });
}

async function fetchWeather(lat, lon) {
    try {
        weatherDesc.textContent = "syncing";
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const data = await res.json();
        const cw = data.current_weather;
        if (!cw) throw new Error("no weather data");

        const desc = WMO[cw.weathercode] || "Conditions unknown";
        weatherTemp.textContent = `${Math.round(cw.temperature)}°`;
        weatherDesc.textContent = desc;

        contextData.weather = `${Math.round(cw.temperature)}°C, ${desc}, wind ${Math.round(cw.windspeed)} km/h`;
        addLog("WEATHER SYNCED");
    } catch (e) {
        weatherDesc.textContent = "sync failed";
        addLog("WEATHER SYNC FAILED");
    }
}

document.getElementById("panel-globe").addEventListener("click", acquireLocation);
document.getElementById("panel-radar").addEventListener("click", () => {
    const radar = document.querySelector(".radar");
    radar.classList.remove("ping");
    requestAnimationFrame(() => radar.classList.add("ping"));
    if (contextData.location) {
        addLog(`PING: ${contextData.location.split(" (")[0]}`);
    } else {
        acquireLocation();
    }
});

acquireLocation();
// Refresh location/weather periodically rather than on every message.
setInterval(acquireLocation, 15 * 60 * 1000);

/* =========================================================
   LOG TICKER
   ========================================================= */

const logLines = document.getElementById("log-lines");
logLines.classList.add("live");
logLines.innerHTML = "";
const MAX_LOG_ENTRIES = 6;

function addLog(text) {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    const entry = document.createElement("div");
    entry.className = "log-entry fresh";
    entry.innerHTML = `<span class="log-time">${time}</span><span>${escapeHtml(text)}</span>`;
    logLines.prepend(entry);

    setTimeout(() => entry.classList.remove("fresh"), 1500);

    while (logLines.children.length > MAX_LOG_ENTRIES) {
        logLines.removeChild(logLines.lastChild);
    }
}
addLog("SYSTEM ONLINE");

/* =========================================================
   SYSTEM STATUS PANEL (real browser-derived data)
   ========================================================= */

const statusUplink = document.getElementById("status-uplink");
const statusSecnet = document.getElementById("status-secnet");
const statusMemsys = document.getElementById("status-memsys");

function updateNetworkStatus() {
    if (navigator.onLine) {
        statusUplink.textContent = "STABLE";
        statusUplink.classList.remove("off");
    } else {
        statusUplink.textContent = "OFFLINE";
        statusUplink.classList.add("off");
    }
}
window.addEventListener("online", () => { updateNetworkStatus(); addLog("UPLINK RESTORED"); });
window.addEventListener("offline", () => { updateNetworkStatus(); addLog("UPLINK LOST"); });
updateNetworkStatus();

statusSecnet.textContent = location.protocol === "https:" ? "SECURE" : "INSECURE";
if (location.protocol !== "https:") statusSecnet.classList.add("warn");

function updateMemoryStatus() {
    if (performance && performance.memory) {
        const usedMb = Math.round(performance.memory.usedJSHeapSize / 1048576);
        statusMemsys.textContent = `${usedMb}MB`;
    } else {
        statusMemsys.textContent = "ACTIVE";
    }
}
updateMemoryStatus();
setInterval(updateMemoryStatus, 5000);

/* =========================================================
   VOICE CONTROL
   Two paths depending on browser support:
   1) Native SpeechRecognition -> hands-free wake word ("Jarvis")
   2) No native support        -> push-to-talk + Groq Whisper
   Text-to-speech (SpeechSynthesis) is used in both paths.
   ========================================================= */

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceModeActive = false;    // mic armed at all (either standing by for wake word, or mid-conversation)
let conversationMode = false;   // true once "Jarvis" has kicked off a conversation — no wake word needed until it ends
let pausedForSpeech = false;    // recognition intentionally paused while Jarvis is talking, to avoid hearing itself
let recognition = null;
let listeningForCommand = false;
let commandTimeout = null;
let intentionalStop = false;
let micStream = null;
let audioContext, analyser, micDataArray, meterRafId;

function setReactorState(state) {
    reactorFrame.classList.remove("state-listening", "state-speaking");
    if (state) reactorFrame.classList.add(`state-${state}`);
}

// Voices load asynchronously in most browsers — cache them once available
// rather than calling getVoices() cold at speak-time (often returns empty).
let cachedVoices = [];
function loadVoices() { cachedVoices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

// No browser TTS voice is the real JARVIS (that's Paul Bettany's copyrighted
// performance) — this just picks the closest calm, deep, British-leaning
// option available on the user's system, in order of preference.
const PREFERRED_VOICE_NAMES = [
    "Google UK English Male", "Microsoft George", "Microsoft Ryan",
    "Daniel", "Arthur", "Oliver"
];
function pickJarvisVoice(voices) {
    for (const name of PREFERRED_VOICE_NAMES) {
        const v = voices.find(v => v.name.includes(name));
        if (v) return v;
    }
    let v = voices.find(v => /en-GB/i.test(v.lang) && /male/i.test(v.name));
    if (v) return v;
    v = voices.find(v => /en-GB/i.test(v.lang));
    if (v) return v;
    v = voices.find(v => /^en/i.test(v.lang));
    return v || voices[0];
}

function speak(text) {
    if (!("speechSynthesis" in window)) {
        resumeVoiceListening();
        return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.93;
    utter.pitch = 0.82;

    const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
    const chosen = pickJarvisVoice(voices);
    if (chosen) utter.voice = chosen;

    utter.onstart = () => { setReactorState("speaking"); headerStatusText.textContent = "SPEAKING"; statusVoice.textContent = "SPEAKING"; };
    utter.onend = () => { setReactorState(null); resumeVoiceListening(); };
    utter.onerror = () => { setReactorState(null); resumeVoiceListening(); };
    window.speechSynthesis.speak(utter);
}

// Called once Jarvis has finished speaking (or if speech isn't available at
// all) to hand the mic back — either straight into the next conversation
// turn, or back to passive wake-word standby.
function resumeVoiceListening() {
    pausedForSpeech = false;
    if (!voiceModeActive) return;

    if (recognition) { try { recognition.start(); } catch (e) { /* already running */ } }

    if (conversationMode) {
        armForCommand(true);
    } else {
        statusVoice.textContent = "ARMED";
        statusVoice.classList.remove("listening");
        headerStatusText.textContent = 'STANDBY — SAY "JARVIS"';
        updateVoiceLabel();
    }
}

function updateVoiceLabel() {
    voiceModeReadout.classList.remove("mode-hands-free", "mode-push", "mode-unavailable");
    if (!voiceModeActive) {
        voiceModeReadout.textContent = "VOICE: OFF (TEXT MODE)";
        voiceModeReadout.classList.add("mode-unavailable");
    } else if (conversationMode) {
        voiceModeReadout.textContent = "VOICE: CONVERSATION";
        voiceModeReadout.classList.add("mode-hands-free");
    } else {
        voiceModeReadout.textContent = "VOICE: STANDBY";
        voiceModeReadout.classList.add("mode-hands-free");
    }
}

/* ---------- Path 1: native wake-word listening ---------- */

function startMicMeter() {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        micStream = stream;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        micDataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        panelBars.classList.add("mic-active");
        meterLoop();
    }).catch(() => { /* meter is cosmetic; fail silently */ });
}

function stopMicMeter() {
    if (meterRafId) cancelAnimationFrame(meterRafId);
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    panelBars.classList.remove("mic-active");
    document.querySelectorAll("#panel-bars .bar").forEach(b => b.style.setProperty("--h", "8%"));
}

function meterLoop() {
    analyser.getByteFrequencyData(micDataArray);
    const bars = document.querySelectorAll("#panel-bars .bar");
    const chunk = Math.floor(micDataArray.length / bars.length);
    bars.forEach((bar, i) => {
        let sum = 0;
        for (let j = i * chunk; j < (i + 1) * chunk; j++) sum += micDataArray[j];
        const avg = sum / chunk;
        const pct = Math.min(100, Math.max(8, (avg / 255) * 130));
        bar.style.setProperty("--h", `${pct}%`);
    });
    meterRafId = requestAnimationFrame(meterLoop);
}

function initNativeRecognition() {
    recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;   // stream partial guesses so "Jarvis" triggers fast, not after a full pause
    recognition.lang = navigator.language || "en-US"; // match the browser's own locale/accent setting
    recognition.maxAlternatives = 3;
    let restarting = false;

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const alternatives = [];
            for (let a = 0; a < result.length; a++) alternatives.push(result[a].transcript.trim());
            const transcript = alternatives[0];
            const isFinal = result.isFinal;

            if (!listeningForCommand) {
                const wakeMatch = alternatives.find(t => t.toLowerCase().includes("jarvis"));
                if (wakeMatch) {
                    conversationMode = true;
                    updateVoiceLabel();
                    const remainder = wakeMatch.toLowerCase().replace("jarvis", "").trim();
                    if (isFinal && remainder.length > 2) {
                        beginCommandCapture(remainder, true);
                    } else {
                        armForCommand();
                        if (remainder.length > 2) beginCommandCapture(remainder, false);
                    }
                    return; // one wake trigger per result batch
                }
            } else {
                if (isFinal) {
                    appendToCommandBuffer(transcript);
                } else {
                    previewHeard(`${commandBuffer} ${transcript}`.trim());
                }
            }
        }
    };

    recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            addLog("MIC PERMISSION DENIED");
            deactivateVoiceMode();
        }
        // other errors (no-speech, network, aborted) are recovered by onend restart
    };

    recognition.onend = () => {
        if (!intentionalStop && !pausedForSpeech && voiceModeActive && !restarting) {
            restarting = true;
            // tiny buffer avoids a race where speech right at the restart
            // boundary gets dropped between stop and re-start
            setTimeout(() => {
                restarting = false;
                try { recognition.start(); } catch (e) { /* already running */ }
            }, 150);
        }
    };

    return recognition;
}

function previewHeard(text) {
    if (!text) return;
    headerStatusText.textContent = `HEARD: "${text}"`.toUpperCase();
}

// Command speech is buffered across natural pauses instead of being sent
// the instant the browser reports one "final" fragment — otherwise a
// mid-sentence pause causes only the first few words to be captured.
let commandBuffer = "";
let finalizeTimer = null;
const PAUSE_TO_FINALIZE_MS = 1400;   // silence gap that means "they're done talking"
const MAX_COMMAND_WINDOW_MS = 12000; // hard safety cap regardless of pauses

function beginCommandCapture(firstChunk, isFinal) {
    commandBuffer = firstChunk;
    if (isFinal) {
        scheduleFinalize();
    } else {
        previewHeard(commandBuffer);
    }
}

function appendToCommandBuffer(chunk) {
    commandBuffer = (commandBuffer ? commandBuffer + " " : "") + chunk;
    previewHeard(commandBuffer);
    scheduleFinalize();
}

function scheduleFinalize() {
    clearTimeout(finalizeTimer);
    clearTimeout(commandTimeout); // the hard cap gets reset relative to first speech below
    finalizeTimer = setTimeout(() => {
        if (commandBuffer.trim()) handleVoiceCommand(commandBuffer.trim());
    }, PAUSE_TO_FINALIZE_MS);
}

function armForCommand(isContinuation) {
    listeningForCommand = true;
    commandBuffer = "";
    micBtn.classList.add("listening");
    setReactorState("listening");
    statusVoice.textContent = "LISTENING";
    statusVoice.classList.add("listening");
    headerStatusText.textContent = "LISTENING...";
    addLog(isContinuation ? "LISTENING FOR NEXT COMMAND" : "WAKE WORD DETECTED");

    // hard safety cap in case speech never truly finalizes
    commandTimeout = setTimeout(() => {
        if (listeningForCommand) {
            if (commandBuffer.trim()) {
                handleVoiceCommand(commandBuffer.trim());
            } else {
                listeningForCommand = false;
                conversationMode = false;
                resetVoiceVisuals();
                updateVoiceLabel();
                addLog("CONVERSATION ENDED (IDLE)");
            }
        }
    }, MAX_COMMAND_WINDOW_MS);
}

function handleVoiceCommand(text) {
    listeningForCommand = false;
    clearTimeout(commandTimeout);
    clearTimeout(finalizeTimer);
    commandBuffer = "";
    micBtn.classList.remove("listening");
    setReactorState(null);
    statusVoice.textContent = "PROCESSING";
    statusVoice.classList.remove("listening");
    headerStatusText.textContent = "PROCESSING...";
    addLog("VOICE COMMAND CAPTURED");

    // Pause listening while we wait for + speak the reply, so Jarvis
    // doesn't pick up its own voice through the speakers as a new command.
    if (voiceModeActive && recognition) {
        pausedForSpeech = true;
        try { recognition.stop(); } catch (e) { /* already stopped */ }
    }

    fetchData(text);
}

function resetVoiceVisuals() {
    micBtn.classList.remove("listening");
    setReactorState(null);
    statusVoice.textContent = "STANDBY";
    statusVoice.classList.remove("listening");
    headerStatusText.textContent = "SYSTEM ONLINE";
}

function activateHandsFreeVoice() {
    if (!recognition) recognition = initNativeRecognition();
    intentionalStop = false;
    pausedForSpeech = false;
    try { recognition.start(); } catch (e) { /* already running */ }
    startMicMeter();
    voiceModeActive = true;
    conversationMode = false;
    micBtn.classList.add("armed");
    micBtn.classList.remove("listening");
    statusVoice.textContent = "ARMED";
    headerStatusText.textContent = 'STANDBY — SAY "JARVIS"';
    updateVoiceLabel();
    localStorage.setItem("jarvis_voice_autostart", "true");
    addLog('VOICE ARMED — SAY "JARVIS" TO START');
}

function deactivateVoiceMode() {
    intentionalStop = true;
    pausedForSpeech = false;
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopMicMeter();
    voiceModeActive = false;
    conversationMode = false;
    listeningForCommand = false;
    clearTimeout(commandTimeout);
    clearTimeout(finalizeTimer);
    commandBuffer = "";
    micBtn.classList.remove("armed", "listening");
    statusVoice.textContent = "OFF";
    statusVoice.classList.remove("listening");
    headerStatusText.textContent = "TEXT MODE";
    setReactorState(null);
    updateVoiceLabel();
    localStorage.setItem("jarvis_voice_autostart", "false");
    addLog("SWITCHED TO TEXT MODE — MIC OFF");
}

/* ---------- Path 2: push-to-talk + Groq Whisper fallback ---------- */

let mediaRecorder = null;
let recordedChunks = [];

function setupPushToTalk() {
    voiceModeReadout.textContent = "VOICE: PUSH-TO-TALK";
    voiceModeReadout.classList.add("mode-push");
    statusVoice.textContent = "MANUAL";
    addLog("HANDS-FREE UNSUPPORTED — PUSH-TO-TALK READY");

    let isRecording = false;

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStream = stream;
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
            mediaRecorder.onstop = handleRecordingStop;
            mediaRecorder.start();
            isRecording = true;

            micBtn.classList.add("listening");
            setReactorState("listening");
            statusVoice.textContent = "RECORDING";
            statusVoice.classList.add("listening");
            headerStatusText.textContent = "RECORDING...";
            addLog("RECORDING VOICE COMMAND");
            startMicMeter();
        } catch (e) {
            addLog("MIC PERMISSION DENIED");
        }
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder) return;
        isRecording = false;
        mediaRecorder.stop();
        if (micStream) micStream.getTracks().forEach(t => t.stop());
        stopMicMeter();
        micBtn.classList.remove("listening");
        resetVoiceVisuals();
    }

    async function handleRecordingStop() {
        headerStatusText.textContent = "TRANSCRIBING...";
        addLog("TRANSCRIBING VIA WHISPER");
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "command.webm");

        try {
            const res = await fetch("/transcribe", { method: "POST", body: formData });
            const data = await res.json();
            headerStatusText.textContent = "SYSTEM ONLINE";
            if (data.text) {
                addLog("TRANSCRIPTION COMPLETE");
                voiceModeActive = true; // ensures the reply gets spoken back
                fetchData(data.text);
            } else {
                addLog("TRANSCRIPTION EMPTY");
            }
        } catch (e) {
            headerStatusText.textContent = "SYSTEM ONLINE";
            addLog("TRANSCRIPTION FAILED");
        }
    }

    micBtn.addEventListener("mousedown", startRecording);
    micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
    micBtn.addEventListener("mouseup", stopRecording);
    micBtn.addEventListener("mouseleave", () => { if (isRecording) stopRecording(); });
    micBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopRecording(); });
}

/* ---------- Voice bootstrap ---------- */

function initVoice() {
    const hasRecorder = !!(navigator.mediaDevices && window.MediaRecorder);

    if (SpeechRecognitionImpl) {
        updateVoiceLabel();
        micBtn.addEventListener("click", () => {
            if (voiceModeActive) {
                deactivateVoiceMode();
            } else {
                activateHandsFreeVoice();
            }
        });

        // Auto-resume hands-free listening if previously armed (browsers remember
        // the mic permission grant, so this won't need to re-prompt).
        if (localStorage.getItem("jarvis_voice_autostart") === "true") {
            activateHandsFreeVoice();
        }
    } else if (hasRecorder) {
        setupPushToTalk();
    } else {
        micBtn.classList.add("unavailable");
        micBtn.disabled = true;
        voiceModeReadout.textContent = "VOICE: UNAVAILABLE";
        voiceModeReadout.classList.add("mode-unavailable");
        addLog("VOICE INPUT UNSUPPORTED ON THIS BROWSER");
    }
}

initVoice();
