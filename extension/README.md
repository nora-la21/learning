# Dutch Vocabulary Helper — Browser Extension

Select any Dutch word, phrase, or sentence on any webpage to get an instant translation and add it to your vocabulary list.

## Loading in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The extension icon (🇳🇱) will appear in your toolbar

## Usage

1. Make sure the vocabulary app backend is running (`cd backend && uvicorn main:app --reload`)
2. Visit any Dutch webpage
3. Select a word, phrase, or sentence with your mouse
4. A popup appears with the English translation
5. Choose a vocabulary list and click **+ Add**

The last-used list is remembered automatically.

## Notes

- Phrases and full sentences are supported — the translation handles idiomatic meaning
- Words already in the selected list are returned as-is (no duplicates)
- Click the extension icon to check whether the backend is reachable
