// background.js
console.log('Background script loaded');

// Initialize storage if needed
browser.storage.local.get('feedCursors').then(result => {
  if (!result.feedCursors) {
    browser.storage.local.set({ feedCursors: {} }).then(() => {
      console.log('Initialized feedCursors storage');
    });
  }
}).catch(error => {
  console.error('Error initializing storage:', error);
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'storeCursor') {
    console.log('Background: Storing cursor', request);
    browser.storage.local.get('feedCursors').then(result => {
      let feedCursors = result.feedCursors || {};
      
      // Initialize array for this feed if it doesn't exist
      if (!feedCursors[request.feedUrl]) {
        feedCursors[request.feedUrl] = [];
      }
      
      // Add new cursor to the beginning, limit to last 3
      feedCursors[request.feedUrl].unshift(request.cursor);
      if (feedCursors[request.feedUrl].length > 3) {
        feedCursors[request.feedUrl].pop();
      }
      
      browser.storage.local.set({ feedCursors }, () => {
        console.log('Background: Cursor stored successfully');
        sendResponse({ success: true });
      });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getCursor') {
    console.log('Background: Getting cursor for', request.feedUrl);
    browser.storage.local.get('feedCursors').then(result => {
      const cursor = result.feedCursors?.[request.feedUrl]?.[0] || null;
      console.log('Background: Retrieved cursor:', cursor);
      sendResponse({ cursor });
    });
    return true; // Keep the message channel open for async response
  }
});
