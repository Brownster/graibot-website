#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SOURCES = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google Blog', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'Microsoft Blogs', url: 'https://blogs.microsoft.com/feed/' }
];

const KEYWORDS = ['ai', 'model', 'llm', 'agent', 'safety', 'security', 'evaluation', 'red team', 'governance', 'responsible'];
const MAX_ITEMS = 12;

const decodeHtml = (value = '') =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const getTagValue = (block, tag) => {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(pattern);
  return decodeHtml(match?.[1] ?? '');
};

const parseItems = (xml, sourceName) => {
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atomBlocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const blocks = itemBlocks.length > 0 ? itemBlocks : atomBlocks;

  return blocks
    .map((block) => {
      const title = getTagValue(block, 'title');
      const linkFromTag = getTagValue(block, 'link');
      const atomHrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const link = linkFromTag || atomHrefMatch?.[1] || '';
      const pubDate = getTagValue(block, 'pubDate') || getTagValue(block, 'updated') || getTagValue(block, 'published');

      let publishedAt = null;
      if (pubDate) {
        const parsedTime = Date.parse(pubDate);
        publishedAt = Number.isNaN(parsedTime) ? null : new Date(parsedTime).toISOString();
      }

      return { title, link, source: sourceName, publishedAt };
    })
    .filter((item) => item.title && item.link);
};

const matchesKeywords = (item) => {
  const searchable = `${item.title} ${item.link}`.toLowerCase();
  return KEYWORDS.some((keyword) => searchable.includes(keyword));
};

const fetchText = async (url) => {
  const { stdout } = await execFileAsync('curl', ['-fsSL', '--max-time', '30', url], {
    maxBuffer: 1024 * 1024 * 10
  });
  return stdout;
};

const fetchFeed = async (source) => {
  const xml = await fetchText(source.url);
  return parseItems(xml, source.name);
};

const run = async () => {
  const results = await Promise.allSettled(SOURCES.map(fetchFeed));
  const allItems = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));

  const uniqueMap = new Map();
  for (const item of allItems) {
    const normalizedLink = item.link.replace(/\/?$/, '');
    if (!uniqueMap.has(normalizedLink) && matchesKeywords(item)) uniqueMap.set(normalizedLink, item);
  }

  const items = [...uniqueMap.values()]
    .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0))
    .slice(0, MAX_ITEMS);

  await writeFile('news/news-data.json', JSON.stringify({ generatedAt: new Date().toISOString(), totalSources: SOURCES.length, items }, null, 2) + '\n');

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`Completed with ${failures.length} source failure(s).`);
    failures.forEach((failure) => console.warn(failure.reason?.message || String(failure.reason)));
  }

  console.log(`Wrote ${items.length} items to news/news-data.json`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
