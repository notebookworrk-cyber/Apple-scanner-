# Apple Quality Scanner

AI-powered fruit quality detection in the browser using TensorFlow.js.

## Tech Stack

- **Framework:** Vanilla JS (ES Modules)
- **Build:** Vite 5
- **AI:** TensorFlow.js (browser-side inference)
- **Storage:** IndexedDB (scan history)
- **PWA:** Service worker + manifest

## Setup

```bash
npm install
npm run dev
```

## Features

- Real-time camera capture
- TF.js model inference for apple quality classification
- Color-analysis fallback when no model is available
- Scan history with IndexedDB persistence
- Gallery/image upload support
- PWA installable

## Coming Soon

- [ ] Screenshot
- [ ] Build status badge
- [ ] Coverage badge

## License

MIT
