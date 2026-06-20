import { useState } from "react";
import { authLogin } from "../lib/tauri";
import type { AuthStatus } from "../types";

interface Props {
  status: AuthStatus | null;
  onUpdated: () => Promise<void>;
}

export default function AuthPage({ status, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      await authLogin();
      await onUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>認証</h2>
      <p>
        アプリに同梱された OAuth 資格情報を使って Google アカウントでログインします。
        追加の client_secret.json は不要です。
      </p>

      <div className="card-grid">
        <div className="card">
          <h3>ステータス</h3>
          <dl className="meta-list">
            <dt>認証</dt>
            <dd>{status?.authenticated ? "済み" : "未認証"}</dd>
            <dt>トークン</dt>
            <dd>{status?.token_path}</dd>
            <dt>Refresh token</dt>
            <dd>{status?.refresh_token_present ? "あり" : "なし"}</dd>
            <dt>Access token 期限</dt>
            <dd>{status?.access_token_expires ?? "-"}</dd>
          </dl>
          {status?.message ? <p className="error">{status.message}</p> : null}
        </div>

        <div className="card">
          <h3>チャンネル</h3>
          {status?.channels?.length ? (
            <ul>
              {status.channels.map((channel) => (
                <li key={channel.id}>
                  {channel.title} ({channel.id})
                </li>
              ))}
            </ul>
          ) : (
            <p>チャンネル情報はまだありません。</p>
          )}
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={handleLogin} disabled={busy}>
          {busy ? "ブラウザで認証中..." : "Google でログイン"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="note">
        <h3>ブランドアカウントについて</h3>
        <p>
          ブランドアカウントの管理者の場合、OAuth 画面に管理対象チャンネルが表示されないことがあります（YouTube の制限）。
          その場合はチャンネルオーナーによるログインが必要です。
        </p>
      </div>
    </section>
  );
}
