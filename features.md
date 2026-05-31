# VectorTrace — Feature List

VectorTrace is a local-first, point-and-click web scraper Chrome Extension (Manifest V3)
that recovers from website layout changes using on-device semantic embeddings. Every
feature below runs entirely in the browser — no servers, no APIs, no data leaving the device.

---

## 1. Scraper Definition

### Point-and-Click Element Picker
Hover any element on a page and click to capture it as a scraper field, with a live
overlay highlight and a 40-character text preview tooltip.
- **Edge cases / limitations:** Clicks on the extension's own overlay/close button are
  ignored. `<body>`/`<html>` are not selectable. Press `Esc` (or the floating close
  button) to cancel. Selection is disabled while a picker session is already active.

### Robust CSS Selector Generation
Generates a unique, stable CSS selector for the captured element, preferring `id`, then
unique `data-*` attributes, then the nearest ancestor with an ID, then a
`:nth-of-type` child-combinator path.
- **Edge cases / limitations:** Selectors are capped at 500 characters (truncated while
  re-verifying uniqueness). Returns `null` for elements inside cross-origin iframes. SVG
  tag names keep their original case (e.g. `clipPath`).

### XPath Fallback Selector
Generates a tag-indexed XPath as a fallback, used automatically during extraction when
the CSS selector resolves nothing.
- **Edge cases / limitations:** Also capped at 500 characters and skipped for
  cross-origin iframe elements.

### Schemas (Field Collections)
Fields are grouped into named schemas tied to the page URL. Multiple schemas can match a
single page and are selectable from a dropdown.
- **Edge cases / limitations:** A new field with no matching schema auto-creates an
  "Untitled Schema". Schema names default to "Untitled Schema" when left blank.

### Inline Renaming & Field Management
Rename schemas and field labels inline, delete individual fields or whole schemas, and
reorder fields via pointer-based drag-and-drop with edge auto-scroll.
- **Edge cases / limitations:** Deleting a field/schema also removes its embeddings from
  IndexedDB. Drag reordering only swaps with immediate neighbors per frame to avoid
  cascading swaps.

### URL Matching (Exact + Glob)
Matches the current page against a schema's URL (normalized, trailing-slash/query
insensitive) or an optional glob `urlPattern` (e.g. `https://*.example.com/*`).
- **Edge cases / limitations:** Invalid glob patterns fall back silently to exact match.
  Query strings are stripped during normalization.

---

## 2. Extraction

### Field Extraction with Identity Verification
Extracts each field's text, evaluating CSS first then XPath, and verifies the extracted
text still matches the content captured at definition time (preventing the "phantom swap"
where a positional selector silently grabs the wrong element).
- **Edge cases / limitations:** Text matching is fuzzy — exact match after whitespace
  normalization, substring containment, or matching 50-character prefix all count as a
  match (handles dynamic suffixes like timestamps).

### Distinct Failure States *(Feature 1 — Reddit community request)*
Instead of treating every failure as "selector broken", extraction reports **why** a
field failed with one of six distinct statuses, each with its own badge and one-line
diagnosis:

| Status | Meaning |
| :--- | :--- |
| `OK` | Selector resolved and text matches stored content. |
| `HEALED` | Selector was repaired and now resolves (see §3). |
| `SELECTOR_BROKEN` | Selector matched nothing — element missing from the DOM. |
| `TEXT_CONTENT_CHANGED` | Selector resolved a *different* element, or its text drifted / went empty. |
| `ELEMENT_HIDDEN` | Selector resolved an element that is hidden (`display:none`, `visibility:hidden`, `opacity:0`, or off-layout). |
| `EMPTY_PAGE` | The whole page has no meaningful text (blocked, loading, or error page). |

- **Edge cases / limitations:** `EMPTY_PAGE` short-circuits all fields when the page body
  has < 20 characters of visible text. Hidden-element detection skips the `offsetParent`
  layout check under JSDOM (test environments) and treats `position:fixed`/`sticky`
  elements as visible. A resolved element whose text is now empty (but had stored content)
  is reported as `TEXT_CONTENT_CHANGED`, not a silent empty `OK`.

### Selector Wait / Late-Loading Support
Both CSS and XPath lookups wait up to 1 second for the element to appear, using a
`MutationObserver`, to tolerate content that renders slightly after load.
- **Edge cases / limitations:** Fixed 1-second timeout; very slow SPAs may still report
  `SELECTOR_BROKEN`. Re-run extraction after the page settles.

### Field Health Summary
The Results tab shows a summary banner with an overall diagnosis (success / needs
attention / empty) plus per-status count pills (OK, Healed, Drifted, Broken, Hidden,
Empty).
- **Edge cases / limitations:** Hidden when there are zero fields.

