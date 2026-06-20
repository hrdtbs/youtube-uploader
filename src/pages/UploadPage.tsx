import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Code,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import {
  onUploadProgress,
  pickDirectory,
  settingsGet,
  uploadPreview,
  uploadRun,
} from "../lib/tauri";
import { formatErrorMessage } from "../lib/labels";
import type { UploadPreviewItem, UploadProgressEvent } from "../types";

function logColor(kind: UploadProgressEvent["kind"]): string {
  switch (kind) {
    case "error":
      return "red";
    case "success":
      return "green";
    case "warning":
      return "yellow";
    default:
      return "gray";
  }
}

export default function UploadPage() {
  const [uploadDir, setUploadDir] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [force, setForce] = useState(false);
  const [delay, setDelay] = useState(10);
  const [preview, setPreview] = useState<UploadPreviewItem[]>([]);
  const [logs, setLogs] = useState<UploadProgressEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void settingsGet().then((settings) => {
      if (settings.upload_dir) {
        setUploadDir(settings.upload_dir);
      }
    });
  }, []);

  async function handlePickDirectory() {
    const selected = await pickDirectory("動画フォルダを選択");
    if (selected) {
      setUploadDir(selected);
    }
  }

  async function handlePreview() {
    setBusy(true);
    setError(null);
    try {
      const items = await uploadPreview({
        dir: uploadDir || undefined,
        recursive,
        force,
      });
      setPreview(items);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    setBusy(true);
    setError(null);
    setLogs([]);
    const unlisten = await onUploadProgress((event) => {
      setLogs((current) => [...current, event]);
    });
    try {
      await uploadRun({
        dir: uploadDir || undefined,
        recursive,
        force,
        delay,
      });
      await handlePreview();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      await unlisten();
      setBusy(false);
    }
  }

  return (
    <Paper p="md">
      <Stack gap="md">
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <TextInput
              label="動画フォルダ"
              value={uploadDir}
              onChange={(e) => setUploadDir(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="outline" onClick={handlePickDirectory}>
              選択
            </Button>
          </Group>

          <Checkbox
            label="サブディレクトリもスキャン"
            checked={recursive}
            onChange={(e) => setRecursive(e.currentTarget.checked)}
          />

          <Checkbox
            label="アップロード済みの動画も再度アップロード"
            checked={force}
            onChange={(e) => setForce(e.currentTarget.checked)}
          />

          <NumberInput
            label="アップロード間隔（秒）"
            min={0}
            value={delay}
            onChange={(value) => setDelay(Number(value) || 0)}
            w={160}
          />
        </Stack>

        <Group gap="sm">
          <Button variant="outline" onClick={handlePreview} loading={busy} disabled={busy}>
            プレビュー
          </Button>
          <Button onClick={handleUpload} loading={busy} disabled={busy}>
            アップロード実行
          </Button>
        </Group>

        {error ? <Alert color="red">{error}</Alert> : null}

        {preview.length > 0 ? (
          <Stack gap="sm">
            <Title order={3}>プレビュー ({preview.length})</Title>
            <Table.ScrollContainer minWidth={500}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ファイル</Table.Th>
                    <Table.Th>タイトル</Table.Th>
                    <Table.Th>公開予定</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((item) => (
                    <Table.Tr key={item.relative_path}>
                      <Table.Td>{item.relative_path}</Table.Td>
                      <Table.Td>{item.title}</Table.Td>
                      <Table.Td>{item.publish_at_local}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        ) : null}

        {logs.length > 0 ? (
          <Stack gap="sm">
            <Title order={3}>進捗ログ</Title>
            <ScrollArea h={200} type="auto">
              <Stack gap={4}>
                {logs.map((log, index) => (
                  <Code key={`${log.kind}-${index}`} block c={logColor(log.kind)}>
                    {log.message}
                  </Code>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
