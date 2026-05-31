# VectorTrace — Manual Test Plan

This document is a comprehensive manual QA plan covering every feature. It complements the
automated Vitest suite (`pnpm test`). Run through it after a build to validate the
extension end-to-end in a real browser.

## 0. Setup

1. `pnpm install`
2. `pnpm build` (or `pnpm dev` for HMR).
3. Load `.output/chrome-mv3/` as an unpacked extension at `chrome://extensions`
   (Developer mode → "Load unpacked").
4. Pin the VectorTrace toolbar icon.

> **First run note:** The first embedding/heal triggers a one-time model download. A
> "Loading AI Model… N%" bar appears in the popup. Subsequent runs are fast.

---

## 1. Element Picker & Schema Definition

| # | Steps | Expected |
| :- | :- | :- |
| 1.1 | Open a content site (e.g. `https://news.ycombinator.com`). Open the popup → **Create Schema** with a name. | Schema is created; Schema tab shows it with 0 fields. |
| 1.2 | Click **Add Field**. Move the mouse over the page. | Blue overlay highlights the hovered element; a tooltip shows a 40-char text preview. "Add Field"/"Extract" are disabled during selection. |
| 1.3 | Click a headline element. | Green "✓ Captured!" flash; popup shows the new field with a "NEW" pill, its CSS selector, and a text preview. |
| 1.4 | Press **Esc** while picking (start picking again first). | Picker exits; no field added; buttons re-enabled. |
| 1.5 | Click the field label → rename → Enter. | Label updates and persists after reopening the popup. |
| 1.6 | Add 3+ fields, then drag a field card up/down. | Field order changes and persists; list auto-scrolls near edges. |
| 1.7 | Delete a field via the trash icon. | Field disappears; its embedding is removed (verify count in Options → Storage). |
| 1.8 | Reopen the popup. | The "NEW" pill remains for ~15s after creation, then disappears. |

## 2. Restricted Pages

| # | Steps | Expected |
| :- | :- | :- |
| 2.1 | Open `chrome://extensions` and open the popup. | "System Page Detected" notice; no schema UI. |
| 2.2 | Repeat on `about:blank`, `view-source:https://example.com`. | Same restricted notice. |

## 3. Extraction & Distinct Failure States (Feature 1)

| # | Steps | Expected |
| :- | :- | :- |
| 3.1 | With a valid schema, click **Extract**. | Auto-switches to Results; each field shows ✅ **OK** with its value. Summary banner: "All fields extracted successfully." |
| 3.2 | In DevTools, delete the target element (or edit its selector to a non-existent one via re-capture on a changed page). Re-run extraction. | Field shows ❌ **BROKEN** with a "Find Replacement" button. Summary: "N of M fields need attention." |
| 3.3 | Change the target element's text in the DOM so it no longer matches stored content. Re-run. | Field shows ⚠️ **DRIFTED** (`TEXT_CONTENT_CHANGED`), value shows the new text, tooltip shows expected vs. got. |
| 3.4 | Set the target element to `display:none` in DevTools. Re-run. | Field shows 👁️ **HIDDEN** (`ELEMENT_HIDDEN`). |
| 3.5 | Empty the target element's text but keep the node. Re-run. | Field shows ⚠️ **DRIFTED** with empty value (not a silent OK). |
| 3.6 | Navigate to a blank/blocked page (e.g. a 204/empty page) with a matching schema. Re-run. | All fields show 📄 **EMPTY** (`EMPTY_PAGE`); summary banner red. |
| 3.7 | Hover each status badge. | Tooltip gives a clear one-line reason for that status. |

## 4. Manual Selector Recovery & HEALED Status (Feature 2)

| # | Steps | Expected |
| :- | :- | :- |
| 4.1 | On a `BROKEN`/`DRIFTED` field, click **Find Replacement**. | Switches to Recovery view; progress bar fills as candidates are embedded/ranked. |
| 4.2 | Review candidates. | Cards show HIGH/MEDIUM/LOW badges, % match, text preview, and the selector. |
| 4.3 | Click **👁️ Preview** on a candidate. | The corresponding element on the page pulses with a green highlight for ~3s. |
| 4.4 | Click **✅ Accept** on a good candidate. | Toast "Selector healed successfully!"; auto re-extraction runs. |
| 4.5 | Inspect the healed field in Results. | Field now shows ⚠️ **HEALED**; its tooltip shows `oldSelector → newSelector`. |
| 4.6 | Re-run extraction once more. | The same field now shows ✅ **OK** (the HEALED badge only shows on the run right after healing). |
| 4.7 | Trigger recovery on a page with no similar element. | "No match found" empty state with guidance. |

