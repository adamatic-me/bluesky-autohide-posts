// content.js
/* This script automatically hides posts after they've been scrolled past multiple times.
   It works by:
   1. Watching for posts to be dynamically loaded into the page
   2. Tracking how many times each post is scrolled past
   3. Adding the post's AT Protocol URI to localStorage's hiddenPosts array when threshold is reached
   
   The script directly modifies localStorage to mark posts as hidden.
*/

const postScrollCounts = new Map();

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) {
      const newCount = (postScrollCounts.get(entry.target) || 0) + 1;
      postScrollCounts.set(entry.target, newCount);
      console.log(`Post scroll count increased to ${newCount}`);
      
      if (newCount >= 2) {
        console.log(`Threshold reached (${newCount} >= 2), hiding post`);
        hidePost(entry.target);
      }
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
    return true; // Keep the message channel open for the async response
  }
  
  if (request.action === 'getHiddenCount') {
    try {
      // Get current storage
      const storage = localStorage.getItem('BSKY_STORAGE');
      const data = storage ? JSON.parse(storage) : {};
      const count = data.hiddenPosts?.length || 0;
      
      sendResponse({ count });
    } catch (error) {
      console.error('Error getting hidden post count:', error);
      sendResponse({ count: 0 });
    }
    return true; // Keep the message channel open for the async response
  }
});

function startObserving() {
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

// Observe the entire document for changes
postsObserver.observe(document.body, { 
  childList: true, 
  subtree: true 
});

console.log('Initial setup complete, watching for posts...');
startObserving();
