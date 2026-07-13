import { Column, Form, FormButtons, FormField, FormSubmitButton, Heading, PasswordField, Row, Text, TextField } from '@umami/react-zen';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { setClientAuthToken } from '@/lib/client';
import { setUser } from '@/store/app';

export function LoginForm() {
  const { t, labels, getErrorMessage } = useMessages();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutateAsync, error } = useUpdateQuery('/auth/login');

  const handleSubmit = async (data: any) => {
    // Map email -> username for API compatibility
    const payload = {
      username: data.email,
      password: data.password,
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
        {t('label.login')}
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
          label={t('label.email')}
          data-test="input-email"
          name="email"
          rules={{ required: t(labels.required) }}
        >
          <TextField autoComplete="username" />
        </FormField>
        <FormField
          label={t(labels.password)}
          data-test="input-password"
          name="password"
          rules={{ required: t(labels.required) }}
        >
          <PasswordField autoComplete="current-password" />
        </FormField>
        <FormButtons style={{ paddingTop: '0.75rem' }}>
          <FormSubmitButton
            data-test="button-submit"
            variant="primary"
            style={{ flex: 1 }}
            isDisabled={false}
          >
            {t('label.login')}
          </FormSubmitButton>
        </FormButtons>
      </Form>

      <Column gap="3" alignItems="center">
        <Row gap="1">
          <Text size="base" style={{ color: '#111827' }}>{t(labels.dontHaveAccount)}</Text>
          <Link href="/signup" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
            <Text weight="bold" size="base">
              {t('label.signup')}
            </Text>
          </Link>
        </Row>
        <Link href="/forgot-password" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
          <Text weight="bold" size="base">
            {t(labels.forgotPassword)}
          </Text>
        </Link>
      </Column>
    </Column>
  );
}
