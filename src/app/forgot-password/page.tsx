import type { Metadata } from 'next';
import { getBoolEnv } from '@/lib/env';
import { ForgotPasswordPage } from './ForgotPasswordPage';

export default async function () {
  if (getBoolEnv('DISABLE_LOGIN') || getBoolEnv('CLOUD_MODE')) {
    return null;
  }

  return <ForgotPasswordPage />;
}

export const metadata: Metadata = {
  title: 'Forgot password',
};
