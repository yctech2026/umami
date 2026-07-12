'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Column,
  DataColumn,
  DataTable,
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
import { Key, Plus, Trash, Eye, EyeOff, Copy } from '@/components/icons';
import { useApi, useMobile } from '@/components/hooks';
import { ConfirmationForm } from '@/components/common/ConfirmationForm';
import { Empty } from '@/components/common/Empty';
import { LoadingPanel } from '@/components/common/LoadingPanel';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastChars: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<{ id: string; key: string } | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { get, post, del } = useApi();
  const { toast } = useToast();
  const { isMobile } = useMobile();

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get('/keys');
      setKeys(data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [get]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (data: any, close: () => void) => {
    try {
      const key = await post('/keys', data);
      setNewKey({ id: key.id, key: key.key });
      toast('API key created');
      loadKeys();
      close();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await del(`/keys/${deleteId}`);
      toast('API key deleted');
      setDeleteId(null);
      loadKeys();
    } catch (err) {
      console.error(err);
    }
    setDeleting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  };

  return (
    <Column gap="6">
      {/* Header */}
      <Row justifyContent="space-between" alignItems="center" wrap="wrap" gap>
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
              {({ close }: any) => (
                <Form
                  onSubmit={(data: any) => {
                    handleCreate(data, close);
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

      {/* Description */}
      <Text size="sm" color="muted">
        API keys allow you to access the Umami API. Each key inherits your user permissions.
      </Text>

      {/* Newly created key banner */}
      {newKey && (
        <Column
          gap="3"
          backgroundColor="surface-sunken"
          padding="4"
          borderRadius
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
            backgroundColor="surface-base"
            padding="3"
            borderRadius
          >
            <Text
              style={{
                flex: 1,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              }}
            >
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

      {/* Key list */}
      <LoadingPanel
        data={keys}
        isLoading={loading}
        isEmpty={!loading && keys.length === 0}
        renderEmpty={() => (
          <Column alignItems="center" gap="3" paddingY="12">
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
        )}
      >
        <DataTable data={keys} displayMode={isMobile ? 'cards' : undefined}>
          <DataColumn id="name" label="Name">
            {(row: ApiKey) => <Text weight="bold">{row.name}</Text>}
          </DataColumn>
          <DataColumn id="key" label="Key">
            {(row: ApiKey) => (
              <Row gap="2" alignItems="center">
                <Text
                  size="sm"
                  style={{ fontFamily: 'monospace' }}
                  color="muted"
                >
                  {row.prefix}
                  {row.lastChars}
                </Text>
              </Row>
            )}
          </DataColumn>
          <DataColumn id="created" label="Created" width="160px">
            {(row: ApiKey) => (
              <Text size="sm" color="muted">
                {new Date(row.createdAt).toLocaleDateString()}
              </Text>
            )}
          </DataColumn>
          <DataColumn id="action" align="end" width="80px">
            {(row: ApiKey) => (
              <Row gap="1">
                <Button
                  variant="quiet"
                  aria-label="Delete"
                  onPress={() => {
                    setDeleteId(row.id);
                    setDeleteName(row.name);
                  }}
                >
                  <Icon size="sm">
                    <Trash />
                  </Icon>
                </Button>
              </Row>
            )}
          </DataColumn>
        </DataTable>
      </LoadingPanel>

      {/* Delete confirmation dialog */}
      <Modal isOpen={!!deleteId}>
        <Dialog style={{ width: 400 }}>
          <ConfirmationForm
            message={`Are you sure you want to delete the API key "${deleteName}"?`}
            isLoading={deleting}
            onConfirm={handleDelete}
            onClose={() => setDeleteId(null)}
            buttonLabel="Delete"
            buttonVariant="danger"
          />
        </Dialog>
      </Modal>
    </Column>
  );
}
