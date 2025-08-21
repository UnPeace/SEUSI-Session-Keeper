(() => {
  let storageDump = {
    localStorage: {},
    sessionStorage: {}
  };

  // Local Storage
  for (let i = 0; i < localStorage.length; i++) {
    let key = localStorage.key(i);
    storageDump.localStorage[key] = localStorage.getItem(key);
  }

  // Session Storage
  for (let i = 0; i < sessionStorage.length; i++) {
    let key = sessionStorage.key(i);
    storageDump.sessionStorage[key] = sessionStorage.getItem(key);
  }

  return storageDump;
})();
