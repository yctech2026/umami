import type { Metadata } from 'next';
import { getBoolEnv } from '@/lib/env';
import { LoginPage } from './LoginPage';

export default async function () {
  if (getBoolEnv('DISABLE_LOGIN') || getBoolEnv('CLOUD_MODE')) {
    return null;
  }

  return <LoginPage />;
}

export const metadata: Metadata = {
  title: 'Login',
};
