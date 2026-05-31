# VectorTrace Progress Log

## (26-May-2026)

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

Building in Public Twitter/X Thread: https://x.com/VVNG0cWBPP4oLu3

## (27-May-2026)

- **Calm Japanese Sakura Theme**: Implemented a smooth CSS-based theme switcher supporting Dark and Sakura Light modes.
- **Export Controls**: Created schema exporter actions supporting formatted JSON and escaped CSV downloads.
- **Extraction Results Panel**: Built dynamic popup results display supporting OK, HEALED, and broken selectors with a recovery trigger.
- **Change Detection ML Flow**: Wired background, content script, and popup hooks to load stored embeddings, request page element enumeration, chunk generate embeddings, rank similarity, and return best recovery candidates.
- **Change Detection UI Component**: Implemented popup candidate selector with confidence badges, percentage similarity scores, content text previews, and green pulsing target highlights on the page.
- **Manual Test Plan**: Outlined Hacker News, Amazon, and Wikipedia manual validation steps and edge-cases.
- **ML Pipeline Tuning**:
  - Increased embedding candidate search chunk size from 10 to 25 to reduce async rounds and accelerate candidate matching.
  - Removed longest-text sorting from candidate extraction, allowing shorter, distinctive elements to rank correctly.
  - Added caching of page element embeddings to prevent redundant runs and speed up recovery.
- **UX & Clipboard Enhancements**:
  - Added hover-triggered clipboard copy buttons for extraction values.
  - Replaced aggressive toast animations with smooth, premium slide-up animations.
- **Drag-and-Drop Reordering**: Built custom pointer-events drag-and-drop field reordering inside the schema manager list, replacing HTML5 Native Drag & Drop.
  - Implemented continuous, speed-scaling boundaries auto-scroll via a `requestAnimationFrame` loop.
  - Enabled mouse scroll-wheel events to fire normally while holding/dragging a card.
  - Resolved upward-cascading swaps by restricting updates to immediate neighbors only.
  - Eliminated React state lag/closure bugs by storing list data in a mutable `localFieldsRef` reference.
- **Theme-Aware Scrollbars**: Implemented webkit custom scrollbar styles mapped to the popup container (`theme-dark` / `theme-sakura`) to fit aesthetics seamlessly.
- **Card Glow & Clipping Fixes**: Replaced outer ring outlines with soft, theme-matching neon shadows (`shadow-blue` / `shadow-pink`) at `scale-[1.02]` scale and padded the `ul` list wrapper (`px-2.5`) to prevent horizontal layout cuts during drags.
- **Dynamic "NEW" Badges**: Added persistent, theme-aware `"NEW"` tag pills displaying for 15 seconds on newly created fields (retaining their visibility across popup closures).
- **Element Picker Upgrades**:
  - Added 40-character content previews inside the picker hover tooltip.
  - Disabled "Add Field" and "Extract" actions during selection to avoid duplicate picker sessions.
  - Added a picker cancellation listener to safely reset states when escaping.
- **Theme-Aware Database Reset**: Preserved custom theme states during database resets and transitioned the popup smoothly without hard page reloads.
- **Tailwind Color Extension**: Extended config to support custom gray palettes (250, 550, 650, 750, 850) inside the stylesheet.

## (29-May-2026)

Hardening pass to take the codebase from broken-and-incomplete to complete-and-production-ready.

- **TypeScript Zero-Error**: Fixed all 16 pre-existing `tsc` errors:
  - `plugins/vite-plugin-onnx-bundle.ts`: replaced the unresolvable `import type { Plugin } from "vite"` (vite is only a transitive WXT dependency, not a direct one) with minimal structural types; typed the `configResolved` parameter.
  - `background/embedding-pipeline.ts`: typed the service-worker `self.clients` access via a `ServiceWorkerLike` shape and removed the `@ts-expect-error` hacks around `chrome.runtime.getContexts`.
  - `content/selector-generator.ts`: widened public signatures from `HTMLElement` to `Element` so SVG nodes (e.g. `clipPath`) type-check (fixes the SVG test).
  - `entrypoints/offscreen/index.ts`: stopped reassigning the read-only `env.backends.onnx.wasm` object (mutate fields in place), and typed the pipeline to the `"feature-extraction"` literal to satisfy `PipelineType`.
  - `entrypoints/options/App.tsx` & `popup/hooks/useSchema.ts`: narrowed `chrome.storage.local.get` results with `typeof` guards instead of unsafe truthy checks.
  - `shared/chrome-storage.test.ts`: added the missing required `url` field to the mock `FieldDefinition`.
