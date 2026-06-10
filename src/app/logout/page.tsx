import type { Metadata } from 'next';
import { getBoolEnv } from '@/lib/env';
import { LogoutPage } from './LogoutPage';

export default function () {
  if (getBoolEnv('DISABLE_LOGIN') || getBoolEnv('CLOUD_MODE')) {
    return null;
  }

  return <LogoutPage />;
}

export const metadata: Metadata = {
  title: 'Logout',
};
