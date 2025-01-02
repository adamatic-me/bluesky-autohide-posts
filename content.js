/* This script has two main features:
   1. Automatically hides posts when they are scrolled one viewport height above the current view
   2. Tracks and stores the last 5 cursors for each Bluesky feed to enable feed position restoration
*/

// Use the appropriate API namespace (chrome or browser)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Keep track of the current feed ID and path
let currentFeedId = null;
let lastPath = window.location.pathname + window.location.search;

console.log('Content: Script loaded, setting up message listeners...');

// Function to extract feed ID from URL
function extractFeedIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const feedParam = urlObj.searchParams.get('feed');
    console.log('Content: Extracted feed ID from URL:', feedParam);
    return feedParam;
  } catch (e) {
    console.error('Content: Error extracting feed ID from URL:', e);
    return null;
  }
}

// Function to check URL for feed ID
function checkUrlForFeedId() {
  // Check for feed ID in the current URL
  const feedParam = new URLSearchParams(window.location.search).get('feed');
  if (feedParam) {
    console.log('Content: Found feed ID in URL:', feedParam);
    currentFeedId = feedParam;
    checkForCursors(feedParam);
    return;
  }

  // If not in URL params, check network requests
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('/xrpc/app.bsky.feed.getFeed')) {
        const feedId = extractFeedIdFromUrl(entry.name);
        if (feedId) {
          console.log('Content: Found feed ID in request:', feedId);
          currentFeedId = feedId;
          checkForCursors(feedId);
          observer.disconnect();
          break;
        }
      }
    }
  });

  observer.observe({ entryTypes: ['resource'] });
}

// Listen for messages from background script
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content: Received message:', message);
  
  if (message.type === 'CURSORS_AVAILABLE' && message.data) {
    const { feedId, cursors } = message.data;
    console.log('Content: Cursors available for feed:', feedId, 'Current feed:', currentFeedId);
    
    // If we don't have a current feed ID, try to set it
    if (!currentFeedId) {
      currentFeedId = feedId;
      console.log('Content: Setting current feed ID to:', feedId);
    }
    
    // Check if this is for our current feed
    if (currentFeedId === feedId) {
      console.log('Content: Feed IDs match, attempting to inject button');
      injectLoadPreviousButton();
    } else {
      console.log('Content: Feed IDs do not match, not injecting button');
    }
  }
  return true; // Keep the message channel open for async response
});

// Function to check for cursors when we detect a feed
function checkForCursors(feedId) {
  console.log('Content: Checking cursors for feed:', feedId);
  currentFeedId = feedId;
  
  api.runtime.sendMessage({
    type: 'CHECK_CURSORS',
    data: { feedId }
  });
}

// Create XHR interceptor
const originalXHR = window.XMLHttpRequest.prototype.open;
window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
  if (url && url.includes('/xrpc/app.bsky.feed.getFeed')) {
    console.log('Content: Intercepted XHR getFeed request:', url);
    
    try {
      const requestUrl = new URL(url);
      const feedId = requestUrl.searchParams.get('feed');
      if (feedId) {
        console.log('Content: Found feed ID in XHR request:', feedId);
        currentFeedId = feedId;
        checkForCursors(feedId);
      }
    } catch (error) {
      console.error('Content: Error processing XHR request:', error);
    }
  }
  
  return originalXHR.apply(this, [method, url, ...args]);
};

// Also keep the fetch interceptor as backup
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const [resource, config] = args;
  const url = resource.toString();
  
  if (url.includes('/xrpc/app.bsky.feed.getFeed')) {
    console.log('Content: Intercepted fetch getFeed request:', url);
    try {
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();
      const data = await clone.json();
      
      if (data && data.cursor && currentFeedId) {
        console.log('Content: Got cursor from fetch response:', {
          cursor: data.cursor,
          feedId: currentFeedId
        });
        
        api.runtime.sendMessage({
          type: 'FEED_RESPONSE',
          data: {
            url: url,
            cursor: data.cursor,
            feedId: currentFeedId
          }
        });
      }
      
      return response;
    } catch (error) {
      console.error('Content: Error in fetch interceptor:', error);
      return originalFetch.apply(this, args);
    }
  }
  
  return originalFetch.apply(this, args);
};

// Function to check if we're on the main feed or a list feed
function isMainFeedOrList() {
  const url = window.location.href;
  // Check for main feed
  if (url === 'https://bsky.app/' || url === 'https://bsky.app') {
    return true;
  }
  // Check for list feed - matches any URL containing /lists/ after bsky.app
  if (url.match(/^https:\/\/bsky\.app\/.*\/lists\/.+/)) {
    return true;
  }
  return false;
}

