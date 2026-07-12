import type { Metadata } from 'next';
import { ApiKeysSettings } from './ApiKeysSettings';

export const metadata: Metadata = {
  title: 'API Keys',
};

export default function () {
  return <ApiKeysSettings />;
}