## 5. Auto-Heal (Optional)

| # | Steps | Expected |
| :- | :- | :- |
| 5.1 | Open **Options** → **Self-Healing**. Enable "Heal without prompting". | Toast "Auto-heal enabled"; persists on reload. |
| 5.2 | Drag the **Confidence Threshold** slider. | % label updates and persists. |
| 5.3 | Break a field's selector, then run extraction from the popup. | With a confident match available, the field is auto-applied; toast "Auto-healed N field(s)"; field shows ⚠️ **HEALED**. |
| 5.4 | Raise the threshold to 95% and repeat with a weak match. | Field is **not** auto-healed (stays BROKEN/DRIFTED). |
| 5.5 | Disable auto-heal and re-run. | No automatic healing; field stays broken with a manual "Find Replacement" button. |

## 6. Field Health Summary & Re-run

| # | Steps | Expected |
| :- | :- | :- |
| 6.1 | Run extraction with a mix of OK/broken/hidden fields. | Summary banner shows correct count pills (OK, Healed, Drifted, Broken, Hidden, Empty). |
| 6.2 | Click **Re-run** in the Results header. | Spinner shows on the button; results refresh in place without leaving the tab. |

## 7. Export & Clipboard

| # | Steps | Expected |
| :- | :- | :- |
| 7.1 | In Results, click **Copy JSON**. | Button shows "Copied!"; clipboard contains structured JSON with schema, URL, timestamp, and per-field label/value/status. |
| 7.2 | Click **Export JSON** / **Export CSV**. | Files download as `vectortrace-<schema>-<timestamp>.json/.csv`; CSV escapes quotes correctly. |
| 7.3 | Hover a value cell and click the 📋 icon. | That single value is copied. |

## 8. Options — Schema & Data Management

| # | Steps | Expected |
| :- | :- | :- |
| 8.1 | Open Options (gear icon). | Lists all schemas with field counts and updated time. |
| 8.2 | Click **Export** on a schema, then **Import Schema** and select the file. | Schema re-imports with a new ID; appears in the list. |
| 8.3 | Click **Export All Data**, then **Import Backup File**. | All schemas + embeddings export and re-import; storage metrics update. |
| 8.4 | Import a non-1.0 / malformed file. | Error toast; no partial corruption. |
| 8.5 | **Wipe Database Settings** → type `DELETE` → confirm. | All schemas/embeddings cleared; storage metrics reset to 0. |

## 9. Popup Settings

| # | Steps | Expected |
| :- | :- | :- |
| 9.1 | Toggle **Sakura Theme**. | UI smoothly switches dark ↔ light; preference persists. |
| 9.2 | Click **Reset** under Reset Database (confirm). | Schemas cleared but the chosen theme is preserved. |

## 10. Model & Offscreen Reliability

| # | Steps | Expected |
| :- | :- | :- |
| 10.1 | On a fresh profile, trigger the first heal. | "Loading AI Model… %" progress bar appears, then completes. |
| 10.2 | Inspect the offscreen document console (`chrome://extensions` → service worker / offscreen). | `[offscreen] Document initialized — warming up…` then `…warm-up complete.` |
| 10.3 | Let the extension idle, then run extraction/heal again. | Works without manual reload (offscreen recreated and warmed automatically). |

## 11. Automated Tests

| # | Command | Expected |
| :- | :- | :- |
| 11.1 | `pnpm test` | All Vitest suites pass (similarity, selector-generator, text-extractor incl. all failure states, chrome-storage, url-matcher, heal-tracker, settings). |
| 11.2 | `pnpm lint` | Biome reports no errors. |
| 11.3 | `npx tsc --noEmit -p tsconfig.json` | No TypeScript errors. |
| 11.4 | `pnpm build` | Production bundle builds successfully into `.output/chrome-mv3/`. |
