import { useEffect, useState } from "react";
import {
  configLoad,
  configSave,
  pickDirectory,
  settingsGet,
  settingsSet,
} from "../lib/tauri";

export default function SettingsPage() {
  const [uploadDir, setUploadDir] = useState("");
  const [yaml, setYaml] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await settingsGet();
      setUploadDir(settings.upload_dir ?? "");
      setYaml(await configLoad());
    })();
  }, []);

  async function handlePickDirectory() {
    const selected = await pickDirectory("デフォルト動画フォルダ");
    if (selected) {
      setUploadDir(selected);
    }
  }

  async function handleSaveSettings() {
    setError(null);
    try {
      await settingsSet({ upload_dir: uploadDir || null });
      setSavedPath("settings saved");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleSaveConfig() {
    setError(null);
    try {
      setSavedPath(await configSave(yaml));
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <section className="panel">
      <h2>設定</h2>

      <div className="card">
        <h3>デフォルト動画フォルダ</h3>
        <div className="inline-field">
          <input value={uploadDir} onChange={(e) => setUploadDir(e.target.value)} />
          <button type="button" onClick={handlePickDirectory}>
            選択
          </button>
          <button type="button" onClick={handleSaveSettings}>
            保存
          </button>
        </div>
      </div>

      <div className="card">
        <h3>config.yaml</h3>
        <textarea
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
          rows={24}
          spellCheck={false}
        />
        <div className="actions">
          <button type="button" onClick={handleSaveConfig}>
            設定を保存
          </button>
        </div>
      </div>

      {savedPath ? <p className="success">保存しました: {savedPath}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
