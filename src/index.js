// Scraper entry point - Stage 1 onward
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const CATALOGUE_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_PATH = 'cache/catalogue-page-1.html';
const USER_AGENT =
  'FlyRankInternship-A9/1.0 (+https://github.com/tawchifulislam/scraper)';

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

async function main() {
  const html = await fetchPage(CATALOGUE_URL, CACHE_PATH);
  console.log('Done.');
}

main();
