import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

export interface RenderResult {
  /** Final rendered HTML after JS execution */
  html: string;
  /** Page title */
  title: string;
  /** Final URL (after redirects) */
  finalUrl: string;
  /** HTTP status code */
  statusCode: number;
  /** Render time in milliseconds */
  renderTimeMs: number;
  /** Console errors captured during render */
  consoleErrors: string[];
  /** Whether JS rendering actually changed the page (SPA detected) */
  spaDetected: boolean;
}

export interface RenderOptions {
  /** Max wait time in ms for page load (default: 15000) */
  timeout?: number;
  /** Wait for network idle before capturing (default: true) */
  waitForNetworkIdle?: boolean;
  /** Block resource types to speed up renders */
  blockResources?: ('image' | 'media' | 'font' | 'stylesheet')[];
  /** Custom viewport */
  viewport?: { width: number; height: number };
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  timeout: 15_000,
  waitForNetworkIdle: true,
  blockResources: ['image', 'media', 'font'],
  viewport: { width: 1280, height: 720 },
};

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT || 'ws://localhost:3900';
    browser = await chromium.connect(wsEndpoint);
  }
  return browser;
}

/**
 * Render a URL using headless Chromium via Playwright.
 * Connects to a remote browser instance (Docker service).
 * Includes SSRF protection — only public HTTP(S) URLs are allowed.
 */
export async function renderPage(url: string, options?: RenderOptions): Promise<RenderResult> {
  validateUrl(url);

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = Date.now();
  const consoleErrors: string[] = [];

  const b = await getBrowser();
  let context: BrowserContext | null = null;

  try {
    context = await b.newContext({
      viewport: opts.viewport,
      userAgent: 'NexusZero-Bot/1.0 (Renderer)',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
    });

    const page = await context.newPage();

    // Block resource types for faster rendering
    if (opts.blockResources.length > 0) {
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (opts.blockResources.includes(resourceType as any)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text().slice(0, 500));
      }
    });

    // Navigate
    const response = await page.goto(url, {
      waitUntil: opts.waitForNetworkIdle ? 'networkidle' : 'domcontentloaded',
      timeout: opts.timeout,
    });

    const statusCode = response?.status() ?? 0;

    // Detect SPA: check if body had minimal initial HTML that was hydrated
    const spaDetected = await detectSPA(page);

    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();

    return {
      html,
      title,
      finalUrl,
      statusCode,
      renderTimeMs: Date.now() - start,
      consoleErrors,
      spaDetected,
    };
  } finally {
    if (context) {
      await context.close();
    }
  }
}

/** Detect if the page is a SPA (React, Next.js, Vue, Angular) */
async function detectSPA(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.getElementById('root') || document.getElementById('app');
    const nextRoot = document.getElementById('__next');
    const angularRoot = document.querySelector('[ng-app], [ng-version]');
    return !!(root || nextRoot || angularRoot);
  });
}

/** Validate URL to prevent SSRF */
function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Only HTTP(S) URLs are allowed: ${url}`);
  }

  const hostname = parsed.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)
  ) {
    throw new Error(`SSRF blocked: private/internal URL: ${url}`);
  }
}

/** Close the browser connection */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
