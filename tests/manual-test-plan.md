# VectorTrace Manual Test Plan

This document outlines the manual verification procedures to ensure that the core scraper extraction and semantic healing flows in VectorTrace function reliably under both standard workloads and edge-case conditions.

## Test Site 1: Hacker News (https://news.ycombinator.com)
1. Create schema "HN Top Stories"
2. Select 3 fields: first story title, first story score, first story author
3. Run extraction → verify all values match the page
4. Export JSON → verify file contents
5. Export CSV → open in spreadsheet, verify columns
6. Modify the page in DevTools (change a class name on the title element)
7. Re-run extraction → verify SELECTOR_BROKEN status
8. Click Find Replacement → verify correct candidate appears
9. Accept candidate → re-extract → verify fixed

## Test Site 2: Amazon Product Page
1. Create schema "Product Info"
2. Select: product title, price, rating
3. Extract + export
4. Test selector breakage recovery

## Test Site 3: Wikipedia Article
1. Create schema "Article Intro"
2. Select: article title, first paragraph, last edit date
3. Extract + export
4. Test selector breakage recovery

## Edge Cases:
- **Close popup mid-extraction** → reopen → does it recover?
- **Define 10+ fields** → does the popup scroll correctly?
- **Very long text content (1000+ chars)** → does embedding work?
- **Page with iframes** → does selector work across frames?
- **Page with Shadow DOM** → document.querySelector behavior?