// Create an observer with custom threshold and rootMargin to track posts above viewport
const observer = new IntersectionObserver((entries) => {
  // Only process if we're on the main feed or a list
  if (!isMainFeedOrList()) return;

  entries.forEach(entry => {
    if (!entry.isIntersecting) {
      const rect = entry.target.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      // Check if post is above viewport by at least one viewport height
      if (rect.bottom < -viewportHeight) {
        // Check if auto-hide is enabled from chrome.storage
        api.storage.local.get(['autoHide'], (result) => {
          if (result.autoHide === true) {
            console.log('Post is one viewport height above, hiding');
            hidePost(entry.target);
          }
        });
      }
    }
  });
}, {
  // Set rootMargin to track area above viewport
  rootMargin: '200% 0px 0px 0px',
  threshold: [0, 1]
});

function getPostATUri(post) {
  // Get the avatar image URL which contains the DID
  const avatarImg = post.querySelector('img[src*="cdn.bsky.app"]');
  if (!avatarImg) return null;
  
  const avatarUrl = avatarImg.src;
  const didMatch = avatarUrl.match(/\/did:plc:[^/]+\//);
  if (!didMatch) return null;
  const did = didMatch[0].slice(1, -1); // Remove leading and trailing slashes
  
  // Get the post URL which contains the post ID
  const postTimeLink = post.querySelector('a[href*="/post/"]');
  if (!postTimeLink) return null;
  
  const href = postTimeLink.getAttribute('href');
  const postId = href.split('/post/')[1];
  if (!postId) return null;
  
  return `at://${did}/app.bsky.feed.post/${postId}`;
}

function hidePost(post) {
  const postUri = getPostATUri(post);
  if (!postUri) {
    console.warn('Could not find post AT URI');
    return;
  }
  
  console.log('Adding post to hidden posts:', postUri);
  
  // Get current hidden posts from localStorage
  const storage = localStorage.getItem('BSKY_STORAGE');
  let data = storage ? JSON.parse(storage) : {};
  
  // Initialize hiddenPosts array if it doesn't exist
  if (!data.hiddenPosts) {
    data.hiddenPosts = [];
  }
  
  // Add the post URI if it's not already hidden
  if (!data.hiddenPosts.includes(postUri)) {
    data.hiddenPosts.push(postUri);
    localStorage.setItem('BSKY_STORAGE', JSON.stringify(data));
    console.log('Post hidden:', postUri);
  }
}

function startObserving() {
  // Only observe if we're on the main feed or a list
  if (!isMainFeedOrList()) {
    console.log('Not on main feed or list, skipping observation');
    return;
  }

  const posts = document.querySelectorAll('[data-testid^="feedItem-"]');
  console.log(`Found ${posts.length} posts to observe`);
  
  posts.forEach(post => {
    observer.observe(post);
  });
}

// Watch for any changes to the page content
const postsObserver = new MutationObserver(startObserving);

// Only start observing if auto-hide is enabled
api.storage.local.get(['autoHide'], (result) => {
  const isAutoHideOn = result.autoHide === true;
  if (isAutoHideOn) {
    console.log('Auto-hide is enabled, starting observation...');
    // Only observe if we're on the main feed or a list
    if (isMainFeedOrList()) {
      // Observe the entire document for changes
      postsObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      startObserving();
    } else {
      console.log('Not on main feed or list, not starting observation');
    }
  } else {
    console.log('Auto-hide is disabled, not starting observation');
  }
});

// Listen for URL changes since Bluesky is a single-page app
const urlObserver = new MutationObserver(() => {
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== lastPath) {
    console.log('Content: Path changed from', lastPath, 'to', currentPath);
    lastPath = currentPath;
    
    // Reset current feed ID when URL changes
    currentFeedId = null;
    
    // Remove the button when changing pages
    const existingButton = document.getElementById('bsky-load-previous');
    if (existingButton) {
      existingButton.remove();
    }
  }
});

// Start observing URL changes
urlObserver.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// Also check on history changes
window.addEventListener('popstate', () => {
  const currentPath = window.location.pathname + window.location.search;
  if (currentPath !== lastPath) {
    console.log('Content: History changed from', lastPath, 'to', currentPath);
    lastPath = currentPath;
    currentFeedId = null;
    
    // Remove the button when changing pages
    const existingButton = document.getElementById('bsky-load-previous');
    if (existingButton) {
      existingButton.remove();
    }
  }
});

