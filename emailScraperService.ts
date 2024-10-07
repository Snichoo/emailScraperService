import express, { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
app.use(express.json());

// Function to extract emails from text
function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
  let emails: string[] = text.match(emailRegex) || [];

  // Blacklist certain file extensions to filter out false positives
  const blacklistedExtensions = [
    '.jpg', '.jpeg', '.png', '.svg', '.gif',
    '.tga', '.bmp', '.zip', '.pdf', '.webp',
  ];

  emails = emails.filter((email) => {
    const lowerEmail = email.toLowerCase();
    return !blacklistedExtensions.some((ext) => lowerEmail.endsWith(ext));
  });

  return emails;
}

// Function to extract links from HTML
function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((i, elem) => {
    let href = $(elem).attr('href');
    if (href) {
      href = href.split('#')[0].trim();
      if (
        href.startsWith('mailto:') ||
        href.startsWith('javascript:') ||
        href === '' ||
        href === '/' ||
        href === 'https://' ||
        href === 'http://' ||
        href === '//'
      ) {
        return;
      }
      try {
        const resolvedUrl = new URL(href, baseUrl).toString();
        if (resolvedUrl.startsWith(baseUrl)) {
          links.push(resolvedUrl);
        }
      } catch {
        // Skip invalid URLs
      }
    }
  });
  return links;
}

// Function to fetch a page's HTML content
async function fetchPage(pageUrl: string): Promise<string | null> {
  try {
    const response = await axios.get(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailScraper/1.0)' },
      timeout: 10000,
      responseType: 'text',
    });
    return response.data;
  } catch {
    return null;
  }
}

// Function to crawl a website and find emails
async function crawlWebsite(startUrl: string): Promise<string[]> {
  const emailsFound = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  const maxPages = 40;
  let pagesCrawled = 0;
  let emailFound = false;

  const parsedUrl = new URL(startUrl);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  queue.push(startUrl);

  const contactPaths = [
    '/contact', '/contact-us', '/contactus', '/about',
    '/about-us', '/aboutus', '/impressum',
  ];
  for (let path of contactPaths) {
    queue.push(new URL(path, baseUrl).toString());
  }

  const maxCrawlTime = 30000; // 30 seconds per website
  const crawlStartTime = Date.now();
  while (queue.length > 0 && pagesCrawled < maxPages && !emailFound) {
    if (Date.now() - crawlStartTime > maxCrawlTime) {
      console.log(`Crawl time exceeded for ${startUrl}`);
      break;
    }
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const html = await fetchPage(currentUrl);
    if (!html) continue;
    pagesCrawled++;

    const emails = extractEmails(html);
    if (emails.length > 0) {
      emails.forEach((email) => emailsFound.add(email));
      emailFound = true;
      break; // Stop crawling this website
    }

    const links = extractLinks(html, baseUrl);
    for (let link of links) {
      if (!visited.has(link)) {
        queue.push(link);
      }
    }
  }

  return Array.from(emailsFound);
}

app.post('/scrape-emails', async (req: Request, res: Response) => {
  const { website } = req.body;
  if (!website) {
    return res.status(400).json({ error: 'Website URL is required' });
  }

  try {
    const emails = await crawlWebsite(website);
    res.json({ emails });
  } catch (error) {
    console.error('Error in scrape-emails:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Email scraper service is running on port ${PORT}`);
});
