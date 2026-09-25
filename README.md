# The polite scraper

A small, polite scraping pipeline that downloads the first three catalogue pages of Books to Scrape, visits all 60 book pages, turns messy HTML into clean, checked JSON records, and survives a broken page without crashing.

## Target classification

- Site: <https://books.toscrape.com>
- Why scraping this site is appropriate: the site's own tagline reads "We love being scraped!" and it displays a warning banner stating it is a demo site built specifically for web scraping practice, with randomly assigned prices and ratings.
- Scope: only the first 3 catalogue pages (about 60 books total).
- robots.txt result: no robots file found (404), checked at <https://books.toscrape.com/robots.txt>.

I will not reuse this code on another site without checking its rules and terms first.

## How to run

```bash
git clone https://github.com/tawchifulislam/scraper.git
cd scraper
npm install
node src/index.js
```

Output files are written to `output/books.json` and `output/run-report.json`. Downloaded HTML is cached in `cache/` so repeat runs do not hit the site again.

## Politeness rules followed

- Every request sends an honest User-Agent identifying this project and linking to this repository.
- A timeout is set on every request, so a slow response cannot hang forever.
- Only a status code of 200 is treated as a successful fetch.
- Every downloaded page is cached to disk, so re-running the script during development reads from disk instead of asking the site again.
- A 500ms delay is added between requests, but only for pages that were freshly fetched, not for pages served from cache.
- A failed request is retried once for network errors or server errors (5xx). A 404 or 403 is never retried, since retrying would not change the result and would only add load to the site.

## Record schema

Each validated record in `output/books.json` has this shape:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_gbp": 51.77,
  "price_text": "£51.77",
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": "It's hard to imagine a world without A Light in the Attic...",
  "source_page": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "fetched_at": "2026-09-24T21:06:44.695Z"
}
```

- `price_gbp` is a real number, parsed from `price_text`. Both are kept, the original text and the clean value.
- `product_url` is treated as each record's canonical identity, if the same book appears twice across catalogue pages, it counts once.
- `description` can be `null` for books that do not have one on the page. No text is invented.
- Records are validated against a Zod schema before being stored. Records that fail validation go to `output/errors.json` with a reason, they never reach `books.json`.

## Idempotency

Running the scraper twice produces the same 60 records, not 120. Cached pages are read from disk instead of re-fetched, and each record's `product_url` is deduplicated before it is written to `books.json`.

## Surviving failures

One broken page does not take down the run. Each book page is fetched inside its own try/catch. If a page fails after its retry, it is logged and skipped, and the remaining pages still get processed.

This was tested by adding one made-up book URL to the list on purpose. The run finished normally, `books.json` still held the 60 good records, and `output/run-report.json` reported `failed_pages: 1` with the reason for that one failure. That line was removed once the behaviour was confirmed.

## Example run report

```json
{
  "started_at": "2026-09-24T21:10:00.000Z",
  "duration_ms": 245,
  "catalogue_pages": 3,
  "books_discovered": 60,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0,
  "failed_page_details": []
}
```

## Honest limitation

This scraper only handles the first 3 catalogue pages of one practice sandbox. It has no retry backoff strategy beyond a single retry, no structured logging, and no way to discover pages hidden behind JavaScript rendering. These are exactly what next week's assignment builds on top of this foundation.
