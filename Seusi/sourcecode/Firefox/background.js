const CLIENT_ID = "143594037740-80egr34dcshqjs82123dvja6utms6bsk.apps.googleusercontent.com";
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = "https://www.googleapis.com/auth/drive.file";
let accessToken = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "login") loginGoogle();
  if (msg.action === "backup") backupData();
  if (msg.action === "restore") restoreData();
});

// Login
function loginGoogle() {
  let authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + CLIENT_ID +
    "&response_type=token" +
    "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
    "&scope=" + encodeURIComponent(SCOPES);

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    (redirectUrl) => {
      if (redirectUrl) {
        let match = redirectUrl.match(/access_token=([^&]+)/);
        if (match) {
          accessToken = match[1];
          chrome.storage.local.set({ gdriveToken: accessToken });
          alert("Google Drive linked ✅");
        }
      }
    }
  );
}

// Upload JSON to Drive
async function uploadToDrive(data) {
  if (!accessToken) {
    let store = await chrome.storage.local.get("gdriveToken");
    accessToken = store.gdriveToken;
  }
  if (!accessToken) {
    alert("Please login to Google Drive first!");
    return;
  }

  // Ensure folder exists
  let folderName = "(seusie) [Important] session backup";
  let folderId = await getOrCreateFolder(folderName);

  let metadata = {
    name: "session-backup.json",
    mimeType: "application/json",
    parents: [folderId]
  };

  let form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));

  let res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken },
    body: form
  });

  let out = await res.json();
  alert("Backup uploaded ✅ (" + out.id + ")");
}

async function getOrCreateFolder(folderName) {
  let search = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
    encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder'`),
    { headers: { Authorization: "Bearer " + accessToken } }
  );
  let res = await search.json();
  if (res.files && res.files.length > 0) return res.files[0].id;

  // Create folder
  let metadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  let create = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });
  let out = await create.json();
  return out.id;
}

async function backupData() {
  let data = { cookies: [], storage: {} };

  // Get cookies
  let allCookies = await new Promise(resolve => chrome.cookies.getAll({}, resolve));
  data.cookies = allCookies;

  // Local/session storage
let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
if (!tabs || tabs.length === 0) {
    console.log("No active tab found. Skipping storage collection.");
    data.storage = {};
} else {
    try {
        let result = await chrome.tabs.executeScript(tabs[0].id, { file: "content.js" });
        data.storage = (result && result.length > 0) ? result[0] : {};
    } catch (e) {
        console.log("Error injecting content script:", e);
        data.storage = {};
    }
}



  uploadToDrive(data);
}
