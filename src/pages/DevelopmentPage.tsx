import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  oauthCredentialsGet,
  oauthCredentialsSet,
  pickOAuthFile,
} from "../lib/tauri";
import { formatErrorMessage } from "../lib/labels";
import type { OAuthCredentialsInfo } from "../types";

interface Props {
  onAuthUpdated: () => Promise<void>;
}

export default function DevelopmentPage({ onAuthUpdated }: Props) {
  const [info, setInfo] = useState<OAuthCredentialsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshInfo() {
    const next = await oauthCredentialsGet();
    setInfo(next);
  }

  useEffect(() => {
    void (async () => {
      try {
        await refreshInfo();
      } catch (err) {
        setError(formatErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSelectFile() {
    const selected = await pickOAuthFile();
    if (!selected) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await oauthCredentialsSet(selected);
      await refreshInfo();
      await onAuthUpdated();
      setMessage("資格情報を変更しました。再度 Google でログインしてください。");
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearCredentials() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await oauthCredentialsSet(null);
      await refreshInfo();
      await onAuthUpdated();
      setMessage("資格情報を削除しました。初期設定画面に戻るにはアプリを再読み込みしてください。");
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card withBorder padding="md" radius="md">
        <Center py="lg">
          <Loader />
        </Center>
      </Card>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>開発</Title>
        <Text c="dimmed" mt="xs">
          開発者向けの機能です。一般利用では設定を変更しないでください。
        </Text>
      </div>

      <Card withBorder padding="md" radius="md">
        <Title order={3} mb="md">
          OAuth 資格情報
        </Title>
        <Stack gap="md">
          {info ? (
            <Stack gap="xs">
              <Text size="sm">
                Client ID: <Code>{info.clientId}</Code>
              </Text>
              <Text size="sm">
                保存先: <Code>{info.effectivePath}</Code>
              </Text>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              資格情報が設定されていません。
            </Text>
          )}

          <Group gap="sm">
            <Button onClick={handleSelectFile} loading={busy} disabled={busy}>
              ファイルを選択
            </Button>
            {info ? (
              <Button
                variant="outline"
                color="red"
                onClick={handleClearCredentials}
                loading={busy}
                disabled={busy}
              >
                資格情報を削除
              </Button>
            ) : null}
          </Group>

          <Text size="xs" c="dimmed">
            資格情報を切り替えるとログアウトされ、再ログインが必要です。
          </Text>
        </Stack>
      </Card>

      {message ? <Alert color="green">{message}</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}
    </Stack>
  );
}
