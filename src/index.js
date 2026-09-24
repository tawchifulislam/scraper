// Scraper entry point - Stage 1 onward
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://books.toscrape.com/catalogue/';
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/tawchifulislam/scraper)';
const MAX_PAGES = 3;

async function fetchPage(url, cachePath) {
  if (existsSync(cachePath)) {
    const cached = await readFile(cachePath, 'utf-8');
    console.log(`CACHE HIT (${cached.length} bytes)`);
    return cached;
  }

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status !== 200) {
    throw new Error(`Fetch failed with status ${response.status}`);
  }

  const html = await response.text();

  await mkdir('cache', { recursive: true });
  await writeFile(cachePath, html, 'utf-8');

  console.log(`FETCH (${html.length} bytes)`);
  return html;
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

    const wasCached = existsSync(cachePath);
    const html = await fetchPage(currentUrl, cachePath);

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

async function main() {
  const { pageCount, bookLinks } = await discoverCataloguePages();

  console.log(`catalogue_pages=${pageCount}`);
  console.log(`discovered=${bookLinks.length}`);
  console.log(`unique_urls=${new Set(bookLinks).size}`);
}

main();
