# VectorTrace Progress Log

## Project Accomplishments (26-May-2026)

- **Scaffolding**: Initialized WXT project template with React and Tailwind CSS.
- **Dependencies**: Installed `@huggingface/transformers`, `idb`, and testing packages.
- **Data Models**: Defined database structures and messages in `types.ts`.
- **Chrome Storage**: Created typed CRUD storage helpers with unit tests.
- **Documentation**: Updated roadmap docs for a Firefox-first deployment.
- **Global Mocking**: Resolved test linter errors using type intersections instead of `any`.
- **Element Picker**: Built a DOM hover overlay with a tag tooltip and Escape cancellation.
- **Content Script**: Activated picker on `START_SELECTION` and emitted selected results.
- **CSS Selectors**: Generated robust paths prioritizing IDs, data attributes, and `:nth-of-type` siblings.
- **XPath Selectors**: Built tag-indexed paths with case-sensitive SVG and cross-origin iframe checks.
- **Length Guards**: Limited all CSS and XPath selectors to 500 characters.
- **Unit Testing**: Exchanged Vitest environment to `jsdom` to test selector generation correctness.
- **ONNX Bundle Plugin**: Created a Vite bundler plugin that automatically copies WebAssembly files (`.wasm`) from `onnxruntime-web` to the build output.
- **WXT Config**: Configured the ONNX bundler plugin and declared `transformers/*` web-accessible resources.
- **Embedding Pipeline**: Created a lazy-initializing embedding pipeline module using `all-MiniLM-L6-v2` with local WASM overrides for MV3 CSP.
- **Similarity Scoring**: Built cosine similarity computation and candidate ranking utilities with unit tests.
- **Message Routing**: Integrated service worker message handlers to process embedding generation, similarity matching, and field upserts to storage.
- **IndexedDB Storage**: Built an IndexedDB persistence layer using `idb` to store heavy field embeddings with index support.
- **Chrome Storage Split**: Updated `saveSchema` to strip high-dimensional embeddings before local storage writes to fit space limits.
- **Selected Fields Pipeline**: Updated the background service worker to write complete fields to IndexedDB on `FIELD_SELECTED`.
- **Content Security Policy**: Allowed WASM execution (`wasm-unsafe-eval`) and Hugging Face CDN connections under Manifest V3.
- **WXT Dev HMR Support**: Whitelisted local loopbacks and WebSockets in CSP to support hot-reloads during `pnpm dev`.
- **ONNX Bundle Expansion**: Updated `vite-plugin-onnx-bundle` to copy ES module workers (`.mjs`) alongside WASM binaries to prevent missing worker fetch errors.

## Week 2 Accomplishments (27-May-2026)

- **Calm Japanese Sakura Theme**: Implemented a smooth CSS-based theme switcher supporting Dark and Sakura Light modes.
- **Export Controls**: Created schema exporter actions supporting formatted JSON and escaped CSV downloads.
- **Extraction Results Panel**: Built dynamic popup results display supporting OK, HEALED, and broken selectors with a recovery trigger.
- **Change Detection ML Flow**: Wired background, content script, and popup hooks to load stored embeddings, request page element enumeration, chunk generate embeddings, rank similarity, and return best recovery candidates.
- **Change Detection UI Component**: Implemented popup candidate selector with confidence badges, percentage similarity scores, content text previews, and green pulsing target highlights on the page.
- **Manual Test Plan**: Outlined Hacker News, Amazon, and Wikipedia manual validation steps and edge-cases.

Building in Public Twitter/X Thread: [https://x.com/sathiyasenpai/status/1794711823901923481](https://x.com/sathiyasenpai/status/1794711823901923481)