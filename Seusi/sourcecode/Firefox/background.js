// ================= CONFIG =================
const CLIENT_ID = "143594037740-80egr34dcshqjs82123dvja6utms6bsk.apps.googleusercontent.com";
const REDIRECT_URI = "https://seusi-session-keeper.vercel.app/oauth-redirect";
const SCOPES = "https://www.googleapis.com/auth/drive.file";
let accessToken = null;
let logWindowId = null;

// ================= MESSAGE SENDER =================
// A simple function to send messages to the log popup
function log(message, type = "log") {
    if (logWindowId) {
        chrome.tabs.query({ windowId: logWindowId }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: type, message: message });
            }
        });
    }
}

// ================= MESSAGE LISTENER =================
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "login") loginGoogle();
    if (msg.action === "startBackup") createLogWindowAndRun(backupData);
    if (msg.action === "startRestore") createLogWindowAndRun(restoreData);
    if (msg.action === "getLoginStatus") getLoginStatus();
});

// ================= WINDOW MANAGEMENT =================
async function createLogWindowAndRun(callback) {
    // If a log window is already open, focus it
    if (logWindowId) {
        chrome.windows.update(logWindowId, { focused: true });
        return;
    }

    // Create a new window for the log
    const window = await new Promise(resolve => {
        chrome.windows.create({
            url: "log.html",
            type: "popup",
            width: 500,
            height: 400,
            focused: true
        }, resolve);
    });

    logWindowId = window.id;

    // Listen for when the log window is closed
    chrome.windows.onRemoved.addListener((closedWindowId) => {
        if (closedWindowId === logWindowId) {
            logWindowId = null;
        }
    });

    // Wait a moment for the new window's scripts to load before sending messages
    setTimeout(callback, 500);
}

// ================= LOGIN STATUS CHECK =================
async function getLoginStatus() {
    let store = await chrome.storage.local.get("gdriveToken");
    accessToken = store.gdriveToken;

    if (accessToken) {
        const userInfo = await getUserInfo(accessToken);
        if (userInfo && userInfo.name) {
            chrome.runtime.sendMessage({ action: "updateLoginStatus", status: `Logged in as ${userInfo.name}` });
        } else {
            chrome.runtime.sendMessage({ action: "updateLoginStatus", status: "Login with GDrive" });
        }
    } else {
        chrome.runtime.sendMessage({ action: "updateLoginStatus", status: "Login with GDrive" });
    }
}

// ================= GET USER INFO =================
async function getUserInfo(token) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return await response.json();
    } catch (e) {
        console.error("Failed to get user info:", e);
        return null;
    }
}

// ================= LOGIN FUNCTION =================
function loginGoogle() {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
    
    chrome.tabs.create({ url: authUrl, active: false }, function(authTab) {
        chrome.webRequest.onBeforeRequest.addListener(
            function listener(details) {
                if (details.url.startsWith(REDIRECT_URI)) {
                    const params = new URLSearchParams(details.url.substring(details.url.indexOf('#') + 1));
                    const token = params.get('access_token');
                    
                    if (token) {
                        accessToken = token;
                        chrome.storage.local.set({ gdriveToken: accessToken });
                        getLoginStatus();
                        alert("Google Drive linked ✅");
                    }
                    
                    chrome.tabs.remove(details.tabId);
                    chrome.webRequest.onBeforeRequest.removeListener(listener);
                }
            },
            { urls: [REDIRECT_URI + "*"] },
            ["blocking"]
        );
    });
}

// ================= BACKUP FUNCTION =================
async function backupData() {
    try {
        log("Starting backup process...");
        let data = { cookies: [], storage: {} };
        
        if (!accessToken) {
            let store = await chrome.storage.local.get("gdriveToken");
            accessToken = store.gdriveToken;
        }
        if (!accessToken) {
            log("Please log in to Google Drive first!", "logFailure");
            return;
        }

        log("Getting cookies...");
        data.cookies = await new Promise(resolve => chrome.cookies.getAll({}, resolve));
        log(`Found ${data.cookies.length} cookies.`);

        log("Getting local and session storage from current tab...");
        let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            log("No active tab found. Skipping storage collection.");
            data.storage = {};
        } else {
            try {
                let result = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    func: () => {
                        let storage = { localStorage: {}, sessionStorage: {} };
                        for (let i = 0; i < localStorage.length; i++) {
                            let key = localStorage.key(i);
                            storage.localStorage[key] = localStorage.getItem(key);
                        }
                        for (let i = 0; i < sessionStorage.length; i++) {
                            let key = sessionStorage.key(i);
                            storage.sessionStorage[key] = sessionStorage.getItem(key);
                        }
                        return storage;
                    }
                });
                data.storage = (result && result.length > 0) ? result[0].result : {};
                log("Storage data collected.");
            } catch (e) {
                log("Error collecting storage data: " + e.message, "logFailure");
                data.storage = {};
            }
        }
        await uploadToDrive(data);
    } catch (e) {
        log("An unexpected error occurred: " + e.message, "logFailure");
    }
}

