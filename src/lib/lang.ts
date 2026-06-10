import { zhCN, enUS } from 'date-fns/locale';

export const languages: Record<string, { label: string; dateLocale?: Locale; dir?: string }> = {
  'en-US': { label: 'English (US)', dateLocale: enUS },
  'zh-CN': { label: '中文', dateLocale: zhCN },
};

export function getDateLocale(locale: string) {
  return languages[locale]?.dateLocale || enUS;
}

export function getTextDirection(locale: string) {
  return languages[locale]?.dir || 'ltr';
}
