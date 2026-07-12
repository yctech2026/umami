'use client';

import {
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  Icon,
  Text,
  TextField,
} from '@umami/react-zen';
import Link from 'next/link';
import { useState } from 'react';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { Logo } from '@/components/svg';

export function ForgotPasswordForm() {
  const { t, labels, getErrorMessage } = useMessages();
  const [submitted, setSubmitted] = useState(false);
  const { mutateAsync, error, isPending } = useUpdateQuery('/auth/forgot-password');

  const handleSubmit = async (data: any) => {
    await mutateAsync(data, {
      onSuccess: () => {
        setSubmitted(true);
      },
    });
  };

  if (submitted) {
    return (
      <Column justifyContent="center" alignItems="center" gap="6">
        <Icon size="lg">
          <Logo />
        </Icon>
        <Heading>umami</Heading>
        <Column
          style={{ minWidth: 300, textAlign: 'center' }}
          gap="4"
          alignItems="center"
        >
          <Text>
            If that user exists, a password reset link has been sent. In
            self-hosted mode, please contact your administrator to reset the
            password.
          </Text>
          <Link
            href="/login"
            style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
          >
            Back to login
          </Link>
        </Column>
      </Column>
    );
  }

  return (
    <Column justifyContent="center" alignItems="center" gap="6">
      <Icon size="lg">
        <Logo />
      </Icon>
      <Heading>umami</Heading>
      <Form
        onSubmit={handleSubmit}
        error={getErrorMessage(error)}
        style={{ minWidth: 300 }}
      >
        <FormField
          label={t(labels.username)}
          name="username"
          rules={{ required: t(labels.required) }}
        >
          <TextField autoComplete="username" />
        </FormField>
        <FormButtons>
          <FormSubmitButton
            variant="primary"
            style={{ flex: 1 }}
            isDisabled={isPending}
          >
            Send reset link
          </FormSubmitButton>
        </FormButtons>
      </Form>
      <Text size="sm" color="muted">
        Remember your password?{' '}
        <Link
          href="/login"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          Log in
        </Link>
      </Text>
    </Column>
  );
}
