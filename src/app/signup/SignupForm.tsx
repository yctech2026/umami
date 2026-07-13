import { Column, Form, FormButtons, FormField, FormSubmitButton, Heading, PasswordField, Row, Text, TextField } from '@umami/react-zen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { setClientAuthToken } from '@/lib/client';
import { setUser } from '@/store/app';

export function SignupForm() {
  const { t, labels, getErrorMessage } = useMessages();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutateAsync, error } = useUpdateQuery('/auth/register');

  const handleSubmit = async (data: any) => {
    // Map form fields to API fields
    const payload = {
      username: data.email,     // email → username for login
      password: data.password,
      name: data.name,          // name → displayName for profile
    };
    await mutateAsync(payload, {
      onSuccess: async ({ token, user }) => {
        setClientAuthToken(token);
        setUser(user);
        queryClient.removeQueries({ queryKey: ['login'] });
        router.push('/');
      },
      onError: (err) => {
        console.error(err);
      },
    });
  };

  return (
    <Column gap="6" alignItems="center">
      <Heading as="h2" weight="semibold" align="center" size="2xl">
        {t(labels.signup)}
      </Heading>

      <Form
        onSubmit={handleSubmit}
        error={getErrorMessage(error)}
        style={{ minWidth: 300 }}
      >
        {/* Anti-bot honeypot field (hidden) */}
        <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <FormField label={t(labels.confirmPassword)} name="confirm_password">
            <TextField autoComplete="off" />
          </FormField>
        </div>

        <FormField
          label={t(labels.name)}
          name="name"
          rules={{ required: t(labels.required) }}
        >
          <TextField autoComplete="name" />
        </FormField>
        <FormField
          label={t(labels.email)}
          name="email"
          rules={{ required: t(labels.required) }}
        >
          <TextField autoComplete="email" />
        </FormField>
        <FormField
          label={t(labels.password)}
          name="password"
          rules={{ required: t(labels.required) }}
        >
          <PasswordField autoComplete="new-password" />
        </FormField>
        <FormButtons style={{ paddingTop: '0.75rem' }}>
          <FormSubmitButton
            variant="primary"
            style={{ flex: 1 }}
            isDisabled={false}
          >
            {t(labels.signup)}
          </FormSubmitButton>
        </FormButtons>
      </Form>

      <Column gap="3" alignItems="center">
        <Row gap="1">
          <Text size="base" style={{ color: '#111827' }}>{t(labels.alreadyHaveAccount)}</Text>
          <Link href="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
            <Text weight="bold" size="base">
              {t(labels.login)}
            </Text>
          </Link>
        </Row>
        <Link
          href="https://umami.is/docs/self-host"
          target="_blank"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          <Text weight="bold" size="base">
            {t(labels.selfHostDocs)}
          </Text>
        </Link>
      </Column>
    </Column>
  );
}