// Function to create and inject the Load Previous button
function injectLoadPreviousButton() {
  console.log('Content: Starting button injection');
  
  // Remove any existing button first
  const existingButton = document.getElementById('bsky-load-previous');
  if (existingButton) {
    console.log('Content: Removing existing button');
    existingButton.remove();
  }

  // Try different selectors to find the feed container
  console.log('Content: Looking for feed container...');
  const possibleSelectors = [
    '[role="feed"]',
    '[data-testid="feedContent"]',
    '[data-testid="mainContent"]',
    'main'
  ];

  let feedContainer = null;
  for (const selector of possibleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('Content: Found potential container with selector:', selector);
      feedContainer = element;
      break;
    }
  }

  // Log DOM structure to help debug
  console.log('Content: Current body children:', 
    Array.from(document.body.children).map(el => ({
      tag: el.tagName,
      id: el.id,
      role: el.getAttribute('role'),
      testid: el.getAttribute('data-testid')
    }))
  );

  // If we still don't have a feed container, retry in a moment
  if (!feedContainer) {
    console.log('Content: No feed container found, retrying in 1s');
    setTimeout(injectLoadPreviousButton, 1000);
    return;
  }

  // Create the button with Bluesky's style
  const button = document.createElement('button');
  button.id = 'bsky-load-previous';
  button.textContent = 'Load Previous';
  button.style.cssText = `
    position: fixed;
    top: 70px;
    right: 20px;
    z-index: 9999;
    padding: 8px 16px;
    background-color: rgb(0, 133, 255);
    color: white;
    border: none;
    border-radius: 20px;
    font-weight: 600;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
    opacity: 1;
    pointer-events: auto;
  `;

  // Add hover effect
  button.addEventListener('mouseover', () => {
    button.style.backgroundColor = 'rgb(0, 111, 214)';
  });
  button.addEventListener('mouseout', () => {
    button.style.backgroundColor = 'rgb(0, 133, 255)';
  });

  // Add click handler
  button.addEventListener('click', handleLoadPrevious);

  // Add to page
  console.log('Content: Attempting to add button to document.body');
  document.body.appendChild(button);
  console.log('Content: Button added to document.body');
  
  // Verify button is visible and accessible
  setTimeout(() => {
    const injectedButton = document.getElementById('bsky-load-previous');
    if (injectedButton) {
      const style = window.getComputedStyle(injectedButton);
      console.log('Content: Button visibility check:', {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
        position: style.position,
        top: style.top,
        right: style.right,
        pointerEvents: style.pointerEvents,
        element: injectedButton,
        rect: injectedButton.getBoundingClientRect()
      });
      
      // Force a reflow and ensure visibility
      injectedButton.style.display = 'flex';
      injectedButton.style.visibility = 'visible';
      injectedButton.style.opacity = '1';
      injectedButton.style.pointerEvents = 'auto';
      
      // Log button position relative to viewport
      const rect = injectedButton.getBoundingClientRect();
      console.log('Content: Button position:', {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    } else {
      console.log('Content: Button not found after injection!');
    }
  }, 100);
}

// Function to handle loading previous feed content
async function handleLoadPrevious() {
  console.log('Content: Load Previous clicked, current feed:', currentFeedId);
  if (!currentFeedId) {
    console.log('Content: No current feed ID');
    return;
  }

  // Get stored cursors for this feed
  const result = await api.storage.local.get(['feedCursors']);
  const feedCursors = result.feedCursors || {};
  const cursors = feedCursors[currentFeedId] || [];

  if (cursors.length < 2) {
    console.log('Content: Not enough cursors stored for this feed');
    return;
  }

  // Get the cursor from 2 positions ago
  const targetCursor = cursors[1]; // Index 1 is 2 positions ago since we store newest first
  console.log('Content: Loading feed with cursor:', targetCursor);

  // Construct API URL
  const apiUrl = new URL('https://shiitake.us-east.host.bsky.network/xrpc/app.bsky.feed.getFeed');
  apiUrl.searchParams.set('feed', currentFeedId);
  apiUrl.searchParams.set('cursor', targetCursor);
  
  try {
    // Make the API request
    const response = await fetch(apiUrl.toString());
    const data = await response.json();
    
    if (data.feed) {
      // Clear current feed
      const feedContainer = document.querySelector('[role="feed"]');
      if (feedContainer) {
        feedContainer.innerHTML = '';
        
        // Force Bluesky to re-render the feed with our new data
        const customEvent = new CustomEvent('bsky-feed-update', { 
          detail: { 
            feed: data.feed,
            cursor: data.cursor 
          } 
        });
        window.dispatchEvent(customEvent);
        
        // Scroll to top
        window.scrollTo(0, 0);
      }
    }
  } catch (error) {
    console.error('Content: Error loading previous feed content:', error);
  }
}

console.log('Content: Initial setup complete, watching for API requests...');

// Initial check for feed ID
console.log('Content: Performing initial feed ID check');
checkUrlForFeedId();
