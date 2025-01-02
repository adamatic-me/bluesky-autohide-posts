// background.js - Handles request interception and cursor storage for feed navigation
// Uses Firefox's webRequest API to intercept and modify feed requests

console.log('Background: Script starting initialization...');

// Use the appropriate API namespace (chrome or browser)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Store the last cursor for each feed
let feedCursors = {};

// Keep track of pending requests waiting for user confirmation
let pendingRequests = new Map();

// Function to extract feed ID from URL
function extractFeedId(url) {
  try {
    const urlObj = new URL(url);
    const feedParam = urlObj.searchParams.get('feed');
    // Decode the feed parameter since it's URL encoded
    const decodedFeed = feedParam ? decodeURIComponent(feedParam) : null;
    console.log('Background: Extracted feed ID:', { 
      original: feedParam, 
      decoded: decodedFeed,
      url
    });
    return decodedFeed;
  } catch (e) {
    console.error('Background: Error extracting feed ID:', e);
    return null;
  }
}

// Debug function to dump storage contents
async function dumpStorageContents(label = 'Storage contents') {
  try {
    const result = await api.storage.local.get(null); // Get all storage
    console.log('Background:', label, ':', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Background: Error dumping storage:', error);
  }
}

// Function to manage cursor storage
async function storeFeedCursor(feedId, cursor) {
  console.log('Background: STORING CURSOR:', { 
    feedId, 
    cursor,
    timestamp: new Date().toISOString()
  });
  
  if (!feedId || !cursor) {
    console.log('Background: Missing feedId or cursor:', { feedId, cursor });
    return;
  }
  
  try {
    // Get current cursors from storage first
    console.log('Background: Reading current cursors from storage...');
    await dumpStorageContents('Current storage state');
    
    const result = await api.storage.local.get(['feedCursors']);
    console.log('Background: Current storage result:', JSON.stringify(result, null, 2));
    
    const currentCursors = result.feedCursors || {};
    console.log('Background: Current cursors:', JSON.stringify(currentCursors, null, 2));
    
    // Update with new cursor
    const updatedCursors = {
      ...currentCursors,
      [feedId]: cursor
    };
    
    // Store in memory
    feedCursors = updatedCursors;
    
    // Store in persistent storage
    console.log('Background: Saving updated cursors:', JSON.stringify(updatedCursors, null, 2));
    await api.storage.local.set({ feedCursors: updatedCursors });
    
    await dumpStorageContents('Storage state after update');
    
    console.log('Background: Successfully stored cursor for feed:', { 
      feedId, 
      cursor,
      allCursors: updatedCursors 
    });
  } catch (error) {
    console.error('Background: Error storing cursor:', error);
  }
}

// Load existing cursors from storage on startup
console.log('Background: Loading cursors from storage...');
api.storage.local.get(['feedCursors'], (result) => {
  feedCursors = result.feedCursors || {};
  console.log('Background: Loaded cursors from storage on startup:', JSON.stringify(feedCursors, null, 2));
});

// Listen for messages from content script
console.log('Background: Setting up message listener...');
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Received message:', message);
  
  if (message.type === 'CURSOR_DIALOG_RESPONSE') {
    const { requestId, approved } = message;
    console.log('Background: Processing cursor dialog response:', { requestId, approved });
    
    const pendingRequest = pendingRequests.get(requestId);
    
    if (pendingRequest) {
      pendingRequests.delete(requestId);
      
      if (approved) {
        // Proceed with the modified request
        const { url, cursor } = pendingRequest;
        const modifiedUrl = new URL(url);
        modifiedUrl.searchParams.set('cursor', cursor);
        console.log('Background: Using stored cursor:', { cursor, url: modifiedUrl.toString() });
        pendingRequest.resolve({ redirectUrl: modifiedUrl.toString() });
      } else {
        console.log('Background: User declined to use stored cursor');
        // Proceed with original request
        pendingRequest.resolve({});
      }
    }
  } else if (message.type === 'STORE_CURSOR') {
    // Store cursor received from content script
    const { feedId, cursor } = message;
    console.log('Background: Received STORE_CURSOR message:', { feedId, cursor });
    storeFeedCursor(feedId, cursor).then(() => {
      console.log('Background: Cursor storage complete, sending success response');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Background: Error in cursor storage:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }
  
  // Return true if we want to send a response asynchronously
  return true;
});

// Listen for feed requests using webRequest API
console.log('Background: Setting up webRequest listener...');
api.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Only process GET requests to the feed endpoint
    if (!details.url.includes('/xrpc/app.bsky.feed.getFeed')) {
      return;
    }

    const feedId = extractFeedId(details.url);
    if (!feedId) {
      return;
    }

    console.log('Background: Intercepted feed request:', { 
      feedId, 
      url: details.url,
      hasCursor: !!feedCursors[feedId],
      storedCursor: feedCursors[feedId],
      timestamp: new Date().toISOString()
    });

    // If we have a stored cursor for this feed, ask for confirmation
    if (feedCursors[feedId]) {
      const cursor = feedCursors[feedId];
      console.log('Background: Found stored cursor:', { feedId, cursor });
      
      // Create a promise that will be resolved when user responds
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        
        // Store request details
        pendingRequests.set(requestId, {
          url: details.url,
          cursor,
          resolve
        });
        
        console.log('Background: Showing cursor dialog for request:', { requestId, feedId });
        
        // Notify content script to show dialog
        api.tabs.sendMessage(details.tabId, {
          type: 'SHOW_CURSOR_DIALOG',
          requestId,
          feedId,
          cursor
        });
      });
    }
  },
  { urls: ["*://*.bsky.network/*", "*://shiitake.us-east.host.bsky.network/*"] },
  ["blocking"]
);

console.log('Background: Service worker initialization complete!');
