/* This script handles two main features:
   1. Automatically hides posts when they are scrolled one viewport height above the current view
   2. Shows confirmation dialog when restoring feed position
*/

console.log('Feed-reload: Content script loaded on:', window.location.href);

// Use the appropriate API namespace (chrome or browser)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Keep track of the current feed ID
let currentFeedId = null;

// Wait for DOM to be ready
const waitForDOM = () => {
  return new Promise((resolve) => {
    if (document.body) {
      resolve();
    } else {
      const observer = new MutationObserver((mutations, obs) => {
        if (document.body) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  });
};

// Function to extract feed ID from URL
function extractFeedId(url) {
  try {
    const urlObj = new URL(url);
    const feedParam = urlObj.searchParams.get('feed');
    // Decode the feed parameter since it's URL encoded
    const decodedFeed = feedParam ? decodeURIComponent(feedParam) : null;
    console.log('Feed-reload: Extracted feed ID:', { 
      original: feedParam, 
      decoded: decodedFeed,
      url,
      timestamp: new Date().toISOString()
    });
    return decodedFeed;
  } catch (e) {
    console.error('Feed-reload: Error extracting feed ID:', e);
    return null;
  }
}

// Function to create and show confirmation dialog
async function showConfirmationDialog() {
  await waitForDOM(); // Make sure DOM is ready before showing dialog
  
  console.log('Feed-reload: Showing cursor restore dialog');
  
  return new Promise((resolve) => {
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Create dialog content
    dialog.innerHTML = `
      <h2 style="margin-top: 0; font-size: 18px; color: #000;">Restore previous position?</h2>
      <p style="margin: 10px 0; color: #666;">Would you like to load the feed from where you left off?</p>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
        <button id="cancelBtn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #eee; cursor: pointer;">No</button>
        <button id="confirmBtn" style="padding: 8px 16px; border: none; border-radius: 4px; background: #0066ff; color: white; cursor: pointer;">Yes</button>
      </div>
    `;

    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `;

    // Add click handlers
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    dialog.querySelector('#confirmBtn').addEventListener('click', () => {
      backdrop.remove();
      dialog.remove();
      console.log('Feed-reload: User confirmed cursor restore');
      resolve(true);
    });

    dialog.querySelector('#cancelBtn').addEventListener('click', () => {
      backdrop.remove();
      dialog.remove();
      console.log('Feed-reload: User declined cursor restore');
      resolve(false);
    });
  });
}

// Function to check if we're on the main feed or a list feed
function isMainFeedOrList() {
  const path = window.location.pathname;
  return path === '/' || path.includes('/lists/') || path.includes('/feed/');
}

// Function to get the post's AT-URI
function getPostATUri(post) {
  // First try to get it from the post-thread link
  const threadLink = post.querySelector('a[href^="/profile/"][href*="/post/"]');
  if (threadLink) {
    const match = threadLink.href.match(/\/profile\/([^/]+)\/post\/([^/]+)/);
    if (match) {
      return `at://${match[1]}/app.bsky.feed.post/${match[2]}`;
    }
  }
  
  // Fallback to data attribute if available
  return post.getAttribute('data-post-uri');
}

// Function to hide a post
function hidePost(post) {
  if (!post || post.style.display === 'none') return;
  
  const uri = getPostATUri(post);
  if (!uri) {
    console.log('Feed-reload: Could not get URI for post:', post);
    return;
  }

  // Store the original height before hiding
  const height = post.offsetHeight;
  post.style.display = 'none';
  
  console.log('Feed-reload: Hidden post:', { uri, height });
}

// Function to start observing posts
function startObserving() {
  // Only process if we're on the main feed or a list
  if (!isMainFeedOrList()) return;

  // Find all posts that aren't being observed yet
  const posts = document.querySelectorAll('[data-testid="postThreadItem"]:not([data-observed="true"])');
  posts.forEach(post => {
    // Mark as observed to prevent re-processing
    post.setAttribute('data-observed', 'true');
    
    // Create an observer for this specific post
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          // If the post is above the viewport and not intersecting, hide it
          if (!entry.isIntersecting && entry.boundingClientRect.bottom < 0) {
            hidePost(entry.target);
            observer.disconnect();
          }
        });
      },
      {
        threshold: 0,
        rootMargin: '100px 0px 0px 0px' // Add some margin to start hiding slightly before they're fully out of view
      }
    );
    
    observer.observe(post);
  });
}

// Watch for any changes to the page content
const postsObserver = new MutationObserver(() => {
  startObserving();
});

// Listen for messages from background script
api.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('Feed-reload: Received message:', message);
  
  if (message.type === 'SHOW_CURSOR_DIALOG') {
    const { requestId, feedId, cursor } = message;
    console.log('Feed-reload: Showing cursor dialog:', { requestId, feedId, cursor });
    
    // Show dialog and get user's choice
    const approved = await showConfirmationDialog();
    
    // Send response back to background script
    console.log('Feed-reload: Sending dialog response:', { requestId, approved });
    api.runtime.sendMessage({
      type: 'CURSOR_DIALOG_RESPONSE',
      requestId,
      approved
    });
  }
});

// Debug function to check if a URL is a feed API request
function isFeedApiRequest(resource) {
  if (typeof resource !== 'string') return false;
  try {
    const url = new URL(resource);
    const isFeed = url.pathname.includes('/xrpc/app.bsky.feed.getFeed');
    console.log('Feed-reload: Checking if URL is feed request:', {
      url: resource,
      isFeed,
      pathname: url.pathname
    });
    return isFeed;
  } catch (e) {
    console.error('Feed-reload: Error checking URL:', e);
    return false;
  }
}

// Intercept fetch requests to capture cursors
const originalFetch = window.fetch;
window.fetch = async function(resource, init) {
  console.log('Feed-reload: Intercepted fetch:', { 
    resource, 
    method: init?.method || 'GET',
    timestamp: new Date().toISOString()
  });
  
  const response = await originalFetch(resource, init);
  
  // Only process feed requests
  if (isFeedApiRequest(resource)) {
    try {
      // Clone the response so we can read it
      const clone = response.clone();
      const data = await clone.json();
      const feedId = extractFeedId(resource);
      
      console.log('Feed-reload: Processing feed response:', {
        feedId,
        hasCursor: !!data?.cursor,
        cursor: data?.cursor,
        url: resource,
        timestamp: new Date().toISOString()
      });
      
      if (data && data.cursor && feedId) {
        // Send cursor to background script for storage
        console.log('Feed-reload: Sending cursor to background:', {
          feedId,
          cursor: data.cursor,
          timestamp: new Date().toISOString()
        });
        
        api.runtime.sendMessage({
          type: 'STORE_CURSOR',
          feedId,
          cursor: data.cursor
        }, (response) => {
          console.log('Feed-reload: Got storage response:', response);
          if (response && response.success) {
            console.log('Feed-reload: Successfully stored cursor');
          } else {
            console.error('Feed-reload: Failed to store cursor:', response?.error);
          }
        });
      } else {
        console.log('Feed-reload: No cursor found in response');
      }
    } catch (error) {
      console.error('Feed-reload: Error processing response:', error);
    }
  }
  
  return response;
};

// Initialize observation when DOM is ready
waitForDOM().then(() => {
  console.log('Feed-reload: DOM ready, starting observation');
  
  // Start observing posts
  startObserving();
  
  // Watch for new posts being added
  postsObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}).catch(error => {
  console.error('Feed-reload: Error initializing:', error);
});
