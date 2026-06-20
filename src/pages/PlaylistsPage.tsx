import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import PlaylistPicker from "../components/PlaylistPicker";
import OpenOnYouTubeButton from "../components/OpenOnYouTubeButton";
import { playlistsAdd, videosList } from "../lib/tauri";
import { formatErrorMessage, privacyStatusLabel } from "../lib/labels";
import { formatPlaylistNames } from "../lib/youtube";
import type { ChannelVideo } from "../types";

interface Props {
  authenticated: boolean;
}

export default function PlaylistsPage({ authenticated }: Props) {
  const [playlist, setPlaylist] = useState("");
  const [limit, setLimit] = useState(20);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const loadVideos = useCallback(async () => {
    if (!authenticated) {
      setVideos([]);
      return;
    }
    setLoadingVideos(true);
    setError(null);
    try {
      setVideos(await videosList(limit));
    } catch (err) {
      setError(formatErrorMessage(err));
      setVideos([]);
    } finally {
      setLoadingVideos(false);
    }
  }, [authenticated, limit]);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  function toggleVideo(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function handleAdd() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await playlistsAdd(playlist || undefined, selected));
      await loadVideos();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper p="md">
      {!authenticated ? (
        <Text c="dimmed">右上の「Google でログイン」からログインしてください。</Text>
      ) : (
        <Stack gap="md">
          <Stack gap="sm">
            <PlaylistPicker
              value={playlist}
              onChange={setPlaylist}
              authenticated={authenticated}
              label="再生リスト"
            />
            <Group align="flex-end" gap="sm">
              <NumberInput
                label="表示件数"
                min={1}
                max={500}
                value={limit}
                onChange={(value) => setLimit(Number(value) || 1)}
                w={120}
              />
              <Button onClick={() => void loadVideos()} loading={loadingVideos} disabled={loadingVideos}>
                読み込み
              </Button>
            </Group>
          </Stack>

          {loadingVideos && videos.length === 0 ? (
            <Center py="lg">
              <Loader />
            </Center>
          ) : null}

          {!loadingVideos && videos.length === 0 ? (
            <Text c="dimmed">動画が見つかりませんでした。</Text>
          ) : null}

          {videos.length > 0 ? (
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      <VisuallyHidden>選択</VisuallyHidden>
                    </Table.Th>
                    <Table.Th>タイトル</Table.Th>
                    <Table.Th>再生リスト</Table.Th>
                    <Table.Th>公開状態</Table.Th>
                    <Table.Th>
                      <VisuallyHidden>YouTube</VisuallyHidden>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {videos.map((video) => (
                    <Table.Tr key={video.id}>
                      <Table.Td>
                        <Checkbox
                          checked={selected.includes(video.id)}
                          onChange={() => toggleVideo(video.id)}
                          aria-label={`${video.title} を選択`}
                        />
                      </Table.Td>
                      <Table.Td>{video.title}</Table.Td>
                      <Table.Td>{formatPlaylistNames(video.playlists)}</Table.Td>
                      <Table.Td>{privacyStatusLabel(video.privacy_status)}</Table.Td>
                      <Table.Td>
                        <OpenOnYouTubeButton videoId={video.id} title={video.title} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : null}

          <Group gap="sm">
            <Button onClick={handleAdd} loading={busy} disabled={busy || selected.length === 0}>
              選択した動画を追加 ({selected.length})
            </Button>
          </Group>

          {result ? <Alert color="green">{result}</Alert> : null}
          {error ? <Alert color="red">{error}</Alert> : null}
        </Stack>
      )}
    </Paper>
  );
}
