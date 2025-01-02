// background.js - Handles network request monitoring and cursor storage

// Use the appropriate API namespace (chrome or browser)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Function to extract feed ID from URL
function extractFeedId(url) {
  try {
    const urlObj = new URL(url);
    const feedParam = urlObj.searchParams.get('feed');
    console.log('Background: Extracted feed ID:', feedParam);
    return feedParam || null;
  } catch (e) {
    console.error('Background: Error parsing feed URL:', e);
    return null;
  }
}

// Function to extract cursor from URL
function extractCursor(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('cursor');
  } catch (e) {
    console.error('Background: Error extracting cursor from URL:', e);
    return null;
  }
}

// Function to manage cursor storage
async function storeFeedCursor(feedId, cursor) {
  if (!feedId || !cursor) {
    console.log('Background: Missing feedId or cursor:', { feedId, cursor });
    return;
  }
  
  console.log('Background: Attempting to store cursor:', { feedId, cursor });
  
  try {
    // Get existing cursors from storage
    const result = await api.storage.local.get(['feedCursors']);
    console.log('Background: Current storage state:', result);
    const feedCursors = result.feedCursors || {};
    
    // Get or initialize cursor array for this feed
    let cursors = feedCursors[feedId] || [];
    
    // Add new cursor to beginning of array if it's not already there
    if (!cursors.includes(cursor)) {
      cursors.unshift(cursor);
      // Keep only last 5 cursors
      cursors = cursors.slice(0, 5);
      
      // Update storage
      feedCursors[feedId] = cursors;
      await api.storage.local.set({ feedCursors });
      
      console.log(`Background: Successfully stored cursor for feed ${feedId}. Total cursors:`, cursors);
      
      // Notify content script if we have enough cursors
      if (cursors.length >= 2) {
        console.log('Background: Notifying content script about available cursors');
        // Send message to all tabs that match bsky.app
        const tabs = await api.tabs.query({ url: "*://bsky.app/*" });
        for (const tab of tabs) {
          api.tabs.sendMessage(tab.id, {
            type: 'CURSORS_AVAILABLE',
            data: {
              feedId: feedId,
              cursors: cursors
            }
          });
        }
      }
      
      // Verify storage
      const verification = await api.storage.local.get(['feedCursors']);
      console.log('Background: Storage verification:', verification);
    } else {
      console.log('Background: Cursor already stored for this feed');
    }
  } catch (error) {
    console.error('Background: Error storing cursor:', error);
  }
}

// Listen for API responses using webRequest
api.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.url.includes('/xrpc/app.bsky.feed.getFeed')) {
      console.log('Background: Intercepted getFeed response:', details.url);
      
      try {
        const feedId = extractFeedId(details.url);
        const cursor = extractCursor(details.url);
        
        if (feedId && cursor) {
          await storeFeedCursor(feedId, cursor);
        }
      } catch (error) {
        console.error('Background: Error processing API response:', error);
      }
    }
  },
  {
    urls: [
      "*://*.bsky.network/xrpc/app.bsky.feed.getFeed*",
      "*://shiitake.us-east.host.bsky.network/xrpc/app.bsky.feed.getFeed*"
    ]
  }
);

// Listen for messages from content script
api.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('Background: Received message:', message);
  
  if (message.type === 'CHECK_CURSORS') {
    try {
      const result = await api.storage.local.get(['feedCursors']);
      const feedCursors = result.feedCursors || {};
      const cursors = feedCursors[message.data.feedId] || [];
      
      if (cursors.length >= 2) {
        api.tabs.sendMessage(sender.tab.id, {
          type: 'CURSORS_AVAILABLE',
          data: {
            feedId: message.data.feedId,
            cursors: cursors
          }
        });
      }
    } catch (error) {
      console.error('Background: Error checking cursors:', error);
    }
  }
  
  if (message.type === 'FEED_RESPONSE' && message.data) {
    const { url, cursor } = message.data;
    console.log('Background: Processing feed response:', { url, cursor });
    
    if (cursor) {
      const feedId = extractFeedId(url);
      if (feedId) {
        await storeFeedCursor(feedId, cursor);
      }
    }
  }
});
