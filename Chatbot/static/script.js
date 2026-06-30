async function fetchData() {
    const input = document.getElementById("user-input");
    const message = input.value.trim();

    if (message === "") return;

    const chatbox = document.getElementById("chat-box");

    // Display user message
    chatbox.innerHTML += `
        <div class="message user">
            <div class="message-bubble">
                ${message}
            </div>
        </div>
    `;

    // Clear input
    input.value = "";

    // Scroll to bottom
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
        // Send request to Flask backend
        const response = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            throw new Error("Server Error");
        }

        const data = await response.json();

        // Display bot response
        chatbox.innerHTML += `
            <div class="message bot">
                <div class="message-bubble">
                    ${data.response}
                </div>
            </div>
        `;

        // Auto-scroll
        chatbox.scrollTop = chatbox.scrollHeight;

    } catch (error) {
        console.error(error);

        chatbox.innerHTML += `
            <div class="message bot">
                <div class="message-bubble">
                    ⚠️ Unable to connect to the server.
                </div>
            </div>
        `;

        chatbox.scrollTop = chatbox.scrollHeight;
    }
}

// Send message when Enter is pressed
document.getElementById("user-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        fetchData();
    }
});