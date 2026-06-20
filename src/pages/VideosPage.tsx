import { useState } from "react";
import { videosList } from "../lib/tauri";
import type { ChannelVideo } from "../types";

export default function VideosPage() {
  const [limit, setLimit] = useState(20);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLoad() {
    setBusy(true);
    setError(null);
    try {
      setVideos(await videosList(limit));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>動画一覧</h2>
      <div className="inline-field">
        <label>
          件数
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
        <button type="button" onClick={handleLoad} disabled={busy}>
          読み込み
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>タイトル</th>
              <th>アップロード日</th>
              <th>公開状態</th>
              <th>公開予定</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id}>
                <td>{video.id}</td>
                <td>{video.title}</td>
                <td>{video.uploaded_at}</td>
                <td>{video.privacy_status}</td>
                <td>{video.publish_at ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
