/**
 * Structured data for search engines (schema.org JSON-LD): who publishes
 * the site, and what a page is (a law, a deputy) and where it sits. Facts
 * the page already shows; nothing here is for readers.
 */

export const SITE_URL = 'https://www.holapolitica.org';

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON in a script tag: "<" escaped so no value can close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/** A trail from the home: ``[['Lleis', '/lleis'], ['La llei', '/initiatives/1']]``. */
export function breadcrumbs(home: string, trail: [string, string][]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [[home, '/'] as [string, string], ...trail].map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  };
}
