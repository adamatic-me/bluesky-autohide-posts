// popup.js - Handles the extension popup UI interactions

// Function to update the post count
function updatePostCount() {
  const countElement = document.getElementById('count');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('bsky.app')) {
      countElement.textContent = 'Please open this on bsky.app';
      return;
    }
    
    // Get the count from the content script
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getHiddenCount' }, (response) => {
      if (chrome.runtime.lastError || !response) {
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
  
  // Load the current state from chrome.storage.local
  chrome.storage.local.get(['autoHide'], (result) => {
    const isAutoHideOn = result.autoHide === true;
    toggle.checked = isAutoHideOn;
    updateToggleStateText(isAutoHideOn); // Update initial state text
  });
  
  toggle.addEventListener('change', () => {
    const newState = toggle.checked;
    // Save to chrome.storage.local
    chrome.storage.local.set({ autoHide: newState }, () => {
      updateToggleStateText(newState);
      
      // Notify content script of the change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('bsky.app')) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'toggleAutoHide', 
            enabled: newState 
          });
        }
      });
    });
  });
}

// Update count when popup opens
document.addEventListener('DOMContentLoaded', () => {
  updatePostCount();
  handleToggle();
});

// Handle un-hide button click
document.getElementById('unhideAll').addEventListener('click', () => {
  const status = document.getElementById('status');
  
  // Get the current tab to send a message to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      status.textContent = 'Error: Could not find current tab';
      return;
    }
    
    const tab = tabs[0];
    if (!tab.url || !tab.url.includes('bsky.app')) {
      status.textContent = 'Please open this on bsky.app';
      return;
    }
    
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, { action: 'unhideAll' }, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Error: Could not communicate with the page';
        return;
      }
      
      if (response && response.success) {
        status.textContent = 'All posts have been un-hidden!';
        // Update the count after unhiding
        updatePostCount();
      } else {
        status.textContent = response?.error || 'Error: Could not un-hide posts';
      }
    });
  });
});
