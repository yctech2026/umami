import { create } from 'zustand';
import {
  DATE_RANGE_CONFIG,
  DEFAULT_DATE_RANGE_VALUE,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  LOCALE_CONFIG,
  THEME_CONFIG,
  TIMEZONE_CONFIG,
} from '@/lib/constants';
import { getTimezone } from '@/lib/date';
import { getItem } from '@/lib/storage';

function getInitialLocale() {
  // 优先使用 cookie（与服务端一致），避免水合不匹配
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]*)/);
    if (match) return match[1];
  }
  return getItem(LOCALE_CONFIG) || process.env.defaultLocale || DEFAULT_LOCALE;
}

const initialState = {
  locale: getInitialLocale(),
  theme: getItem(THEME_CONFIG) || DEFAULT_THEME,
  timezone: getItem(TIMEZONE_CONFIG) || getTimezone(),
  dateRangeValue: getItem(DATE_RANGE_CONFIG) || DEFAULT_DATE_RANGE_VALUE,
  share: null,
  shareToken: null,
  user: null,
  config: null,
};

const store = create(() => ({ ...initialState }));

export function setTimezone(timezone: string) {
  store.setState({ timezone });
}

export function setLocale(locale: string) {
  store.setState({ locale });
}

export function setShareData(
  share: object | null,
  shareToken: { token?: string } | null,
) {
  store.setState({ share, shareToken });
}

export function setUser(user: object) {
  store.setState({ user });
}

export function setConfig(config: object) {
  store.setState({ config });
}

export function setDateRangeValue(dateRangeValue: string) {
  store.setState({ dateRangeValue });
}

export const useApp = store;
