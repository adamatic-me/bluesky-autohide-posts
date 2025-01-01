// content.js
/* This script provides two main features:
   1. Auto-hiding posts after scrolling past them twice
   2. Saving feed cursors and allowing users to return to previous positions
   
   The script uses:
   - localStorage for post hiding (Bluesky's native storage)
   - chrome.storage.local for extension settings and cursors
*/

const postScrollCounts = new Map();

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

const observer = new IntersectionObserver((entries) => {
  // Only process if we're on the main feed or a list
  if (!isMainFeedOrList()) return;

  entries.forEach(entry => {
    if (!entry.isIntersecting) {
      const newCount = (postScrollCounts.get(entry.target) || 0) + 1;
      postScrollCounts.set(entry.target, newCount);
      console.log(`Post scroll count increased to ${newCount}`);
      
      // Check if auto-hide is enabled from chrome.storage
      chrome.storage.local.get(['autoHide'], (result) => {
        if (result.autoHide === true && newCount >= 2) {
          console.log(`Threshold reached (${newCount} >= 2), hiding post`);
          hidePost(entry.target);
        }
      });
    }
  });
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
  
  // Clean up our scroll tracking
  postScrollCounts.delete(post);
}

// Function to store cursor for a feed
async function storeCursor(feedUrl, cursor) {
  try {
    console.log('Starting cursor storage:', {
      feedUrl,
      cursor,
      timestamp: new Date().toISOString()
    });
    
    // Get current cursors from storage
    const result = await browser.storage.local.get('feedCursors');
    console.log('Current storage state:', result);
    
    let feedCursors = result.feedCursors || {};
    
    // Store only one cursor per feed - the last one from previous session
    feedCursors[feedUrl] = cursor;
    
    // Save back to storage
    await browser.storage.local.set({ feedCursors });
    
    // Verify storage
    const verification = await browser.storage.local.get('feedCursors');
    console.log('Storage after save:', {
      feedCursors: verification.feedCursors,
      savedCursor: verification.feedCursors[feedUrl]
    });
    
    return true;
  } catch (error) {
    console.error('Error storing cursor:', error);
    return false;
  }
}

// Function to get the last cursor for a feed
async function getLastCursor(feedUrl) {
  try {
    console.log('Attempting to get cursor for feed:', feedUrl);
    const result = await browser.storage.local.get('feedCursors');
    console.log('Current cursors in storage:', result);
    const cursor = result.feedCursors?.[feedUrl] || null;
    console.log('Retrieved cursor:', cursor);
    return cursor;
  } catch (error) {
    console.error('Error getting cursor:', error);
    return null;
  }
}

// Function to add the "Return to Previous" button
async function addReturnButton() {
  // Remove existing button if any
  const existingButton = document.getElementById('bsky-return-button');
  if (existingButton) {
    existingButton.remove();
  }

  // Check if we have a cursor for this feed
  const feedUrl = getCurrentFeedUrl();
  const lastCursor = await getLastCursor(feedUrl);
  
  // Only show button if we have a cursor and we're not already using it
  const currentUrl = new URL(window.location.href);
  const currentCursor = currentUrl.searchParams.get('cursor');
  
  if (!lastCursor || currentCursor === lastCursor) {
    return;
  }

  // Create the button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    position: fixed;
    top: 70px;
    right: 20px;
    z-index: 1000;
    display: flex;
    gap: 8px;
    flex-direction: column;
  `;

  // Create the main return button
  const returnButton = document.createElement('button');
  returnButton.id = 'bsky-return-button';
  returnButton.textContent = '↩ Return to Last Session';
  returnButton.style.cssText = `
    background: #2e3f51;
    color: #f1f3f5;
    border: 1px solid rgba(66, 87, 108, 0.5);
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  `;

  returnButton.addEventListener('mouseover', () => {
    returnButton.style.background = '#3a4e63';
    returnButton.style.transform = 'translateY(-1px)';
    returnButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  });

  returnButton.addEventListener('mouseout', () => {
    returnButton.style.background = '#2e3f51';
    returnButton.style.transform = 'translateY(0)';
    returnButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
  });

  // Add click handler
  returnButton.addEventListener('click', async () => {
    const feedUrl = getCurrentFeedUrl();
    const lastCursor = await getLastCursor(feedUrl);
    
    if (!lastCursor) {
      console.log('No previous cursor found for this feed');
      return;
    }

    // Construct the feed URL with the cursor
    const apiUrl = new URL(window.location.href);
    apiUrl.searchParams.set('cursor', lastCursor);
    
    // Force a page reload with the new cursor
    window.location.href = apiUrl.toString();
  });

  buttonContainer.appendChild(returnButton);
  document.body.appendChild(buttonContainer);
}

// Function to extract feed URL from the current page
function getCurrentFeedUrl() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  return params.get('feed') || 'home'; // Use 'home' for the main feed
}

// Intercept and store cursors from feed responses
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  try {
    const url = new URL(args[0]);
    
    // Only process if this is a feed request to bsky.network
    if (url.hostname.includes('bsky.network') && url.pathname.includes('/xrpc/app.bsky.feed.getFeed')) {
      console.log('Processing feed request:', {
        url: url.toString(),
        currentCursor: url.searchParams.get('cursor'),
        feedId: url.searchParams.get('feed')
      });
      
      const response = await originalFetch.apply(this, args);
      
      // Clone the response so we can read it multiple times
      const clone = response.clone();
      
      try {
        // Parse the response
        const data = await clone.json();
        console.log('Feed response:', {
          hasCursor: !!data.cursor,
          cursor: data.cursor,
          feedUrl: url.searchParams.get('feed') || 'home',
          feedLength: data.feed?.length
        });
        
        if (data.cursor) {
          const feedUrl = url.searchParams.get('feed') || 'home';
          console.log('Storing cursor:', {
            feedUrl,
            cursor: data.cursor
          });
          
          await storeCursor(feedUrl, data.cursor);
          console.log('Successfully stored cursor');
          
          // Refresh button visibility after storing new cursor
          setTimeout(addReturnButton, 100);
        } else {
          console.log('No cursor found in response');
        }
      } catch (jsonError) {
        console.error('Error parsing feed response:', jsonError);
      }
    }
    
    return response;
  } catch (error) {
    console.error('Error in fetch interceptor:', error);
    return originalFetch.apply(this, args);
  }
};

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'unhideAll') {
    try {
      // Get current storage
      const storage = localStorage.getItem('BSKY_STORAGE');
      let data = storage ? JSON.parse(storage) : {};
      
      // Clear the hiddenPosts array
      data.hiddenPosts = [];
      
      // Save back to storage
      localStorage.setItem('BSKY_STORAGE', JSON.stringify(data));
      
      console.log('All posts have been un-hidden');
      sendResponse({ success: true });
      
      // Reload the page to show the un-hidden posts
      window.location.reload();
    } catch (error) {
      console.error('Error un-hiding posts:', error);
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'getHiddenCount') {
    // Get current hidden posts from localStorage
    const storage = localStorage.getItem('BSKY_STORAGE');
    const data = storage ? JSON.parse(storage) : {};
    const count = data.hiddenPosts ? data.hiddenPosts.length : 0;
    sendResponse({ count });
  } else if (request.action === 'toggleAutoHide') {
    // When auto-hide is enabled, start fresh with post counting
    if (request.enabled) {
      console.log('Auto-hide enabled, starting observation');
      postScrollCounts.clear(); // Reset counts
      // Start observing DOM changes
      postsObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      startObserving(); // Start observing current posts
    } else {
      console.log('Auto-hide disabled, clearing observation');
      postScrollCounts.clear(); // Clear the counts
      // Stop observing all current posts
      document.querySelectorAll('[data-testid^="feedItem-"]').forEach(post => {
        observer.unobserve(post);
      });
      // Stop observing DOM changes
      postsObserver.disconnect();
    }
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async response
});

function startObserving() {
  // Only observe if we're on the main feed or a list
  if (!isMainFeedOrList()) {
    console.log('Not on main feed or list, skipping observation');
    return;
  }

  const posts = document.querySelectorAll('[data-testid^="feedItem-"]');
  console.log(`Found ${posts.length} posts to observe`);
  
  posts.forEach(post => {
    // Only observe posts we haven't seen before
    if (!postScrollCounts.has(post)) {
      observer.observe(post);
    }
  });
}

// Watch for any changes to the page content
const postsObserver = new MutationObserver(startObserving);

// Only start observing if auto-hide is enabled
chrome.storage.local.get(['autoHide'], (result) => {
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

// Watch for URL changes since Bluesky is a single-page app
let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, checking if we should start/stop observation');
    
    // If we're not on the main feed or a list, stop observing
    if (!isMainFeedOrList()) {
      console.log('Left main feed/list, stopping observation');
      postScrollCounts.clear();
      document.querySelectorAll('[data-testid^="feedItem-"]').forEach(post => {
        observer.unobserve(post);
      });
      postsObserver.disconnect();
    } else {
      // If we're back on the main feed or a list and auto-hide is enabled, start observing
      chrome.storage.local.get(['autoHide'], (result) => {
        if (result.autoHide === true) {
          console.log('Back on main feed or list, starting observation');
          postsObserver.observe(document.body, { 
            childList: true, 
            subtree: true 
          });
          startObserving();
        }
      });
    }
  }
}).observe(document, { subtree: true, childList: true });

// Watch for URL changes to update the button visibility
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Add small delay to ensure DOM is ready
    setTimeout(addReturnButton, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Initial button setup
setTimeout(addReturnButton, 500);

// Add storage change listener for debugging
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.feedCursors) {
    console.log('Feed cursors changed:', {
      oldValue: changes.feedCursors.oldValue,
      newValue: changes.feedCursors.newValue
    });
  }
});

console.log('Initial setup complete, watching for posts...');
