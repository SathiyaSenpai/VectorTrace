# VectorTrace

> Point-and-click web scraping that heals itself. 100% local, on-device AI. Zero servers.

VectorTrace is an open-source, local-first **Chrome Extension (Manifest V3)** for visually
defining scraper fields on any webpage. When a site redesigns and a CSS selector breaks,
instead of failing silently VectorTrace uses **semantic embeddings** (384-dim vectors from
`all-MiniLM-L6-v2`) to find the element that most closely matches what you originally
selected even if the HTML structure changed completely.

Everything runs in your browser via WebAssembly. **No servers. No APIs. No data leaves your
device.**

---

## Why VectorTrace?

Traditional scrapers break the moment a website changes its markup, and they usually fail
with a single unhelpful "selector not found". VectorTrace is different:

- **It tells you _why_ a field failed** : broken selector, drifted content, hidden element,
  or empty page — with distinct, explainable statuses.
- **It repairs itself** : semantic matching finds the new home of your data and rewrites the
  selector, manually or automatically.
- **It respects your privacy** : all inference runs locally in an offscreen WASM runtime.

---

## Key Features

- **Point and Click Picker** Visually capture fields; robust CSS + XPath selectors are
  generated automatically (ID / `data-*` / `:nth-of-type` strategies, SVG-aware, 500-char
  capped).
- **Distinct Failure States** `OK`, `HEALED`, `SELECTOR_BROKEN`, `TEXT_CONTENT_CHANGED`,
  `ELEMENT_HIDDEN`, `EMPTY_PAGE`, each with a badge and a one-line diagnosis.
- **Semantic Self-Healing** On-device cosine-similarity ranking of page elements against
  the stored embedding, with confidence-scored candidates and page preview highlights.
- **Auto-Heal (optional)** Automatically apply the best replacement above a configurable
  confidence threshold, then re-extract.
- **Field Health Summary** At-a-glance counts and an overall diagnosis after every run.
- **Export & Backup** Copy/Export results (JSON/CSV); import/export individual schemas or
  full backups (including embeddings).
- **Two Themes** Dark and a calm light theme.
- **100% Local** `chrome.storage.local` for metadata, IndexedDB for embeddings, WASM model
  in an offscreen document.

See [`features.md`](./features.md) for the complete, categorized feature list with edge
cases and limitations.

---

## How Self-Healing Works

1. **Capture**. When you pick an element, its text is embedded into a 384-dim vector and
   stored in IndexedDB alongside the CSS/XPath selectors.
2. **Extract**. Selectors are evaluated (CSS first, XPath fallback) and the extracted text is
   verified against the stored text to catch silent "phantom swaps".
3. **Detect**. If a field breaks or drifts, VectorTrace enumerates the page's visible text
   nodes, embeds them in chunks, and ranks them by cosine similarity to the stored vector.
4. **Heal**. You accept the best candidate (or auto-heal applies it). The selector is
   rewritten, the heal is recorded, and re-extraction surfaces a `HEALED` badge showing the
   exact `oldSelector → newSelector` swap.

All embedding runs inside an **offscreen document** (the MV3 service worker can't host WASM
with a DOM context). The offscreen document self-warms the model on every (re)creation so the
first real request avoids the cold-start penalty.

---

## Tech Stack

- **Framework:** [WXT](https://wxt.dev/) (Vite-based web-extension framework)
- **UI:** React 19 + Tailwind CSS v3
- **ML:** [`@huggingface/transformers`](https://github.com/huggingface/transformers.js)
  (`all-MiniLM-L6-v2`, ONNX, q8, WASM backend via `onnxruntime-web`)
- **Storage:** `chrome.storage.local` (metadata) + IndexedDB via [`idb`](https://github.com/jakearchibald/idb) (embeddings)
- **Language:** TypeScript (strict)
- **Lint/Format:** [Biome](https://biomejs.dev/)
- **Tests:** [Vitest](https://vitest.dev/)
- **Package manager:** pnpm

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/)

### Installation

```bash
git clone https://github.com/SathiyaSenpai/VectorTrace.git
cd VectorTrace
pnpm install
```

### Run it

```bash
pnpm dev      # WXT dev server + auto-opened Chrome with the extension loaded
```

Or build and load manually:

```bash
pnpm build    # outputs .output/chrome-mv3/
```

Then go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
select `.output/chrome-mv3/`.

### Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start the WXT hot-reloading dev server and launch Chrome with the extension. |
| `pnpm build` | Build the production bundle into `.output/chrome-mv3/`. |
| `pnpm lint` | Run Biome lint + format checks. |
| `pnpm lint:fix` | Run Biome and auto-fix. |
| `pnpm test` | Run the Vitest suite. |

---

## Usage

1. Open any content website and click the VectorTrace toolbar icon.
2. **Create Schema**, then **Add Field** and click elements on the page to capture them.
3. Click **Extract** to pull values — results and a health summary appear in the Results tab.
4. If a field breaks later, click **Find Replacement** (or enable **Auto-Heal** in Options)
   to repair the selector semantically.
5. **Copy** or **Export** your data as JSON/CSV.

For a full feature walkthrough and QA checklist, see [`tests/test.md`](./tests/test.md).

---

## Permissions

| Permission | Why |
| :--- | :--- |
| `activeTab`, `tabs` | Read the active tab URL and message its content script. |
| `scripting` | Auto-inject the content script when needed. |
| `storage`, `unlimitedStorage` | Persist schemas (local storage) and embeddings (IndexedDB). |
| `offscreen` | Host the WASM embedding model outside the service worker. |
| `<all_urls>` | Define and extract scrapers on any site you visit. |

No host data is ever transmitted off-device. The optional Gemini API key field in Options is
reserved for a future opt-in cloud mode and is unused by the local pipeline.

---

## Project Structure

```text
├── public/                 # Icons and static assets
├── plugins/                # vite-plugin-onnx-bundle (copies ONNX WASM into the build)
├── src/
│   ├── assets/             # Global styles (Tailwind)
│   ├── background/         # Embedding pipeline + similarity scoring (service-worker side)
│   ├── content/            # ElementPicker, selector generation, text extraction
│   ├── entrypoints/        # WXT entry points
│   │   ├── background.ts    # Service worker (message router)
│   │   ├── content.ts       # Injected content script
│   │   ├── offscreen/       # Offscreen WASM model host (self-warming)
│   │   ├── options/         # Options page (React)
│   │   └── popup/           # Toolbar popup (React)
│   ├── popup/              # Popup components & hooks (extraction, schema, healing, auto-heal)
│   └── shared/             # Types, storage wrappers, heal-tracker, settings, url-matcher
├── features.md             # Full feature list
├── devlog.md               # Development log
└── tests/test.md           # Manual test plan
```

---

## Testing

```bash
pnpm test                       # unit tests (Vitest)
pnpm lint                       # Biome
npx tsc --noEmit -p tsconfig.json   # type check
pnpm build                      # production build smoke test
```

---

## Contributing

Issues and PRs are welcome. Please run `pnpm lint`, `pnpm test`, and a type check before
opening a PR. Keep changes local-first and privacy-preserving.

---

## License

Licensed under the [GNU Affero General Public License v3 (AGPLv3)](LICENSE).