### Re-run Extraction
A "Re-run" button on the Results tab re-extracts the current page without leaving the
results view.
- **Edge cases / limitations:** Disabled while a re-run is already in progress.

---

## 3. Self-Healing (Semantic Recovery)

### On-Device Semantic Embeddings
Generates 384-dimensional embeddings for captured and candidate text using
`all-MiniLM-L6-v2` (ONNX, q8) via Transformers.js, executed inside an offscreen document.
- **Edge cases / limitations:** First use downloads/caches the model (progress shown in
  the popup). Input text is truncated to 200 characters before embedding.

### Offscreen Document with Self-Warming
The offscreen document hosts the WASM model (the MV3 service worker cannot). On every
(re)creation it self-initializes and warms the model in the background so the first real
request avoids the full cold-start.
- **Edge cases / limitations:** Warm-up failures are non-fatal and retried lazily on the
  next request. The service worker recreates the offscreen document on demand and tolerates
  it being torn down between calls.

### Manual Selector Recovery
When a field breaks or drifts, "Find Replacement" enumerates visible page elements, embeds
them in chunks, ranks them by cosine similarity, and presents the top candidates with
HIGH/MEDIUM/LOW confidence badges, similarity percentages, text previews, and a page
preview highlight.
- **Edge cases / limitations:** Enumeration is limited to the top 500 visible text nodes;
  candidates with score ≤ 0.4 are filtered out. Search terminates early on a ≥ 0.95 match.
  Only same-origin elements are highlightable.

### HEALED Status Wiring *(Feature 2)*
Accepting a candidate (or auto-heal) records the old → new selector swap and re-runs
extraction; the repaired field then shows a `HEALED` badge whose tooltip displays the
exact `healedFrom → healedTo` selectors.
- **Edge cases / limitations:** The `HEALED` badge only shows on the extraction run
  immediately following the heal — the pending-heal record is consumed once. A field only
  becomes `HEALED` if the new selector actually resolves successfully that run.

### Auto-Heal (Optional)
When enabled in Settings, extraction automatically applies the top replacement candidate
for any broken/drifted field whose confidence clears a user-configurable threshold, then
re-extracts to surface `HEALED` badges — no prompting.
- **Edge cases / limitations:** Disabled by default. Default threshold is 70%
  (configurable 30%–95%). Fields with no candidate above the threshold are left as-is.

---

## 4. Export & Data Management

### Copy / Export Results
From the Results tab: copy a structured JSON snapshot (schema, URL, timestamp, and each
field's label/value/status) to the clipboard, or download the results as JSON or CSV.
- **Edge cases / limitations:** CSV escapes embedded quotes; filenames are sanitized.
  Clipboard failures are logged and non-fatal.

### Schema Import / Export
The Options page exports a single schema (with embeddings) or a full backup of all schemas
+ embeddings, and re-imports either format.
- **Edge cases / limitations:** Only version `"1.0"` files are accepted. Imported schemas
  receive a fresh `schemaId` to avoid collisions.

### Storage Split (Metadata vs. Embeddings)
Schema metadata lives in `chrome.storage.local` (embeddings stripped to fit quota); the
heavy 384-dim embeddings live in IndexedDB (`idb`) with `by-schema`/`by-url`/`by-timestamp`
indices.
- **Edge cases / limitations:** Requires the `unlimitedStorage` permission for large
  embedding sets.

### Database Reset
Reset from the popup Settings (preserves the chosen theme) or wipe everything from the
Options page (type-to-confirm). Both clear `chrome.storage.local` and the IndexedDB
embeddings store.
- **Edge cases / limitations:** Irreversible. Pending-heal records are cleared as part of
  the local-storage wipe.

---

## 5. UI / UX

### Two Themes (Dark / Sakura)
A persisted theme toggle switches between a dark theme and a calm cherry-blossom light
theme across the popup, including theme-aware scrollbars and toasts.
- **Edge cases / limitations:** Theme preference is preserved across database resets.

### Restricted-Page Guard
Detects `chrome://`, `chrome-extension://`, `about:`, `devtools://`, `edge://`, and
`view-source:` pages and shows a friendly "system page" notice instead of failing.

### Resilient Messaging
Messages to content scripts retry up to 3 times and auto-inject the content script if the
connection is missing.
- **Edge cases / limitations:** Non-connection errors are rethrown immediately. Embedding
  requests have a 60-second watchdog timeout so an unresponsive offscreen document never
  hangs the caller.

### Error Boundary
A React error boundary wraps the popup and options app, offering "Reload" and "Reset
Extension" recovery actions on an uncaught render error.

### "NEW" Field Badge
Newly added fields show a "NEW" pill for 15 seconds, persisting across popup reopens.
