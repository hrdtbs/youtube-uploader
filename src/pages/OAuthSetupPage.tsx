import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Center,
  Code,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { oauthCredentialsSet, pickOAuthFile } from "../lib/tauri";
import { formatErrorMessage } from "../lib/labels";

interface Props {
  onConfigured: () => Promise<void>;
}

export default function OAuthSetupPage({ onConfigured }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectFile() {
    const selected = await pickOAuthFile();
    if (!selected) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await oauthCredentialsSet(selected);
      await onConfigured();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Center mih="100vh" bg="gray.0" p="lg">
      <Card withBorder padding="xl" radius="md" maw={560} w="100%">
        <Stack gap="lg">
          <div>
            <Title order={2}>初期設定</Title>
            <Text c="dimmed" mt="xs">
              YouTube API を利用するには、Google Cloud の OAuth 資格情報が必要です。
            </Text>
          </div>

          <Stack gap="xs">
            <Text fw={600}>手順</Text>
            <List size="sm" spacing="xs">
              <List.Item>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud Console
                </a>
                でプロジェクトを作成し、YouTube Data API v3 を有効化
              </List.Item>
              <List.Item>「OAuth クライアント ID」でデスクトップアプリを作成</List.Item>
              <List.Item>
                ダウンロードした JSON ファイル（<Code>oauth.json</Code>）を選択
              </List.Item>
            </List>
          </Stack>

          <Button onClick={handleSelectFile} loading={busy} disabled={busy} size="md">
            oauth.json を選択
          </Button>

          <Text size="xs" c="dimmed">
            資格情報はこの PC のアプリ設定フォルダに保存され、外部に送信されません。
          </Text>

          {error ? <Alert color="red">{error}</Alert> : null}
        </Stack>
      </Card>
    </Center>
  );
}
