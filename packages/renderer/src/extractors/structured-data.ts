import * as cheerio from 'cheerio';

export interface StructuredDataItem {
  /** Schema.org @type */
  type: string;
  /** Raw JSON-LD or microdata as parsed object */
  data: Record<string, unknown>;
  /** Source format: json-ld, microdata, or rdfa */
  format: 'json-ld' | 'microdata' | 'rdfa';
}

export interface StructuredDataResult {
  items: StructuredDataItem[];
  hasJsonLd: boolean;
  hasMicrodata: boolean;
  schemaTypes: string[];
}

/**
 * Extract structured data (JSON-LD, Microdata) from rendered HTML.
 */
export function extractStructuredData(html: string): StructuredDataResult {
  const $ = cheerio.load(html);
  const items: StructuredDataItem[] = [];

  // 1. JSON-LD scripts
  $('script[type="application/ld+json"]').each((_i, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          items.push({
            type: extractSchemaType(entry),
            data: entry as Record<string, unknown>,
            format: 'json-ld',
          });
        }
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  });

  // 2. Microdata (itemscope/itemprop)
  $('[itemscope]').each((_i, el) => {
    const $el = $(el);
    const itemType = $el.attr('itemtype') || '';
    const data: Record<string, unknown> = { '@type': itemType };

    $el.find('[itemprop]').each((_j, prop) => {
      const $prop = $(prop);
      const name = $prop.attr('itemprop') || '';
      const value = $prop.attr('content') || $prop.text().trim();
      if (name) data[name] = value;
    });

    if (itemType) {
      items.push({
        type: itemType.split('/').pop() || itemType,
        data,
        format: 'microdata',
      });
    }
  });

  const hasJsonLd = items.some(i => i.format === 'json-ld');
  const hasMicrodata = items.some(i => i.format === 'microdata');
  const schemaTypes = [...new Set(items.map(i => i.type))];

  return { items, hasJsonLd, hasMicrodata, schemaTypes };
}

function extractSchemaType(data: Record<string, unknown>): string {
  const type = data['@type'];
  if (typeof type === 'string') return type;
  if (Array.isArray(type) && type.length > 0) return String(type[0]);
  return 'Unknown';
}
