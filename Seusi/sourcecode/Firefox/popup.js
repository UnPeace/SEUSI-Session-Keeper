document.getElementById("login").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "login" });
});

document.getElementById("backup").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "backup" });
});

document.getElementById("restore").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "restore" });
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "notify") alert(msg.message);
});
