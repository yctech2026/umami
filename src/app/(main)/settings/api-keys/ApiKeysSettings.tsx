'use client';
import { useState, useEffect } from 'react';
import {
  Button,
  Column,
  Dialog,
  DialogTrigger,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  Icon,
  Modal,
  Row,
  Text,
  TextField,
  useToast,
} from '@umami/react-zen';
import { X, Plus, Copy, Key, Eye, EyeOff } from '@/components/icons';

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<any>(null);
  const [showKey, setShowKey] = useState(true);
  const { toast } = useToast();

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/keys');
      const data = await res.json();
      setKeys(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (data: any) => {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const key = await res.json();
      setNewKey(key);
      loadKeys();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) {
      return;
    }

    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    toast('API key deleted');
    loadKeys();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  };

  return (
    <Column gap="6">
      <Row justifyContent="space-between" alignItems="center">
        <Heading as="h2" size="2xl" weight="semibold">
          API Keys
        </Heading>
        <DialogTrigger>
          <Button variant="primary">
            <Icon size="sm">
              <Plus />
            </Icon>
            Create key
          </Button>
          <Modal>
            <Dialog title="Create API key" style={{ width: 400 }}>
              {({ close }) => (
                <Form
                  onSubmit={async (data: any) => {
                    await handleCreate(data);
                    close();
                  }}
                >
                  <FormField
                    label="Name"
                    name="name"
                    rules={{ required: 'Name is required' }}
                  >
                    <TextField placeholder="e.g., Production" />
                  </FormField>
                  <FormButtons>
                    <Button onPress={close}>Cancel</Button>
                    <FormSubmitButton variant="primary">Create</FormSubmitButton>
                  </FormButtons>
                </Form>
              )}
            </Dialog>
          </Modal>
        </DialogTrigger>
      </Row>

      <Text size="sm" color="muted">
        API keys allow you to access the Umami API. Each key inherits your user permissions.
      </Text>

      {newKey && (
        <Column
          gap="3"
          style={{
            background: 'var(--color-surface-sunken)',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <Row gap="2" alignItems="center">
            <Icon size="md">
              <Key />
            </Icon>
            <Text weight="bold">Key created</Text>
          </Row>
          <Text size="sm" color="muted">
            Copy this key now. You won&apos;t be able to see it again.
          </Text>
          <Row
            gap="2"
            alignItems="center"
            style={{
              background: 'var(--color-surface)',
              padding: '0.75rem',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          >
            <Text style={{ flex: 1, wordBreak: 'break-all' }}>
              {showKey ? newKey.key : '••••••••••••••••••••••••••••••••••••'}
            </Text>
            <Button variant="quiet" onPress={() => setShowKey(!showKey)}>
              <Icon size="sm">{showKey ? <EyeOff /> : <Eye />}</Icon>
            </Button>
            <Button variant="quiet" onPress={() => copyToClipboard(newKey.key)}>
              <Icon size="sm">
                <Copy />
              </Icon>
            </Button>
          </Row>
          <Button variant="default" onPress={() => setNewKey(null)}>
            Done
          </Button>
        </Column>
      )}

      {loading ? (
        <Text>Loading...</Text>
      ) : keys.length === 0 ? (
        <Column alignItems="center" gap="3" style={{ padding: '3rem 0' }}>
          <Icon size="xl">
            <Key />
          </Icon>
          <Text size="lg" weight="semibold">
            No API keys
          </Text>
          <Text size="sm" color="muted">
            Create your first API key to get started.
          </Text>
        </Column>
      ) : (
        <Column gap="3">
          {keys.map((key: any) => (
            <Row
              key={key.id}
              justifyContent="space-between"
              alignItems="center"
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
            >
              <Column gap="1">
                <Text weight="bold">{key.name}</Text>
                <Row gap="2" alignItems="center">
                  <Text
                    size="sm"
                    style={{
                      fontFamily: 'monospace',
                      color: 'var(--color-muted)',
                    }}
                  >
                    {key.prefix}
                    {key.lastChars}
                  </Text>
                  <Text size="sm" color="muted">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </Text>
                </Row>
              </Column>
              <Button variant="quiet" onPress={() => handleDelete(key.id)}>
                <Icon size="sm">
                  <X />
                </Icon>
              </Button>
            </Row>
          ))}
        </Column>
      )}
    </Column>
  );
}
