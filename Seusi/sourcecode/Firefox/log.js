document.addEventListener("DOMContentLoaded", () => {
    const logDisplay = document.getElementById("log-display");
    let countdownInterval;

    function appendToLog(message) {
        logDisplay.textContent += message + "\n";
        logDisplay.scrollTop = logDisplay.scrollHeight;
    }

    function startCountdown() {
        let count = 3;
        appendToLog(`\nOperation successful. Closing window in ${count}...`);
        
        countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                appendToLog(`Closing window in ${count}...`);
            } else {
                clearInterval(countdownInterval);
                window.close();
            }
        }, 1000);
    }

    // Listen for log messages from the background script
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "log") {
            appendToLog(msg.message);
        } else if (msg.action === "logSuccess") {
            appendToLog(msg.message);
            startCountdown();
        } else if (msg.action === "logFailure") {
            appendToLog(msg.message);
            // On failure, do not close the window
        }
    });
});
