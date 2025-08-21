// Function to update the login button text
function updateLoginButton(text) {
    const loginButton = document.getElementById("login");
    loginButton.textContent = text;
}

// On popup load, check login status
document.addEventListener("DOMContentLoaded", () => {
    chrome.runtime.sendMessage({ action: "getLoginStatus" });
});

// Event listeners for buttons
document.getElementById("login").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "login" });
});

document.getElementById("backup").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startBackup" });
});

document.getElementById("restore").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startRestore" });
});

// Listener to receive messages from the background script
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "updateLoginStatus") {
        updateLoginButton(msg.status);
    }
});
