// Scraper entry point - Stage 1 onward
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const BASE_URL = 'https://books.toscrape.com/catalogue/';
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/tawchifulislam/scraper)';
const MAX_PAGES = 3;

async function fetchPage(url, cachePath, attempt = 1) {
  if (existsSync(cachePath)) {
    const cached = await readFile(cachePath, 'utf-8');
    console.log(`CACHE HIT (${cached.length} bytes)`);
    return { html: cached, wasCached: true };
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    if (attempt < 2) {
      await sleep(1000);
      return fetchPage(url, cachePath, attempt + 1);
    }
    throw new Error(`Network error after retry: ${err.message}`);
  }

  if (response.status >= 500 && attempt < 2) {
    await sleep(1000);
    return fetchPage(url, cachePath, attempt + 1);
  }

  if (response.status !== 200) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  const html = await response.text();

  await mkdir('cache', { recursive: true });
  await writeFile(cachePath, html, 'utf-8');

  console.log(`FETCH (${html.length} bytes)`);
  return { html, wasCached: false };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function discoverCataloguePages() {
  const bookLinks = new Set();
  let currentUrl = `${BASE_URL}page-1.html`;
  let pageCount = 0;

  while (currentUrl && pageCount < MAX_PAGES) {
    pageCount += 1;
    const cachePath = `cache/catalogue-page-${pageCount}.html`;

    const { html, wasCached } = await fetchPage(currentUrl, cachePath);

    const $ = cheerio.load(html);

    $('h3 a').each((i, el) => {
      const href = $(el).attr('href');
      const absoluteUrl = new URL(href, currentUrl).href;
      bookLinks.add(absoluteUrl);
    });

    const nextHref = $('.next a').attr('href');
    currentUrl = nextHref ? new URL(nextHref, currentUrl).href : null;

    if (!wasCached) {
      await sleep(500);
    }
  }

  return { pageCount, bookLinks: [...bookLinks] };
}
async function extractBookDetails(bookUrl, index) {
  const cachePath = `cache/book-${index}.html`;
  const { html, wasCached } = await fetchPage(bookUrl, cachePath);

  const $ = cheerio.load(html);

  const title = $('.product_main h1').text().trim();
  const priceText = $('.product_main .price_color').first().text().trim();
  const availabilityText = $('.product_main .availability').text().trim();

  const ratingClass = $('.product_main .star-rating').attr('class') || '';
  const ratingText = ratingClass.replace('star-rating', '').trim();

  const descriptionEl = $('#product_description').next('p');
  const description = descriptionEl.length ? descriptionEl.text().trim() : null;

  const record = {
    title,
    product_url: bookUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: bookUrl,
    fetched_at: new Date().toISOString(),
  };

  if (!wasCached) {
    await sleep(500);
  }

  return record;
}

const BookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_gbp: z.number().positive(),
  price_text: z.string(),
  availability_text: z.string(),
  rating_text: z.string(),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string(),
});

function normalizeRecord(raw) {
  const priceMatch = raw.price_text.match(/[\d.]+/);
  const priceGbp = priceMatch ? parseFloat(priceMatch[0]) : NaN;

  return {
    title: raw.title,
    product_url: raw.product_url,
    price_gbp: priceGbp,
    price_text: raw.price_text,
    availability_text: raw.availability_text,
    rating_text: raw.rating_text,
    description: raw.description,
    source_page: raw.source_page,
    fetched_at: raw.fetched_at,
  };
}

function validateRecords(rawRecords) {
  const validRecords = [];
  const errors = [];
  const seenUrls = new Set();

  for (const raw of rawRecords) {
    const normalized = normalizeRecord(raw);
    const result = BookSchema.safeParse(normalized);

    if (!result.success) {
      errors.push({
        product_url: raw.product_url,
        reason: result.error.issues.map(issue => issue.message).join(', '),
      });
      continue;
    }

    if (seenUrls.has(normalized.product_url)) {
      continue;
    }
    seenUrls.add(normalized.product_url);
    validRecords.push(result.data);
  }

  return { validRecords, errors };
}

async function main() {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  const { pageCount, bookLinks } = await discoverCataloguePages();

  console.log(`catalogue_pages=${pageCount}`);
  console.log(`discovered=${bookLinks.length}`);
  console.log(`unique_urls=${new Set(bookLinks).size}`);

  const rawRecords = [];
  const failedPages = [];

  for (let i = 0; i < bookLinks.length; i++) {
    try {
      const record = await extractBookDetails(bookLinks[i], i + 1);
      rawRecords.push(record);
    } catch (err) {
      failedPages.push({ url: bookLinks[i], reason: err.message });
      console.log(`FAILED: ${bookLinks[i]} (${err.message})`);
    }
  }

  console.log(`detail_pages=${rawRecords.length}`);

  const { validRecords, errors } = validateRecords(rawRecords);

  await mkdir('output', { recursive: true });
  await writeFile(
    'output/books.json',
    JSON.stringify(validRecords, null, 2),
    'utf-8',
  );

  if (errors.length > 0) {
    await writeFile(
      'output/errors.json',
      JSON.stringify(errors, null, 2),
      'utf-8',
    );
  }

  const durationMs = Date.now() - startTime;

  const report = {
    started_at: startedAt,
    duration_ms: durationMs,
    catalogue_pages: pageCount,
    books_discovered: bookLinks.length,
    valid_records: validRecords.length,
    invalid_records: errors.length,
    failed_pages: failedPages.length,
    failed_page_details: failedPages,
  };

  await writeFile(
    'output/run-report.json',
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  console.log(`valid_records=${validRecords.length}`);
  console.log(`invalid_records=${errors.length}`);
  console.log(`failed_pages=${failedPages.length}`);
}

main();
