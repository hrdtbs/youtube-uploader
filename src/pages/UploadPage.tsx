import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  onUploadProgress,
  pickDirectory,
  settingsGet,
  uploadPreview,
  uploadRun,
} from '../lib/tauri';
import { formatErrorMessage } from '../lib/labels';
import type { UploadFileStatus, UploadPreviewItem, UploadProgressEvent } from '../types';

interface UploadProgressState {
  active: boolean;
  fileCount: number;
  fileIndex: number;
  currentFile: string;
  filePercent: number;
  fileStatuses: Record<string, UploadFileStatus>;
}

const INITIAL_PROGRESS_STATE: UploadProgressState = {
  active: false,
  fileCount: 0,
  fileIndex: 0,
  currentFile: '',
  filePercent: 0,
  fileStatuses: {},
};

function logColor(kind: UploadProgressEvent['kind']): string {
  switch (kind) {
    case 'error':
      return 'red';
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    default:
      return 'gray';
  }
}

function statusBadge(status: UploadFileStatus | undefined) {
  switch (status) {
    case 'uploading':
      return <Badge color="blue">アップロード中</Badge>;
    case 'success':
      return <Badge color="green">完了</Badge>;
    case 'error':
      return <Badge color="red">失敗</Badge>;
    case 'warning':
      return <Badge color="yellow">警告</Badge>;
    default:
      return <Badge color="gray">待機中</Badge>;
  }
}

function overallPercent(state: UploadProgressState): number {
  if (state.fileCount === 0) {
    return 0;
  }
  return Math.round(((state.fileIndex - 1) * 100 + state.filePercent) / state.fileCount);
}

function applyProgressEvent(
  state: UploadProgressState,
  event: UploadProgressEvent,
): UploadProgressState {
  const fileCount = event.file_count ?? state.fileCount;
  const fileIndex = event.file_index ?? state.fileIndex;
  const relativePath = event.relative_path ?? '';
  const fileStatuses = { ...state.fileStatuses };

  switch (event.kind) {
    case 'batch_start':
      return {
        ...state,
        active: true,
        fileCount,
        fileIndex: 0,
        currentFile: '',
        filePercent: 0,
      };
    case 'start':
      if (relativePath) {
        fileStatuses[relativePath] = 'uploading';
      }
      return {
        ...state,
        active: true,
        fileCount,
        fileIndex,
        currentFile: relativePath,
        filePercent: event.percent ?? 0,
        fileStatuses,
      };
    case 'progress':
      if (relativePath) {
        fileStatuses[relativePath] = 'uploading';
      }
      return {
        ...state,
        fileCount,
        fileIndex,
        currentFile: relativePath || state.currentFile,
        filePercent: event.percent ?? state.filePercent,
        fileStatuses,
      };
    case 'success':
      if (relativePath) {
        fileStatuses[relativePath] = 'success';
      }
      return {
        ...state,
        fileCount,
        fileIndex,
        currentFile: relativePath || state.currentFile,
        filePercent: event.percent ?? 100,
        fileStatuses,
      };
    case 'warning':
      if (relativePath) {
        fileStatuses[relativePath] = 'warning';
      }
      return {
        ...state,
        fileCount,
        fileIndex,
        currentFile: relativePath || state.currentFile,
        filePercent: event.percent ?? state.filePercent,
        fileStatuses,
      };
    case 'error':
      if (relativePath) {
        fileStatuses[relativePath] = 'error';
      }
      return {
        ...state,
        fileCount,
        fileIndex,
        currentFile: relativePath || state.currentFile,
        fileStatuses,
      };
    case 'summary':
      return {
        ...state,
        active: false,
        filePercent: 100,
      };
    default:
      return state;
  }
}

export default function UploadPage() {
  const [uploadDir, setUploadDir] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [force, setForce] = useState(false);
  const [delay, setDelay] = useState(10);
  const [preview, setPreview] = useState<UploadPreviewItem[]>([]);
  const [logs, setLogs] = useState<UploadProgressEvent[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>(INITIAL_PROGRESS_STATE);
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
    const selected = await pickDirectory('動画フォルダを選択');
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

    const pendingStatuses = Object.fromEntries(
      preview.map((item) => [item.relative_path, 'pending' as UploadFileStatus]),
    );
    setUploadProgress({
      ...INITIAL_PROGRESS_STATE,
      active: true,
      fileStatuses: pendingStatuses,
    });

    const unlisten = await onUploadProgress((event) => {
      setLogs((current) => [...current, event]);
      setUploadProgress((current) => applyProgressEvent(current, event));
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

  const showProgress = uploadProgress.active || uploadProgress.fileCount > 0;
  const overall = overallPercent(uploadProgress);

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

        {showProgress ? (
          <Stack gap="sm">
            <Title order={3}>アップロード進捗</Title>
            <Text size="sm">
              全体進捗 {uploadProgress.fileIndex} / {uploadProgress.fileCount} ファイル
            </Text>
            <Progress value={overall} size="lg" animated={uploadProgress.active} />
            <Text size="sm" c="dimmed">
              {overall}%
            </Text>
            {uploadProgress.currentFile ? (
              <Stack gap={4}>
                <Text size="sm">現在: {uploadProgress.currentFile}</Text>
                <Progress
                  value={uploadProgress.filePercent}
                  size="md"
                  animated={uploadProgress.active}
                />
                <Text size="sm" c="dimmed">
                  {uploadProgress.filePercent}%
                </Text>
              </Stack>
            ) : null}
          </Stack>
        ) : null}

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
                    {showProgress ? <Table.Th>状態</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((item) => (
                    <Table.Tr key={item.relative_path}>
                      <Table.Td>{item.relative_path}</Table.Td>
                      <Table.Td>{item.title}</Table.Td>
                      <Table.Td>{item.publish_at_local}</Table.Td>
                      {showProgress ? (
                        <Table.Td>
                          {statusBadge(uploadProgress.fileStatuses[item.relative_path])}
                        </Table.Td>
                      ) : null}
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
