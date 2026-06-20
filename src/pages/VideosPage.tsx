import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { videosList } from "../lib/tauri";
import { formatErrorMessage, privacyStatusLabel } from "../lib/labels";
import { formatPlaylistNames } from "../lib/youtube";
import OpenOnYouTubeButton from "../components/OpenOnYouTubeButton";
import type { ChannelVideo } from "../types";

interface Props {
  authenticated: boolean;
}

export default function VideosPage({ authenticated }: Props) {
  const [limit, setLimit] = useState(20);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(async () => {
    if (!authenticated) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setVideos(await videosList(limit));
      setLoaded(true);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [authenticated, limit]);

  useEffect(() => {
    if (authenticated) {
      void handleLoad();
    } else {
      setVideos([]);
      setLoaded(false);
      setError(null);
    }
  }, [authenticated, handleLoad]);

  return (
    <Paper p="md" aria-busy={busy}>
      {!authenticated ? (
        <Text c="dimmed">右上の「Google でログイン」からログインしてください。</Text>
      ) : (
        <Stack gap="md">
          <Group align="flex-end" gap="sm">
            <NumberInput
              label="件数"
              min={1}
              max={500}
              value={limit}
              onChange={(value) => setLimit(Number(value) || 1)}
              w={120}
            />
            <Button onClick={() => void handleLoad()} loading={busy} disabled={busy}>
              読み込み
            </Button>
          </Group>

          {error ? <Alert color="red">{error}</Alert> : null}

          {busy && videos.length === 0 ? (
            <Center py="lg">
              <Loader />
            </Center>
          ) : null}

          {!busy && loaded && videos.length === 0 ? (
            <Text c="dimmed">動画が見つかりませんでした。</Text>
          ) : null}

          {videos.length > 0 ? (
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>タイトル</Table.Th>
                    <Table.Th>再生リスト</Table.Th>
                    <Table.Th>アップロード日</Table.Th>
                    <Table.Th>公開状態</Table.Th>
                    <Table.Th>公開予定</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>YouTube</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {videos.map((video) => (
                    <Table.Tr key={video.id}>
                      <Table.Td>{video.title}</Table.Td>
                      <Table.Td>{formatPlaylistNames(video.playlists)}</Table.Td>
                      <Table.Td>{video.uploaded_at}</Table.Td>
                      <Table.Td>{privacyStatusLabel(video.privacy_status)}</Table.Td>
                      <Table.Td>{video.publish_at ?? "-"}</Table.Td>
                      <Table.Td>
                        <OpenOnYouTubeButton videoId={video.id} title={video.title} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : null}
        </Stack>
      )}
    </Paper>
  );
}
