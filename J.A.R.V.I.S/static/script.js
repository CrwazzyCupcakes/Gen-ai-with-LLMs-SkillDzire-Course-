async function fetchData() {
    const input = document.getElementById("user-input");
    const message = input.value.trim();

    if (message === "") return;

    const chatbox = document.getElementById("chat-box");

    // Display user message
    chatbox.innerHTML += `
        <div class="message user">
            <div class="message-label">You</div>
            <div class="message-bubble">${escapeHtml(message)}</div>
        </div>
    `;

    input.value = "";
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
            body: JSON.stringify({ message })
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
    }
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

document.getElementById("user-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        fetchData();
    }
});

// Live HUD clock
function tickClock() {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString("en-GB");
}
tickClock();
setInterval(tickClock, 1000);