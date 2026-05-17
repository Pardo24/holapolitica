import type { Metadata, Viewport } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

import { MobileBackBar } from '@/components/MobileBackBar';
import { PushBootstrap } from '@/components/PushBootstrap';
import { TopNav } from '@/components/TopNav';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site');
  return {
    // Anchors every relative URL Next emits for OG images, Twitter
    // cards and `<link rel="canonical">`. Without this, opengraph
    // image URLs become relative paths in `<head>` and many social
    // crawlers (Slack, Bluesky) fail to render the preview.
    metadataBase: new URL('https://www.holapolitica.org'),
    title: {
      default: t('name'),
      template: `%s · ${t('name')}`,
    },
    description: t('description'),
    applicationName: t('name'),
    appleWebApp: {
      capable: true,
      title: t('name'),
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
      ],
    },
    openGraph: {
      type: 'website',
      siteName: t('name'),
      description: t('description'),
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#fbf9f4',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const tFooter = await getTranslations('footer');
  // Embed routes (/embed/*) ship as iframable widgets and must NOT
  // carry the site chrome — newsrooms pasting our iframe into their
  // CMS were seeing the Hola Política navbar inside the widget,
  // making the whole thing look broken. We suppress nav + footer
  // when the current path is under /embed; the `x-pathname` header
  // is set by middleware.ts on every request.
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const isEmbed = pathname === '/embed' || pathname.startsWith('/embed/');

  return (
    // suppressHydrationWarning silences benign attribute injection by
    // browser extensions (Scribe, Grammarly, Dark Reader). Shallow — only
    // the html/body nodes; everything inside hydrates normally.
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {isEmbed ? (
            // Bare embed shell: only the page content, no nav, no
            // footer, no mobile back bar. The iframe host owns the
            // surrounding chrome.
            <main className="embed-shell">{children}</main>
          ) : (
            <div className="page">
              <PushBootstrap />
              <TopNav />
              <MobileBackBar />
              <main>{children}</main>

              <footer style={{ marginTop: 48, paddingTop: 18, borderTop: '1px solid var(--ink)', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span>{tFooter('principle')}</span>
                  <span>
                    <Link href={'/avui' as Route} style={{ color: 'var(--ink-2)', marginRight: 12 }}>
                      {tFooter('avui_link')}
                    </Link>
                    <Link href={'/recorregut' as Route} style={{ color: 'var(--ink-2)', marginRight: 12 }}>
                      {tFooter('lifecycle_link')}
                    </Link>
                    <Link href={'/about/data' as Route} style={{ color: 'var(--ink-2)', marginRight: 12 }}>
                      {tFooter('legal_link')}
                    </Link>
                    <Link href={'/journalists' as Route} style={{ color: 'var(--ink-2)', marginRight: 12 }}>
                      {tFooter('journalists_link')}
                    </Link>
                    <Link href={'/apidocs' as Route} style={{ color: 'var(--ink-2)', marginRight: 12 }}>
                      {tFooter('apidocs_link')}
                    </Link>
                    {tFooter('license_code')} · {tFooter('license_data')} · {tFooter('complementary')}
                  </span>
                </div>
              </footer>
            </div>
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
