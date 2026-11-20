import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SiteConfig {
  /** Stable identifier stored alongside each chunk in the DB. */
  source: string;
  /** Human-friendly label for logs. */
  label: string;
  /** Root URL for the subdomain (no trailing slash). */
  baseUrl: string;
  /** Hostname used to scope the crawl. */
  hostname: string;
  /** Optional path to seed the crawl (defaults to '/'). */
  startPath?: string;
  /**
   * Optional path prefix used to constrain the crawl to a section of a site
   * (e.g. only the new-student-onboarding section of campuslife.byuh.edu).
   */
  pathPrefix?: string;
}

/**
 * The BYU–Hawaii subdomains we crawl for the chatbot knowledge base.
 *
 * Keep `source` values stable — they are persisted in `byuh_chunks.source`
 * and are tagged on each retrieved chunk so the model knows which office a page came from.
 */
export const SITE_CONFIGS: SiteConfig[] = [
  {
    source: 'admissions',
    label: 'Admissions',
    baseUrl: 'https://admissions.byuh.edu',
    hostname: 'admissions.byuh.edu',
  },
  {
    source: 'financial_aid',
    label: 'Financial Aid',
    baseUrl: 'https://financialaid.byuh.edu',
    hostname: 'financialaid.byuh.edu',
  },
  {
    source: 'international',
    label: 'International Student Services',
    baseUrl: 'https://iss.byuh.edu',
    hostname: 'iss.byuh.edu',
  },
  {
    source: 'housing',
    label: 'Student Housing',
    baseUrl: 'https://studenthousing.byuh.edu',
    hostname: 'studenthousing.byuh.edu',
  },
  {
    source: 'registrar',
    label: 'Office of the Registrar',
    baseUrl: 'https://registrar.byuh.edu',
    hostname: 'registrar.byuh.edu',
  },
  {
    source: 'advising',
    label: 'Academic Advising',
    baseUrl: 'https://advising.byuh.edu',
    hostname: 'advising.byuh.edu',
  },
  {
    source: 'orientation',
    label: 'New Student Orientation',
    baseUrl: 'https://campuslife.byuh.edu',
    hostname: 'campuslife.byuh.edu',
  },
  {
    source: 'health',
    label: 'Health Services',
    baseUrl: 'https://healthservices.byuh.edu',
    hostname: 'healthservices.byuh.edu',
    startPath: '/health-center',
  },
  {
    source: 'homepage',
    label: 'BYU–Hawaii Homepage',
    baseUrl: 'https://www.byuh.edu',
    hostname: 'www.byuh.edu',
  },
  {
    source: 'academic_commons',
    label: 'Academic Commons',
    baseUrl: 'https://academiccommons.byuh.edu',
    hostname: 'academiccommons.byuh.edu',
  },
  {
    source: 'academic_administration',
    label: 'Academic Administration',
    baseUrl: 'https://academics.byuh.edu',
    hostname: 'academics.byuh.edu',
  },
  {
    source: 'faculty_of_arts_and_letters',
    label: 'Faculty of Arts and Letters',
    baseUrl: 'https://al.byuh.edu',
    hostname: 'al.byuh.edu',
  },
  {
    source: 'alumni_relations',
    label: 'Alumni Relations',
    baseUrl: 'https://alumni.byuh.edu',
    hostname: 'alumni.byuh.edu',
  },
  {
    source: 'faculty_of_business_and_government',
    label: 'Faculty of Business & Government',
    baseUrl: 'https://bg.byuh.edu',
    hostname: 'bg.byuh.edu',
  },
  {
    source: 'store',
    label: 'Store',
    baseUrl: 'https://bookstore.byuh.edu',
    hostname: 'bookstore.byuh.edu',
  },
  {
    source: 'career_services',
    label: 'Career Services',
    baseUrl: 'https://career.byuh.edu',
    hostname: 'career.byuh.edu',
  },
  {
    source: 'catalog',
    label: 'Catalog',
    baseUrl: 'https://catalog.byuh.edu',
    hostname: 'catalog.byuh.edu',
  },
  {
    source: 'church_history',
    label: 'Church History',
    baseUrl: 'https://chpac.byuh.edu',
    hostname: 'chpac.byuh.edu',
  },
  {
    source: 'center_for_hospitality_and_tourism',
    label: 'Center for Hospitality and Tourism',
    baseUrl: 'https://cht.byuh.edu',
    hostname: 'cht.byuh.edu',
  },
  {
    source: 'faculty_of_culture_language_performing_arts',
    label: 'Faculty of Culture, Language & Performing Arts',
    baseUrl: 'https://clpa.byuh.edu',
    hostname: 'clpa.byuh.edu',
  },
  {
    source: 'center_for_learning_and_teaching',
    label: 'Center for Learning & Teaching',
    baseUrl: 'https://clt.byuh.edu',
    hostname: 'clt.byuh.edu',
  },
  {
    source: 'compliance',
    label: 'Compliance Office',
    baseUrl: 'https://compliance.byuh.edu',
    hostname: 'compliance.byuh.edu',
  },
  {
    source: 'construction',
    label: 'Construction',
    baseUrl: 'https://construction.byuh.edu',
    hostname: 'construction.byuh.edu',
  },
  {
    source: 'counseling_services',
    label: 'Counseling Services',
    baseUrl: 'https://counseling.byuh.edu',
    hostname: 'counseling.byuh.edu',
  },
  {
    source: 'dean_of_students',
    label: 'Dean of Students',
    baseUrl: 'https://deanofstudents.byuh.edu',
    hostname: 'deanofstudents.byuh.edu',
  },
  {
    source: 'disability_services',
    label: 'Disability Services',
    baseUrl: 'https://disability.byuh.edu',
    hostname: 'disability.byuh.edu',
  },
  {
    source: 'faculty_of_education_and_social_work',
    label: 'Faculty of Education & Social Work',
    baseUrl: 'https://esw.byuh.edu',
    hostname: 'esw.byuh.edu',
  },
  {
    source: 'university_events',
    label: 'University Events',
    baseUrl: 'https://events.byuh.edu',
    hostname: 'events.byuh.edu',
  },
  {
    source: 'facilities_management',
    label: 'Facilities Management',
    baseUrl: 'https://facilitiesmanagement.byuh.edu',
    hostname: 'facilitiesmanagement.byuh.edu',
  },
  {
    source: 'financial_services',
    label: 'Financial Services',
    baseUrl: 'https://financialservices.byuh.edu',
    hostname: 'financialservices.byuh.edu',
  },
  {
    source: 'food_services',
    label: 'Food Services',
    baseUrl: 'https://foodservices.byuh.edu',
    hostname: 'foodservices.byuh.edu',
  },
  {
    source: 'holokai_curriculum',
    label: 'Holokai Curriculum',
    baseUrl: 'https://holokai.byuh.edu',
    hostname: 'holokai.byuh.edu',
  },
  {
    source: 'honor_code',
    label: 'Honor Code',
    baseUrl: 'https://honorcode.byuh.edu',
    hostname: 'honorcode.byuh.edu',
  },
  {
    source: 'housing_operations',
    label: 'Housing Operations',
    baseUrl: 'https://housingoperations.byuh.edu',
    hostname: 'housingoperations.byuh.edu',
  },
  {
    source: 'human_resources',
    label: 'Human Resources',
    baseUrl: 'https://hr.byuh.edu',
    hostname: 'hr.byuh.edu',
  },
  {
    source: 'kealakai',
    label: "Ke Alaka'i",
    baseUrl: 'https://kealakai.byuh.edu',
    hostname: 'kealakai.byuh.edu',
  },
  {
    source: 'legal_notices',
    label: 'Legal Notices',
    baseUrl: 'https://legal.byuh.edu',
    hostname: 'legal.byuh.edu',
  },
  {
    source: 'library',
    label: 'Library',
    baseUrl: 'https://library.byuh.edu',
    hostname: 'library.byuh.edu',
  },
  {
    source: 'mail_center',
    label: 'Mail Center',
    baseUrl: 'https://mailcenter.byuh.edu',
    hostname: 'mailcenter.byuh.edu',
  },
  {
    source: 'marketing_and_communications',
    label: 'Marketing and Communications',
    baseUrl: 'https://marcom.byuh.edu',
    hostname: 'marcom.byuh.edu',
  },
  {
    source: 'faculty_of_math_and_computing',
    label: 'Faculty of Math & Computing',
    baseUrl: 'https://mc.byuh.edu',
    hostname: 'mc.byuh.edu',
  },
  {
    source: 'mckay_center',
    label: 'McKay Center',
    baseUrl: 'https://mckaycenter.byuh.edu',
    hostname: 'mckaycenter.byuh.edu',
  },
  {
    source: 'jonathan_napela_center',
    label: 'Jonathan Nāpela Center for Hawaiian & Pacific Studies',
    baseUrl: 'https://napelacenter.byuh.edu',
    hostname: 'napelacenter.byuh.edu',
  },
  {
    source: 'news',
    label: 'BYU–Hawaii News',
    baseUrl: 'https://news.byuh.edu',
    hostname: 'news.byuh.edu',
  },
  {
    source: 'office_of_information_technology',
    label: 'Office of Information Technology',
    baseUrl: 'https://oit.byuh.edu',
    hostname: 'oit.byuh.edu',
  },
  {
    source: 'policies',
    label: 'Policies',
    baseUrl: 'https://policies.byuh.edu',
    hostname: 'policies.byuh.edu',
  },
  {
    source: 'office_of_the_president',
    label: 'Office of the President',
    baseUrl: 'https://president.byuh.edu',
    hostname: 'president.byuh.edu',
  },
  {
    source: 'print_services',
    label: 'Print Services',
    baseUrl: 'https://printservices.byuh.edu',
    hostname: 'printservices.byuh.edu',
  },
  {
    source: 'purchasing',
    label: 'Purchasing',
    baseUrl: 'https://purchasing.byuh.edu',
    hostname: 'purchasing.byuh.edu',
  },
  {
    source: 'faculty_of_religious_education',
    label: 'Faculty of Religious Education',
    baseUrl: 'https://religion.byuh.edu',
    hostname: 'religion.byuh.edu',
  },
  {
    source: 'report_a_concern',
    label: 'Report a Concern',
    baseUrl: 'https://reportaconcern.byuh.edu',
    hostname: 'reportaconcern.byuh.edu',
  },
  {
    source: 'relationships_and_family_development',
    label: 'Relationships & Family Development',
    baseUrl: 'https://rfd.byuh.edu',
    hostname: 'rfd.byuh.edu',
  },
  {
    source: 'religious_freedom',
    label: 'Religious Freedom & Human Dignity Initiative',
    baseUrl: 'https://rfhd.byuh.edu',
    hostname: 'rfhd.byuh.edu',
  },
  {
    source: 'safety_and_risk_management',
    label: 'Safety & Risk Management',
    baseUrl: 'https://safety.byuh.edu',
    hostname: 'safety.byuh.edu',
  },
  {
    source: 'university_scheduling',
    label: 'University Scheduling',
    baseUrl: 'https://scheduling.byuh.edu',
    hostname: 'scheduling.byuh.edu',
  },
  {
    source: 'faculty_of_sciences',
    label: 'Faculty of Sciences',
    baseUrl: 'https://sciences.byuh.edu',
    hostname: 'sciences.byuh.edu',
  },
  {
    source: 'seasider_sports',
    label: 'Seasider Sports & Activities',
    baseUrl: 'https://seasidersports.byuh.edu',
    hostname: 'seasidersports.byuh.edu',
  },
  {
    source: 'campus_security',
    label: 'Campus Security',
    baseUrl: 'https://security.byuh.edu',
    hostname: 'security.byuh.edu',
  },
  {
    source: 'speeches',
    label: 'BYU–Hawaii Speeches',
    baseUrl: 'https://speeches.byuh.edu',
    hostname: 'speeches.byuh.edu',
  },
  {
    source: 'student_leadership',
    label: 'Student Leadership & Service',
    baseUrl: 'https://student.byuh.edu',
    hostname: 'student.byuh.edu',
  },
  {
    source: 'sustainability',
    label: 'Kumuwaiwai Center for Sustainability',
    baseUrl: 'https://sustainability.byuh.edu',
    hostname: 'sustainability.byuh.edu',
  },
  {
    source: 'title_ix',
    label: 'Title IX Office',
    baseUrl: 'https://titleix.byuh.edu',
    hostname: 'titleix.byuh.edu',
  },
  {
    source: 'travel',
    label: 'Travel Office',
    baseUrl: 'https://travel.byuh.edu',
    hostname: 'travel.byuh.edu',
  },
  {
    source: 'urc',
    label: 'Undergraduate Research Conference',
    baseUrl: 'https://urc.byuh.edu',
    hostname: 'urc.byuh.edu',
  },
  {
    source: 'wards_and_stakes',
    label: 'Wards and Stakes',
    baseUrl: 'https://wards.byuh.edu',
    hostname: 'wards.byuh.edu',
  },
  {
    source: 'willes_center',
    label: 'Willes Center for International Entrepreneurship',
    baseUrl: 'https://willescenter.byuh.edu',
    hostname: 'willescenter.byuh.edu',
  },
];

