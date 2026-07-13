import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  const headerStore = await headers();
  const acceptLang = headerStore.get('accept-language') || '';

  // 从环境变量或 Accept-Language header 检测 locale
  const userLocale = process.env.DEFAULT_LOCALE ||
    (acceptLang.startsWith('zh') ? 'zh-CN' : 'en-US');

  const messages = (await import(`../../public/intl/messages/${userLocale}.json`)).default;

  return {
    locale: userLocale,
    messages,
  };
});
