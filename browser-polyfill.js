(function(global, factory) {
  if (typeof define === "function" && define.amd) {
    define("webextension-polyfill", ["module"], factory);
  } else if (typeof exports !== "undefined") {
    factory(module);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod);
    global.browser = mod.exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function(module) {
  /* webextension-polyfill - v0.10.0 - Chrome -> Firefox API Polyfill */
  if (typeof globalThis.browser === "undefined" || Object.getPrototypeOf(globalThis.browser) !== Object.prototype) {
    const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";

    const wrapAPIs = extensionAPIs => {
      const apiMetadata = {
        "storage": {
          "async": ["get", "set", "remove", "clear"]
        }
      };

      let wrappedAPIs = {};

      for (const namespace of Object.keys(apiMetadata)) {
        wrappedAPIs[namespace] = {};
        
        if (extensionAPIs[namespace]) {
          for (const key of Object.keys(extensionAPIs[namespace])) {
            if (apiMetadata[namespace].async.includes(key)) {
              // Wrap the Chrome API to return a Promise
              wrappedAPIs[namespace][key] = (...args) => {
                return new Promise((resolve, reject) => {
                  extensionAPIs[namespace][key](...args, result => {
                    if (extensionAPIs.runtime.lastError) {
                      reject(new Error(extensionAPIs.runtime.lastError.message));
                    } else {
                      resolve(result);
                    }
                  });
                });
              };
            } else {
              wrappedAPIs[namespace][key] = extensionAPIs[namespace][key];
            }
          }
        }
      }

      return wrappedAPIs;
    };

    module.exports = wrapAPIs(chrome);
  } else {
    module.exports = globalThis.browser;
  }
});