export const MAX_PAGES_PER_SITE = 100;
/** Pause between page requests to the same site. */
const REQUEST_DELAY_MS = 1000;
/** Statuses that usually mean "slow down" from a rate limiter or bot filter. */
const BACKOFF_STATUSES = new Set([403, 429, 503]);
/** Wait times before each retry of a pushed-back request. */
const RETRY_DELAYS_MS = [5_000, 20_000];
/** Give up on a site after this many pushed-back pages in a row. */
const MAX_CONSECUTIVE_BLOCKS = 5;

function normalizeUrl(href: string, site: SiteConfig): string | null {
  try {
    const url = new URL(href, site.baseUrl);

    if (url.hostname !== site.hostname) return null;

    // Skip non-page resources
    if (url.pathname.match(/\.(pdf|png|jpg|jpeg|gif|svg|css|js|ico|xml|rss)$/i)) return null;

    // If this site is scoped to a sub-section, enforce that prefix.
    if (site.pathPrefix && !url.pathname.startsWith(site.pathPrefix)) return null;

    // Strip hash and search params for dedup
    url.hash = '';
    url.search = '';

    // Normalize to https and remove trailing slash for consistency
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return site.baseUrl + path;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/**
 * GET a page, backing off and retrying when the server pushes back
 * (403/429/503). Honors Retry-After when it is a sane number of seconds.
 */
async function getWithBackoff(url: string, deadline?: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'BYUH-Assistant-Bot/1.0 (internal chatbot indexer)',
        },
      });
    } catch (err) {
      const status = statusOf(err);
      if (!status || !BACKOFF_STATUSES.has(status) || attempt >= RETRY_DELAYS_MS.length) throw err;
      const retryAfter = Number(axios.isAxiosError(err) ? err.response?.headers['retry-after'] : NaN);
      const wait = retryAfter > 0 && retryAfter <= 120 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt];
      if (deadline && Date.now() + wait >= deadline) throw err;
      console.warn(`  ${status} from ${url}, retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

type FetchedPage = { url: string; title: string; content: string; links: string[] };

/**
 * `'blocked'` means the server kept refusing us even after backing off.
 * `'failed'` means the page couldn't be read for a reason that may be
 * temporary (timeout, network error, 5xx), so its stored copy should be kept.
 * `null` means there is no page worth storing (404, not HTML, no text).
 */
async function fetchPage(
  url: string,
  site: SiteConfig,
  deadline?: number
): Promise<FetchedPage | 'blocked' | 'failed' | null> {
  try {
    const response = await getWithBackoff(url, deadline);

    const contentType = String(response.headers['content-type'] || '');
    if (!contentType.includes('text/html')) return null;

    const $ = cheerio.load(response.data);

    // Extract internal links before removing elements
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const normalized = normalizeUrl(href, site);
        if (normalized) links.push(normalized);
      }
    });

    // Remove non-content elements
    $('script, style, nav, footer, header, noscript, iframe, img, svg, .menu, .nav, .footer, .header, [role="navigation"], [role="banner"]').remove();

    // Flatten tables into self-describing lines BEFORE generic text
    // extraction. Plain `.text()` glues cells together with no delimiters
    // ("Spring (April)July 1November 1April 1..."), and chunking can separate
    // the header row from the data rows entirely — the model then has to
    // guess which value belongs to which column (it quoted the *priority*
    // deadline as the Spring application deadline). Emitting "Label — Col:
    // val; Col: val" keeps every row interpretable on its own.
    const escapeCell = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    $('table').each((_, el) => {
      const rows: string[][] = [];
      $(el)
        .find('tr')
        .each((_, tr) => {
          const cells = $(tr)
            .find('th, td')
            .map((_, c) => $(c).text().replace(/\s+/g, ' ').trim())
            .get();
          if (cells.some(Boolean)) rows.push(cells);
        });
      if (rows.length === 0) {
        $(el).remove();
        return;
      }
      // First row is treated as the header; the first cell of each data row
      // is its label (e.g. "Spring (April)").
      const header = rows[0];
      const lines = rows.slice(1).map((cells) => {
        const label = cells[0] ?? '';
        const pairs = cells
          .slice(1)
          .map((value, i) => ({ column: header[i + 1] ?? '', value }))
          .filter((p) => p.column && p.value)
          .map((p) => `${p.column}: ${p.value}`);
        const line = pairs.length
          ? `${label} — ${pairs.join('; ')}`
          : cells.filter(Boolean).join(' | ');
        return escapeCell(line);
      });
      $(el).replaceWith(`\n${lines.join('\n')}\n`);
    });

    const title = $('title').text().trim() || $('h1').first().text().trim() || '';

    // Preserve block-level structure as newlines so the chunker can split
    // on paragraph/heading/list-item boundaries rather than mid-sentence.
    // Without this, Cheerio's `.text()` flattens everything into one line
    // and a bullet list like "3.5 GPA / 3.6 GPA / 3.7 GPA" becomes a blob
    // that fragments unpredictably across chunk boundaries.
    $('br').replaceWith('\n');
    $('p, h1, h2, h3, h4, h5, h6, li, tr, blockquote, section, article, div').each((_, el) => {
      $(el).append('\n\n');
    });

    // Try to get main content area first, fall back to body
    const mainContent = $('main, [role="main"], .content, #content, article').first();
    const textSource = mainContent.length ? mainContent : $('body');
    const content = textSource
      .text()
      // Collapse horizontal whitespace but keep line breaks intact.
      .replace(/[ \t]+/g, ' ')
      // Trim spaces around newlines and cap consecutive blank lines.
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!content || content.length < 50) return null;

    return { url, title, content, links };
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, (err as Error).message);
    const status = statusOf(err);
    if (status && BACKOFF_STATUSES.has(status)) return 'blocked';
    // A 4xx (404, 410, …) means the page is gone; anything else may pass.
    if (status && status >= 400 && status < 500) return null;
    return 'failed';
  }
}

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  source: string;
}

/**
 * Where a crawl of one subdomain has got to. It is saved between batches so
 * a site too big for one serverless function carries on where it stopped
 * instead of starting over.
 */
export interface CrawlState {
  /** URLs still to visit, in breadth-first order. */
  queue: string[];
  /** URLs already handled (saved, skipped, or failed) this pass. */
  visited: string[];
  /**
   * URLs that couldn't be read this pass for a reason that may be temporary.
   * Their stored chunks are kept when the pass cleans up stale pages.
   */
  kept: string[];
}

/**
 * - `complete`: every reachable page (up to MAX_PAGES_PER_SITE) was handled.
 * - `timeout`: the deadline hit first; resume from the saved state.
 * - `blocked`: the server refused too many pages in a row, so we stopped.
 */
export type CrawlOutcome = 'complete' | 'timeout' | 'blocked';

export function newCrawlState(site: SiteConfig): CrawlState {
  return { queue: [site.baseUrl + (site.startPath ?? '/')], visited: [], kept: [] };
}

/**
 * Crawl a subdomain breadth-first, following in-hostname links, up to
 * `MAX_PAGES_PER_SITE` pages per pass. Each readable page is handed to
 * `onPage` (which saves it) before the next one is fetched, and `state` is
 * updated in place, so the caller can save it and resume later.
 *
 * `deadline` (epoch ms) stops the crawl before fetching another page; a page
 * whose fetch was cut short by the deadline goes back on the queue.
 */
export async function crawlSite(
  site: SiteConfig,
  state: CrawlState,
  options: {
    deadline?: number;
    onPage: (page: ScrapedPage) => Promise<void>;
    /** Called after each page, e.g. to checkpoint `state`. */
    afterPage?: () => Promise<void>;
  }
): Promise<CrawlOutcome> {
  const { deadline, onPage, afterPage } = options;
  const visited = new Set(state.visited);
  const queued = new Set(state.queue);
  let consecutiveBlocks = 0;

  console.log(
    `\n=== Scraping ${site.label} (${site.baseUrl})${visited.size ? `, resuming after ${visited.size} URLs` : ''} ===`
  );

  while (state.queue.length > 0 && visited.size < MAX_PAGES_PER_SITE) {
    if (deadline && Date.now() >= deadline) {
      console.log(`${site.label}: deadline reached after ${visited.size} URLs, will resume`);
      return 'timeout';
    }
    const url = state.queue.shift()!;
    queued.delete(url);
    if (visited.has(url)) continue;

    console.log(`Scraping: ${url}`);
    const page = await fetchPage(url, site, deadline);

    if ((page === 'blocked' || page === 'failed') && deadline && Date.now() >= deadline) {
      // Probably cut short by the deadline, not the site: try it next time.
      state.queue.unshift(url);
      console.log(`${site.label}: deadline reached after ${visited.size} URLs, will resume`);
      return 'timeout';
    }

    visited.add(url);
    state.visited.push(url);

    if (page === 'blocked' || page === 'failed') {
      state.kept.push(url);
    }
    if (page === 'blocked') {
      if (++consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
        console.warn(`${site.label}: server refused ${consecutiveBlocks} pages in a row, stopping this site`);
        return 'blocked';
      }
    } else {
      consecutiveBlocks = 0;
    }

    if (page && page !== 'blocked' && page !== 'failed') {
      await onPage({ url: page.url, title: page.title, content: page.content, source: site.source });
      console.log(`  -> ${page.title || url} (${page.content.length} chars)`);

      for (const link of page.links) {
        if (!visited.has(link) && !queued.has(link)) {
          state.queue.push(link);
          queued.add(link);
        }
      }
    }

    await afterPage?.();

    // Be polite - don't hammer the server
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`${site.label} complete: ${visited.size} URLs visited`);
  return 'complete';
}

/** Crawl a whole subdomain in one go and return its pages (no deadline). */
export async function scrapeSite(site: SiteConfig): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];
  await crawlSite(site, newCrawlState(site), { onPage: async (p) => void pages.push(p) });
  return pages;
}

/**
 * Crawl every configured BYU–Hawaii subdomain and return the merged list of
 * pages. Each page is tagged with its `source` so the ingest pipeline can
 * persist it and the chat route can prioritize results by subdomain.
 */
export async function scrapeAllSites(): Promise<ScrapedPage[]> {
  const all: ScrapedPage[] = [];
  for (const site of SITE_CONFIGS) {
    try {
      const pages = await scrapeSite(site);
      all.push(...pages);
    } catch (err) {
      console.error(`Failed to scrape ${site.label}:`, (err as Error).message);
    }
  }
  console.log(`\nTotal pages scraped across all sites: ${all.length}`);
  return all;
}