// ================= UPLOAD TO DRIVE =================
async function uploadToDrive(data) {
    log("Uploading data to Google Drive...");
    const folderName = "(seusie) [Important] session backup";
    
    log("Checking for backup folder...");
    const folderId = await getOrCreateFolder(folderName);
    if (!folderId) {
        log("Failed to get or create folder. Aborting.", "logFailure");
        return;
    }
    log("Backup folder found/created.");

    let metadata = {
        name: "session-backup.json",
        mimeType: "application/json",
        parents: [folderId]
    };

    let form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));

    try {
        let res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: { "Authorization": "Bearer " + accessToken },
            body: form
        });
        let out = await res.json();
        if (out.id) {
            log("Backup uploaded successfully! ✅", "logSuccess");
        } else {
            log("Backup failed. Google Drive error.", "logFailure");
            log(JSON.stringify(out));
        }
    } catch (e) {
        log("Failed to upload backup: " + e.message, "logFailure");
    }
}

// ================= GET OR CREATE FOLDER =================
async function getOrCreateFolder(folderName) {
    let search = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder'`),
        { headers: { Authorization: "Bearer " + accessToken } }
    );
    let res = await search.json();
    if (res.files && res.files.length > 0) return res.files[0].id;

    let metadata = { name: folderName, mimeType: "application/vnd.google-apps.folder" };
    let create = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify(metadata)
    });
    let out = await create.json();
    return out.id;
}

// ================= RESTORE FUNCTION =================
async function restoreData() {
    try {
        log("Starting restore process...");
        if (!accessToken) {
            let store = await chrome.storage.local.get("gdriveToken");
            accessToken = store.gdriveToken;
        }
        if (!accessToken) {
            log("Please login first!", "logFailure");
            return;
        }

        const backup = await getBackupFileFromDrive();
        if (!backup) {
            log("No backup file found on Google Drive.", "logFailure");
            return;
        }

        log("Restoring cookies...");
        if (backup.cookies) await restoreCookies(backup.cookies);
        log(`Restored ${backup.cookies.length} cookies.`);

        log("Restoring storage for active tab...");
        if (backup.storage) await restoreStorage(backup.storage);
        log("Storage restore completed.");

        log("Restore completed successfully! ✅", "logSuccess");
    } catch (e) {
        log("An unexpected error occurred: " + e.message, "logFailure");
    }
}

// ================= FETCH BACKUP FROM DRIVE =================
async function getBackupFileFromDrive() {
    log("Searching for backup file on Google Drive...");
    const folderName = "(seusie) [Important] session backup";
    let folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder'`,
        { headers: { Authorization: "Bearer " + accessToken } }
    );
    let folderJson = await folderRes.json();
    if (!folderJson.files || folderJson.files.length === 0) {
        log("Backup folder not found.");
        return null;
    }
    let folderId = folderJson.files[0].id;

    let fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+name='session-backup.json'`,
        { headers: { Authorization: "Bearer " + accessToken } }
    );
    let fileJson = await fileRes.json();
    if (!fileJson.files || fileJson.files.length === 0) {
        log("Backup file 'session-backup.json' not found in folder.");
        return null;
    }

    const fileId = fileJson.files[0].id;
    log("Found backup file. Downloading...");
    let contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: "Bearer " + accessToken } }
    );
    let data = await contentRes.json();
    log("Backup file downloaded.");
    return data;
}

// ================= RESTORE COOKIES =================
async function restoreCookies(cookies) {
    for (let cookie of cookies) {
        let details = {
            url: (cookie.secure ? "https://" : "http://") + cookie.domain.replace(/^\./, ""),
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate
        };
        try { await chrome.cookies.set(details); } catch(e) { log(`Cookie restore failed for ${cookie.name}: ` + e.message); }
    }
}

// ================= RESTORE STORAGE =================
async function restoreStorage(storage) {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (storageData) => {
                for (let key in storageData.localStorage) localStorage.setItem(key, storageData.localStorage[key]);
                for (let key in storageData.sessionStorage) sessionStorage.setItem(key, storageData.sessionStorage[key]);
            },
            args: [storage]
        });
    } catch (e) { log("Restore storage failed: " + e.message); }
}
