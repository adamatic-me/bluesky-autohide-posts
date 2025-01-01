# Bluesky Auto-Hide Extension

I got tired of seeing the same posts over and over again in my feeds. This is a browser extension that automatically hides Bluesky posts after you've scrolled past them, helping to reduce repetitive content in your feed.

If you have any suggestions or feedback, please open an issue on GitHub, or create a pull request if you would like to contribute.

## Features

- **Auto-Hide**: Automatically hides posts after you've scrolled past them twice
- **Toggle Control**: Easily enable/disable the auto-hide functionality
- **Post Counter**: Shows how many posts are currently hidden
- **Un-hide All**: One-click option to restore all hidden posts
- **State Persistence**: Remembers your enabled/disabled preference between browser sessions

## How It Works

1. When enabled, the extension tracks each post as you scroll past it
2. After scrolling past a post, it's automatically added to Bluesky's hidden posts list in the broswer's local storage
3. Hidden posts won't appear in your feed until you choose to un-hide them. Pressing the "Un-hide All" button will restore all hidden posts
4. The extension uses Bluesky's built-in post hiding functionality, so it works seamlessly with the platform

## Concerns
1. This extention is entirely experimental and may have bugs
2. I have no idea what will happen once you have hundreds or thousands of hidden posts. Performance could be an issue. I recommend you use Un-hide All if you have a lot of hidden posts.

## Installation

### Firefox
1. Download the extension files
2. Go to `about:debugging` in Firefox
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension folder and select `manifest.json`

### Chrome
1. Download the extension files
2. Go to `chrome://extensions/` in Chrome
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Click the extension icon in your browser toolbar to open the popup
2. Toggle the switch to enable/disable auto-hiding
3. The toggle will show "Enabled" when active and "Disabled" when inactive
4. Use the "Un-hide All Posts" button to restore all hidden posts
5. The counter shows how many posts are currently hidden

## Technical Details

The extension uses:
- Chrome/Firefox Extension APIs for storage and tab communication
- IntersectionObserver API to track post visibility
- Bluesky's local storage for managing hidden posts
- Modern JavaScript with async/await patterns
- CSS custom properties for styling

## Privacy

The extension:
- Only runs on bsky.app
- Doesn't collect any user data
- Doesn't make any external network requests
- Only modifies Bluesky's local storage for post hiding
- All functionality happens locally in your browser

## License

MIT License - Feel free to modify and distribute as needed.
