# VectorTrace Progress Log

## Project Accomplishments

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