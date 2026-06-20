import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { authStatus, initApp } from "./lib/tauri";
import type { AuthStatus } from "./types";
import UploadPage from "./pages/UploadPage";
import VideosPage from "./pages/VideosPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import CategoriesPage from "./pages/CategoriesPage";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";

const navItems = [
  { to: "/upload", label: "アップロード" },
  { to: "/videos", label: "動画一覧" },
  { to: "/playlists", label: "再生リスト" },
  { to: "/categories", label: "カテゴリ" },
  { to: "/settings", label: "設定" },
  { to: "/auth", label: "認証" },
];

export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  async function refreshStatus() {
    const next = await authStatus();
    setStatus(next);
  }

  useEffect(() => {
    void (async () => {
      await initApp();
      await refreshStatus();
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="app-shell loading">読み込み中...</div>;
  }

  const needsAuth = !status?.authenticated && location.pathname !== "/auth";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>YouTube Uploader</h1>
          <p className="subtitle">
            {status?.authenticated
              ? `認証済み: ${status.channels.map((c) => c.title).join(", ") || "チャンネル情報なし"}`
              : "Google でログインして利用を開始してください"}
          </p>
        </div>
        <nav className="app-nav">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname === item.to ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {needsAuth ? (
          <Navigate to="/auth" replace />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route
              path="/auth"
              element={<AuthPage status={status} onUpdated={refreshStatus} />}
            />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
