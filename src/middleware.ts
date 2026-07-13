import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en-US', 'zh-CN'],
  defaultLocale: (process.env.DEFAULT_LOCALE || 'en-US') as 'en-US' | 'zh-CN',
  localeDetection: true,
  localePrefix: 'never', // 不改变 URL 路径
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|intl|.*\\..*).*)'],
};
