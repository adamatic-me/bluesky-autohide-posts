// popup.js - Handles the extension popup UI interactions

// Use the appropriate API namespace (chrome or browser)
const api = typeof browser !== 'undefined' ? browser : chrome;

// Function to update the post count
function updatePostCount() {
  const countElement = document.getElementById('count');
  
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('bsky.app')) {
      countElement.textContent = 'Please open this on bsky.app';
      return;
    }
    
    // Get the count from the content script
    api.tabs.sendMessage(tabs[0].id, { action: 'getHiddenCount' }, (response) => {
      if (api.runtime.lastError || !response) {
        countElement.textContent = 'Could not get post count';
        return;
      }
      
      const count = response.count;
      countElement.textContent = count === 1 ? '1 Post Hidden' : `${count} Posts Hidden`;
    });
  });
}

// Function to update toggle state text based on checkbox state
function updateToggleStateText(isChecked) {
  const toggleState = document.getElementById('toggleState');
  toggleState.textContent = isChecked ? 'Enabled' : 'Disabled';
}

// Function to handle toggle switch state
function handleToggle() {
  const toggle = document.getElementById('autoHideToggle');
  
  // Load the current state from storage
  api.storage.local.get(['autoHide'], (result) => {
    const isAutoHideOn = result.autoHide === true;
    toggle.checked = isAutoHideOn;
    updateToggleStateText(isAutoHideOn); // Update initial state text
  });
  
  toggle.addEventListener('change', () => {
    const newState = toggle.checked;
    // Save to storage
    api.storage.local.set({ autoHide: newState }, () => {
      updateToggleStateText(newState);
      
      // Notify content script of the change
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('bsky.app')) {
          api.tabs.sendMessage(tabs[0].id, { 
            action: 'toggleAutoHide', 
            enabled: newState 
          });
        }
      });
    });
  });
}

// Function to update the cursor debug display
function updateCursorDebug() {
  const cursorDebug = document.getElementById('cursorDebug');
  console.log('Updating cursor debug display...');
  
  api.storage.local.get(['feedCursors'], (result) => {
    console.log('Retrieved feed cursors:', result.feedCursors);
    const feedCursors = result.feedCursors || {};
    
    if (Object.keys(feedCursors).length === 0) {
      console.log('No cursors found in storage');
      cursorDebug.innerHTML = '<div class="cursor-item">No cursors stored yet</div>';
      return;
    }
    
    cursorDebug.innerHTML = Object.entries(feedCursors)
      .map(([feedId, cursors]) => `
        <div class="feed-cursors">
          <div class="feed-id">${feedId}</div>
          ${cursors.map((cursor, i) => `
            <div class="cursor-item">${i + 1}: ${cursor}</div>
          `).join('')}
        </div>
      `).join('');
    console.log('Updated cursor debug display with', Object.keys(feedCursors).length, 'feeds');
  });
}

// Update count and debug info when popup opens
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup opened, initializing...');
  updatePostCount();
  handleToggle();
  updateCursorDebug();
  
  // Set up refresh button
  const refreshButton = document.getElementById('refresh');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      console.log('Refresh clicked, updating displays...');
      updatePostCount();
      updateCursorDebug();
    });
  }
  
  // Handle un-hide button click
  document.getElementById('unhideAll').addEventListener('click', () => {
    const status = document.getElementById('status');
    status.textContent = 'Un-hiding all posts...';
    
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        status.textContent = 'Error: No active tab found';
        return;
      }
      
      api.tabs.sendMessage(tabs[0].id, { action: 'unhideAll' }, (response) => {
        if (api.runtime.lastError || !response) {
          status.textContent = 'Error: Could not un-hide posts';
          return;
        }
        
        status.textContent = 'All posts un-hidden!';
        updatePostCount();
      });
    });
  });
});
