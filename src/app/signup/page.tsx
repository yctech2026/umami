import type { Metadata } from 'next';
import { getBoolEnv } from '@/lib/env';
import { SignupPage } from './SignupPage';

export default async function () {
  if (getBoolEnv('DISABLE_LOGIN') || getBoolEnv('CLOUD_MODE')) {
    return null;
  }

  return <SignupPage />;
}

export const metadata: Metadata = {
  title: 'Sign up',
};
