'use client';
import { Box, Button, Column, Icon, Row, Text } from '@umami/react-zen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLoginQuery } from '@/components/hooks';
import { Logo } from '@/components/svg';
import { SignupForm } from './SignupForm';

export function SignupPage() {
  const { user } = useLoginQuery();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  return (
    <>
      <style>{`
        .umami-auth-container {
          width: 100%;
          padding: 0 1rem;
          margin: 0 auto;
          box-sizing: border-box;
        }
        @media (min-width: 640px) { .umami-auth-container { max-width: 500px; } }
        @media (min-width: 768px) { .umami-auth-container { max-width: 740px; } }
        @media (min-width: 1024px) { .umami-auth-container { max-width: 1000px; } }
        @media (min-width: 1280px) { .umami-auth-container { max-width: 1240px; } }
        @media (min-width: 1536px) { .umami-auth-container { max-width: 1600px; } }
      `}</style>
      <Box className="umami-auth-container">
        <Column height="100vh">
          {/* Header */}
          <Row paddingY="6" justifyContent="space-between" alignItems="center">
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Row gap="2" alignItems="center">
                <Icon size="md">
                  <Logo />
                </Icon>
                <Text weight="bold" size="base">
                  Umami Cloud
                </Text>
              </Row>
            </Link>
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <Button variant="default" size="md">
                Log in
              </Button>
            </Link>
          </Row>

          {/* Main content */}
          <Column flexGrow={1} alignItems="center" style={{ paddingTop: '7rem' }}>
            <SignupForm />
          </Column>

          {/* Footer */}
          <Row paddingY="6" justifyContent="center" alignItems="center">
            <Text size="sm">&copy; 2026 Umami Software, Inc.</Text>
          </Row>
        </Column>
      </Box>
    </>
  );
}
