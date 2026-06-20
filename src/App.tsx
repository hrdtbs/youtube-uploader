import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Center, Loader } from '@mantine/core';
import { authStatus, initApp, oauthCredentialsGet } from './lib/tauri';
import type { AuthStatus } from './types';
import AppLayout from './components/layout/AppLayout';
import UploadPage from './pages/UploadPage';
import VideosPage from './pages/VideosPage';
import PlaylistsPage from './pages/PlaylistsPage';
import SettingsPage from './pages/SettingsPage';
import DevelopmentPage from './pages/DevelopmentPage';
import OAuthSetupPage from './pages/OAuthSetupPage';

export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const authenticated = status?.authenticated ?? false;

  async function refreshStatus() {
    const next = await authStatus();
    setStatus(next);
  }

  async function refreshOAuthConfigured() {
    const info = await oauthCredentialsGet();
    setOauthConfigured(info !== null);
  }

  useEffect(() => {
    void (async () => {
      await initApp();
      await Promise.all([refreshStatus(), refreshOAuthConfigured()]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Center h="100vh" bg="gray.0">
        <Loader />
      </Center>
    );
  }

  if (!oauthConfigured) {
    return (
      <OAuthSetupPage
        onConfigured={async () => {
          await refreshOAuthConfigured();
          await refreshStatus();
        }}
      />
    );
  }

  return (
    <AppLayout status={status} onAuthUpdated={refreshStatus}>
      <Routes>
        <Route path="/" element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/videos" element={<VideosPage authenticated={authenticated} />} />
        <Route path="/playlists" element={<PlaylistsPage authenticated={authenticated} />} />
        <Route path="/settings" element={<SettingsPage authenticated={authenticated} />} />
        <Route
          path="/dev"
          element={
            <DevelopmentPage
              onAuthUpdated={async () => {
                await refreshOAuthConfigured();
                await refreshStatus();
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Routes>
    </AppLayout>
  );
}
