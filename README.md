# VectorTrace

VectorTrace is an open-source, local-first Chrome Extension (Manifest V3) built using the WXT framework, React, and TypeScript. It features a point-and-click GUI that lets users select elements on any webpage to define scraper fields, and automatically recovers from layout breakage using on-device Machine Learning (ML).

---

## Key Features

- **Point-and-Click Selector Definition**: Visual interface to define data fields on a page, generate CSS/XPath selectors, and extract contents instantly.
- **On-Device Semantic Embeddings**: Generates 384-dimensional text embeddings in the browser using the `all-MiniLM-L6-v2` model via **Transformers.js v3**.
- **Layout Change Detection**: If a website redesigns and a CSS selector breaks, VectorTrace compares candidate text elements against the stored embedding using cosine similarity to locate the target field and suggest replacement selectors with confidence scores.
- **Privacy-First (100% Local)**: All AI inference and scraping run entirely in the client's browser (ONNX WASM runtime). No server calls, no APIs, and zero data leaving the device.

---

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Vite-based Next-gen Web Extension Framework)
- **UI library**: React 19 + Tailwind CSS
- **ML Inference**: `@huggingface/transformers` (all-MiniLM-L6-v2 running on ONNX WebAssembly backend)
- **Database**: IndexedDB via the `idb` wrapper
- **Tooling**: TypeScript, Biome (linter/formatter), Vitest

---

## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) (v18+) and [pnpm](https://pnpm.io/) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SathiyaSenpai/VectorTrace.git
   cd VectorTrace
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the WXT hot-reloading dev server and launches a clean Chrome window with the extension preloaded. |
| `pnpm build` | Compiles the production bundle into `.output/chrome-mv3/`. |
| `pnpm lint` | Runs Biome to check linting and formatting. |
| `pnpm lint:fix` | Runs Biome and auto-fixes layout or linting issues. |
| `pnpm test` | Runs the Vitest test suite. |

---

## Project Structure

```text
├── assets/             # Extension static logo assets
├── public/             # Public directory containing icons & static assets
├── src/
│   ├── assets/         # Global styles and Tailwind configurations
│   ├── content/        # Core content-script logic (e.g. ElementPicker class)
│   ├── entrypoints/    # Extension entry points resolved by WXT
│   │   ├── background.ts  # Service worker
│   │   ├── content.ts     # Content script injected into tabs
│   │   └── popup/         # Extension Toolbar UI (React mount)
│   └── shared/         # Common TypeScript types, chrome.storage wrapper, and unit tests
├── biome.json          # Biome formatting and lint config
├── tailwind.config.js  # Tailwind CSS options
└── wxt.config.ts       # WXT project configuration
```

---

## License

This project is open-source and licensed under the [GNU Affero General Public License v3 (AGPLv3)](LICENSE).
