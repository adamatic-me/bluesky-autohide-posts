// content.js
/* This script automatically hides posts after they've been scrolled past multiple times.
   It works by:
   1. Checking if we're on the main feed (https://bsky.app/)
   2. Watching for posts to be dynamically loaded into the page
   3. Tracking how many times each post is scrolled past
   4. Adding the post's AT Protocol URI to localStorage's hiddenPosts array when threshold is reached
   
   The script directly modifies localStorage to mark posts as hidden.
   The extension's enabled/disabled state is stored in chrome.storage.local.
*/

const postScrollCounts = new Map();

// Function to check if we're on the main feed
function isMainFeed() {
  // Only run on exactly https://bsky.app/ or https://bsky.app
  const url = window.location.href;
  return url === 'https://bsky.app/' || url === 'https://bsky.app';
}

const observer = new IntersectionObserver((entries) => {
  // Only process if we're on the main feed
  if (!isMainFeed()) return;

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
  // Only observe if we're on the main feed
  if (!isMainFeed()) {
    console.log('Not on main feed, skipping observation');
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
    // Only observe if we're on the main feed
    if (isMainFeed()) {
      // Observe the entire document for changes
      postsObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
      startObserving();
    } else {
      console.log('Not on main feed, not starting observation');
    }
  } else {
    console.log('Auto-hide is disabled, not starting observation');
  }
});

// Listen for URL changes since Bluesky is a single-page app
let lastUrl = window.location.href;
new MutationObserver(() => {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, checking if we should start/stop observation');
    
    // If we're not on the main feed, stop observing
    if (!isMainFeed()) {
      console.log('Left main feed, stopping observation');
      postScrollCounts.clear();
      document.querySelectorAll('[data-testid^="feedItem-"]').forEach(post => {
        observer.unobserve(post);
      });
      postsObserver.disconnect();
    } else {
      // If we're back on the main feed and auto-hide is enabled, start observing
      chrome.storage.local.get(['autoHide'], (result) => {
        if (result.autoHide === true) {
          console.log('Back on main feed, starting observation');
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

console.log('Initial setup complete, watching for posts...');
