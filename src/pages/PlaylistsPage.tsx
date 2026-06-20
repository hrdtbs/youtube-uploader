import { useEffect, useState } from "react";
import { playlistsAdd, videosList } from "../lib/tauri";
import type { ChannelVideo } from "../types";

export default function PlaylistsPage() {
  const [playlist, setPlaylist] = useState("");
  const [limit, setLimit] = useState(20);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void videosList(limit).then(setVideos).catch(() => undefined);
  }, [limit]);

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
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>再生リストに追加</h2>
      <div className="form-grid">
        <label>
          再生リスト ID / URL
          <input
            value={playlist}
            onChange={(e) => setPlaylist(e.target.value)}
            placeholder="PL... または https://www.youtube.com/playlist?list=..."
          />
        </label>
        <label>
          表示件数
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>ID</th>
              <th>タイトル</th>
              <th>公開状態</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(video.id)}
                    onChange={() => toggleVideo(video.id)}
                  />
                </td>
                <td>{video.id}</td>
                <td>{video.title}</td>
                <td>{video.privacy_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button type="button" onClick={handleAdd} disabled={busy || selected.length === 0}>
          選択した動画を追加 ({selected.length})
        </button>
      </div>

      {result ? <p className="success">{result}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
