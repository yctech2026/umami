import { NextRequest, NextResponse } from 'next/server';

// 自定义中间件：检测浏览器语言并设置 NEXT_LOCALE cookie，但不修改 URL 路径
// 避免 next-intl/middleware 的 localePrefix: 'never' 重写导致 standalone 部署 404
export default function middleware(request: NextRequest) {
  const defaultLocale = process.env.DEFAULT_LOCALE || 'en-US';
  const supportedLocales = ['en-US', 'zh-CN'];

  // 检查是否已有 locale cookie
  const existingLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (existingLocale && supportedLocales.includes(existingLocale)) {
    return NextResponse.next();
  }

  // 从 Accept-Language header 检测
  const acceptLang = request.headers.get('accept-language') || '';
  let locale = defaultLocale;

  if (acceptLang.startsWith('zh')) {
    locale = 'zh-CN';
  }

  const response = NextResponse.next();
  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|intl|.*\\..*).*)'],
};
