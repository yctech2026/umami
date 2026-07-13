import { useEffect } from 'react';
import { LOCALE_CONFIG } from '@/lib/constants';
import { httpGet } from '@/lib/fetch';
import { getDateLocale, getTextDirection } from '@/lib/lang';
import { setItem } from '@/lib/storage';
import { setLocale, useApp } from '@/store/app';
import enUS from '../../../public/intl/messages/en-US.json';
import zhCN from '../../../public/intl/messages/zh-CN.json';
import { useForceUpdate } from './useForceUpdate';

const messages: Record<string, any> = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

const selector = (state: { locale: string }) => state.locale;

export function useLocale() {
  const locale = useApp(selector);
  const forceUpdate = useForceUpdate();
  const dir = getTextDirection(locale);
  const dateLocale = getDateLocale(locale);

  async function loadMessages(locale: string) {
    const { data } = await httpGet(`${process.env.basePath || ''}/intl/messages/${locale}.json`);

    messages[locale] = data;
  }

  async function saveLocale(value: string) {
    if (!messages[value]) {
      await loadMessages(value);
    }

    setItem(LOCALE_CONFIG, value);
    // 同步更新 cookie，使服务端下次渲染与客户端一致
    document.cookie = `NEXT_LOCALE=${value};path=/;sameSite=lax;max-age=${60 * 60 * 24 * 365}`;

    document.getElementById('__next')?.setAttribute('dir', getTextDirection(value));

    if (locale !== value) {
      setLocale(value);
    } else {
      forceUpdate();
    }
  }

  useEffect(() => {
    if (!messages[locale]) {
      saveLocale(locale);
    }
  }, [locale]);

  useEffect(() => {
    const url = new URL(window?.location?.href);
    const locale = url.searchParams.get('locale');

    if (locale) {
      saveLocale(locale);
    }
  }, []);

  return { locale, saveLocale, messages, dir, dateLocale };
}