- **Feature 1 — Distinct Failure States (Reddit request)**: Verified and tightened the end-to-end wiring of all six statuses (`OK`, `HEALED`, `SELECTOR_BROKEN`, `TEXT_CONTENT_CHANGED`, `ELEMENT_HIDDEN`, `EMPTY_PAGE`). A resolved-but-now-empty element is now reported as `TEXT_CONTENT_CHANGED` instead of a silent empty `OK`. Added a **Field Health Summary** banner to the Results tab with an overall diagnosis and per-status count pills, and per-status diagnosis tooltips.
- **Feature 2 — HEALED Status Wiring**: Added `shared/heal-tracker.ts` to persist a short-lived "pending heal" (`healedFrom → healedTo`, keyed by `fieldId`) in `chrome.storage.local`. Accepting a candidate now records the old selector before overwriting it; `content.ts` consumes pending heals during the next extraction and stamps successful fields as `HEALED` with `healedFrom`/`healedTo`. The badge consumes once, so it only shows for the run immediately after healing.
- **Offscreen Self-Warming**: Rewrote `offscreen/index.ts` to cache a single feature-extraction pipeline, expose a `getEmbeddingPipeline()` warm-up, and added a self-initializing warm-up IIFE at the bottom so the model re-warms automatically whenever Chrome recreates the offscreen document. Warm-up failures are non-fatal and retried lazily.
- **Reliability Hardening**:
  - Robust offscreen lifecycle: modern `chrome.runtime.getContexts` with a `clients` fallback, race-safe creation that treats "single offscreen document" errors as success, and transparent recreation after teardown.
  - Added a 60s watchdog timeout to `generateEmbedding` so an unresponsive offscreen document never hangs the caller.
  - Added `catch` handlers to clipboard writes and normalized all content/background `console.log` calls to `[content]` / `[background]` prefixes.
- **Auto-Heal (wired existing Options UI)**: Implemented `shared/settings.ts` (`getHealingSettings`) and `popup/hooks/useAutoHeal.ts`. Enabled and persisted the previously-disabled "Heal without prompting" toggle and confidence-threshold slider (split into a working "Self-Healing" section, with Gemini kept as a clearly-labeled preview). After extraction, broken/drifted fields are auto-repaired when the top candidate clears the threshold, followed by a re-extraction to surface `HEALED` badges.
- **Results Conveniences**: Added a **Re-run** button to the Results header and upgraded **Copy JSON** to emit a structured snapshot (schema, URL, timestamp, and each field's label/value/status).
- **Convention Cleanup**: Converted all React component prop definitions from `interface` to `type` per project convention.
- **Tests**: Added unit tests for the new `TEXT_CONTENT_CHANGED` (drift + empty) and `EMPTY_PAGE` paths, plus full coverage for `heal-tracker` and `settings`. Suite grew from 28 → 37 passing tests.
- **Verification**: `pnpm test` (37 passing), `pnpm lint` (clean), `tsc --noEmit` (0 errors), and `pnpm build` (succeeds) all green. No new runtime dependencies were introduced.

## (31-May-2026)

- **Drift Detection Architecture Fix**: Implemented a robust 3-phase detection algorithm (selector resolution -> identity verification -> page search fallback) to completely eliminate cascading false positives caused by `nth-of-type` index shifts when sibling elements are added or removed.
- **Structural Drift Detection**: Added `tagName` tracking to `FieldDefinition` captured at selection time, and introduced a new `TAG_CHANGED` extraction status to explicitly differentiate structural DOM changes (e.g., `<h1>` changing to `<p>`) from mere text content drift.
- **Strict Text Matching**: Replaced the overly lenient Jaccard similarity in `isTextMatch` with a strict exact normalized match and substring containment check. The new page search fallback safely handles cases where selectors break or drift.
- **UI Updates**: Wired the new `TAG_CHANGED` status into the `FieldCard` component, treating it with the same red pulsing visual indicator as `SELECTOR_BROKEN`.
- **Comprehensive Test Suite**: Rewrote `text-extractor.test.ts` growing from 17 to 20 tests that simulate real-world `example.com` DOM mutations, ensuring tag swaps, number additions, and nth-of-type shifts are resolved correctly. All 47 tests across the project are green.
