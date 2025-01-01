// content.js
/* This script automatically hides posts after they've been scrolled past multiple times.
   It works by:
   1. Watching for posts to be dynamically loaded into the page
   2. Observing all post cards on the page (identified by data-testid="feedItem-*")
   3. Counting how many times each post is scrolled past
   4. Automatically clicking the post options menu and then the hide button when threshold is reached
   
   The script uses MutationObserver to detect when new posts are added to the page,
   and IntersectionObserver to track when posts are scrolled past.
*/

const postScrollCounts = new Map();

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    console.log(`Post intersection changed:`, {
      isIntersecting: entry.isIntersecting,
      currentCount: postScrollCounts.get(entry.target) || 0,
      postId: entry.target.getAttribute('data-testid')
    });
    
    if (!entry.isIntersecting) {
      const newCount = (postScrollCounts.get(entry.target) || 0) + 1;
      postScrollCounts.set(entry.target, newCount);
      console.log(`Post scroll count increased to ${newCount}`);
      
      if (newCount >= 2) {
        console.log(`Threshold reached (${newCount} >= 2), attempting to hide post`);
        hidePost(entry.target);
      }
    }
  });
});

function findReactInstance(element) {
  const keys = Object.keys(element);
  const fiberKey = keys.find(key => key.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  
  let fiber = element[fiberKey];
  while (fiber) {
    if (fiber.memoizedProps && typeof fiber.memoizedProps.onHide === 'function') {
      return fiber;
    }
    if (fiber.memoizedProps && typeof fiber.memoizedProps.onConfirm === 'function') {
      return fiber;
    }
    fiber = fiber.return;
  }
  return null;
}

function hideUIElement(element) {
  if (!element) return;
  // Store original styles
  const originalStyles = {
    visibility: element.style.visibility,
    opacity: element.style.opacity,
    position: element.style.position,
  };
  
  // Hide the element
  element.style.visibility = 'hidden';
  element.style.opacity = '0';
  element.style.position = 'absolute';
  
  return originalStyles;
}

function restoreUIElement(element, originalStyles) {
  if (!element || !originalStyles) return;
  element.style.visibility = originalStyles.visibility;
  element.style.opacity = originalStyles.opacity;
  element.style.position = originalStyles.position;
}

function hidePost(post) {
  console.log('Looking for post component...', post);
  
  // Try to find the post's React instance
  const instance = findReactInstance(post);
  if (instance && instance.memoizedProps.onHide) {
    console.log('Found post component with onHide method, calling directly...');
    instance.memoizedProps.onHide();
    postScrollCounts.delete(post);
    return;
  }
  
  // Fallback to UI interaction if we couldn't find the direct method
  console.log('Falling back to UI interaction...');
  const optionsBtn = post.querySelector('[data-testid="postDropdownBtn"]');
  if (optionsBtn) {
    console.log('Post options button found, clicking...');
    optionsBtn.click();
    
    setTimeout(() => {
      // Hide the dropdown menu
      const dropdownMenu = document.querySelector('[data-radix-popper-content-wrapper]');
      const dropdownStyles = hideUIElement(dropdownMenu);
      
      const hideBtn = document.querySelector('[data-testid="postDropdownHideBtn"]');
      if (hideBtn) {
        console.log('Hide button found in dropdown, clicking...');
        hideBtn.click();
        
        setTimeout(() => {
          // Hide the confirmation dialog
          const confirmDialog = document.querySelector('[role="dialog"]');
          const dialogStyles = hideUIElement(confirmDialog);
          
          const confirmBtn = document.querySelector('[data-testid="confirmBtn"]');
          if (confirmBtn) {
            console.log('Confirmation button found, clicking...');
            confirmBtn.click();
            postScrollCounts.delete(post);
            
            // Restore UI elements after a short delay
            setTimeout(() => {
              restoreUIElement(dropdownMenu, dropdownStyles);
              restoreUIElement(confirmDialog, dialogStyles);
              // Click outside to ensure cleanup
              document.body.click();
            }, 50);
          }
        }, 50);
      }
    }, 50);
  } else {
    console.warn('Post options button not found');
  }
}

function startObserving() {
  console.log('Checking for posts...');
  // Updated selector to match the actual feed item structure
  const posts = document.querySelectorAll('[data-testid^="feedItem-"]');
  console.log(`Found ${posts.length} posts to observe`);
  
  if (posts.length === 0) {
    // If no posts found, we're probably too early. Let's check the DOM structure
    console.log('DOM current state:', {
      feedPresent: !!document.querySelector('[role="main"]'),
      bodyChildren: document.body.children.length
    });
  }
  
  posts.forEach(post => {
    // Only observe posts we haven't seen before
    if (!postScrollCounts.has(post)) {
      observer.observe(post);
      console.log('Started observing new post:', {
        postId: post.getAttribute('data-testid'),
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Watch for any changes to the page content
const postsObserver = new MutationObserver((mutations) => {
  console.log('DOM mutation detected:', {
    numberOfMutations: mutations.length,
    timestamp: new Date().toISOString()
  });
  startObserving();
});

// Observe the entire document for changes
postsObserver.observe(document.body, { 
  childList: true, 
  subtree: true 
});

console.log('Initial setup complete, watching for posts...');
startObserving();

// Additional check after a short delay to catch initial page load
setTimeout(() => {
  console.log('Running delayed check for posts...');
  startObserving();
}, 2000);