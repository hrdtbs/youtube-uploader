import { useEffect, useState } from "react";
import {
  onUploadProgress,
  pickDirectory,
  settingsGet,
  uploadPreview,
  uploadRun,
} from "../lib/tauri";
import type { UploadPreviewItem, UploadProgressEvent } from "../types";

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
      setError(String(err));
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
      setError(String(err));
    } finally {
      await unlisten();
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>一括アップロード</h2>

      <div className="form-grid">
        <label>
          動画フォルダ
          <div className="inline-field">
            <input value={uploadDir} onChange={(e) => setUploadDir(e.target.value)} />
            <button type="button" onClick={handlePickDirectory}>
              選択
            </button>
          </div>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
          />
          サブディレクトリもスキャン
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          インデックス済みも再アップロード
        </label>

        <label>
          アップロード間隔（秒）
          <input
            type="number"
            min={0}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={handlePreview} disabled={busy}>
          Dry-run プレビュー
        </button>
        <button type="button" onClick={handleUpload} disabled={busy}>
          {busy ? "アップロード中..." : "アップロード実行"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {preview.length > 0 ? (
        <div className="table-wrap">
          <h3>プレビュー ({preview.length})</h3>
          <table>
            <thead>
              <tr>
                <th>ファイル</th>
                <th>タイトル</th>
                <th>公開予定</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item) => (
                <tr key={item.relative_path}>
                  <td>{item.relative_path}</td>
                  <td>{item.title}</td>
                  <td>{item.publish_at_local}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {logs.length > 0 ? (
        <div className="log-panel">
          <h3>進捗ログ</h3>
          <ul>
            {logs.map((log, index) => (
              <li key={`${log.kind}-${index}`} className={`log-${log.kind}`}>
                {log.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
