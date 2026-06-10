'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Column, Loading } from '@umami/react-zen';
import { LAST_TEAM_CONFIG } from '@/lib/constants';
import { getItem } from '@/lib/storage';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const lastTeam = getItem(LAST_TEAM_CONFIG);

    if (lastTeam) {
      router.replace(`/teams/${lastTeam}/websites`);
    } else {
      router.replace(`/websites`);
    }
  }, [router]);

  // Display loading spinner while redirecting (prevents blank white screen)
  return (
    <Column position="relative" height="100vh" width="100vw">
      <Loading icon="spinner" placement="center" />
    </Column>
  );
}
