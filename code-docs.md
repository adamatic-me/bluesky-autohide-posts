# Bluesky Auto-Hide Extension Documentation

## Overview
The Bluesky Auto-Hide extension is a browser extension for Firefox and Chrome designed to enhance the browsing experience on Bluesky (bsky.app) by automatically hiding posts that users have already scrolled past. This helps reduce clutter and makes it easier to track new content.

## Cross-Browser Compatibility
The extension is built to work seamlessly on both Firefox and Chrome browsers. This is achieved through:

1. **Standard Web Extension API Usage**:
   - Uses the WebExtension API standard supported by both browsers
   - Avoids browser-specific APIs where possible
   - Uses `chrome.*` namespace which is aliased to `browser.*` in Firefox

2. **Storage Compatibility**:
   - Uses `chrome.storage.local` which is compatible with both browsers
   - Firefox automatically maps `chrome.storage` to `browser.storage`
   - LocalStorage implementation works identically across browsers

3. **DOM Manipulation**:
   - Uses standard DOM APIs for post detection and manipulation
   - Intersection Observer API is supported in both browsers
   - All CSS selectors and DOM queries are browser-agnostic

## Architecture

### 1. Extension Structure
- `manifest.json`: Extension configuration and permissions
- `content.js`: Main functionality for post detection and hiding
- `popup.html/js`: User interface for controlling the extension
- `icons/`: Extension icons in various sizes

### 2. Core Components

#### 2.1 Post Detection System (`content.js`)
The extension uses the Intersection Observer API to track post positions relative to the viewport. Key features:

- **Feed Detection**: 
  ```javascript
  function isMainFeedOrList()
  ```
  Determines if the current page is either:
  - Main feed (https://bsky.app/)
  - List feed (URLs containing /lists/)

- **Post Tracking**:
  The extension creates an IntersectionObserver that monitors posts as they move through the viewport:
  - Tracks posts that are one viewport height above the current view
  - Uses a 200% rootMargin to ensure proper detection
  - Only processes posts when auto-hide is enabled

- **Post Identification**:
  ```javascript
  function getPostATUri(post)
  ```
  Extracts unique identifiers for posts using:
  - DID (Decentralized Identifier) from avatar images
  - Post ID from post URLs
  Creates AT-URI format: `at://{did}/app.bsky.feed.post/{postId}`

#### 2.2 Storage System
The extension uses two storage mechanisms:

1. **Chrome Storage (`chrome.storage.local`)**:
   - Stores extension settings (enabled/disabled state)
   - Persists across browser sessions
   - Used for extension-wide configuration

2. **LocalStorage**:
   - Stores hidden post URIs
   - Format: `BSKY_STORAGE` key with structure:
     ```javascript
     {
       hiddenPosts: [/* array of post URIs */]
     }
     ```

#### 2.3 User Interface (`popup.html`, `popup.js`)

The popup provides a clean, modern interface with:

1. **Toggle Switch**:
   - Enables/disables auto-hiding functionality
   - Persists state in chrome.storage
   - Updates content script behavior in real-time

2. **Post Counter**:
   - Displays current number of hidden posts
   - Updates dynamically when posts are hidden/unhidden

3. **Un-hide All Button**:
   - Clears all hidden posts
   - Reloads the page to show previously hidden content

### 3. Key Processes

#### 3.1 Post Hiding Process
1. Post is detected scrolling above viewport
2. AT-URI is generated for the post
3. Post is added to hiddenPosts array in localStorage
4. UI is updated to reflect new hidden post count

#### 3.2 URL Change Handling
The extension monitors URL changes since Bluesky is a single-page application:
- Detects navigation between different pages
- Starts/stops observation based on current page type
- Ensures proper functionality across different Bluesky sections

## Technical Details

### Permissions
- `storage`: For saving extension settings
- `tabs`: For interacting with browser tabs
- Host permissions: Limited to `*://bsky.app/*`

### Performance Considerations
1. Uses efficient IntersectionObserver for scroll detection
2. Implements event delegation for DOM monitoring
3. Minimal localStorage operations to reduce performance impact

### Security Measures
1. Strict URL checking before executing functionality
2. Sanitized storage operations
3. Protected message passing between components

## Extension States

### Enabled State
- Actively monitors scroll position
- Hides posts automatically
- Updates post count in real-time
- Maintains hidden posts list

### Disabled State
- Stops monitoring scroll position
- Keeps existing hidden posts in storage
- Maintains UI functionality for unhiding posts

## User Experience Features

1. **Visual Feedback**:
   - Clear enabled/disabled status
   - Post count display
   - Operation status messages

2. **Control Options**:
   - Toggle auto-hide functionality
   - Bulk unhide capability
   - Immediate feedback on actions

3. **Error Handling**:
   - Graceful degradation when errors occur
   - Clear error messages
   - Recovery options for failed operations

## Last Updated
2025-01-07T16:58:58Z
