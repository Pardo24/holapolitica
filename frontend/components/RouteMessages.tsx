import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { CLIENT_NAMESPACES, ROUTE_NAMESPACES, pickMessages } from '@/lib/clientMessages';

/**
 * Gives one route's client components the extra message namespaces only
 * they read (see lib/clientMessages.ts). A nested provider replaces the
 * messages of the one above it rather than merging, so it carries the
 * site-wide namespaces too.
 */
export async function RouteMessages({
  route,
  children,
}: {
  route: keyof typeof ROUTE_NAMESPACES;
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, [...CLIENT_NAMESPACES, ...ROUTE_NAMESPACES[route]])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
