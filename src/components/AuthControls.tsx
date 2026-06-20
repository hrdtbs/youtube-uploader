import { useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { authLogin, authLogout } from "../lib/tauri";
import { formatErrorMessage } from "../lib/labels";
import type { AuthStatus } from "../types";

interface Props {
  status: AuthStatus | null;
  onUpdated: () => Promise<void>;
}

export default function AuthControls({ status, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      await authLogin();
      await onUpdated();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await authLogout();
      await onUpdated();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const channelLabel =
    status?.channels.map((channel) => channel.title).join(", ") || null;

  return (
    <Stack gap="xs" align="flex-end" maw={320}>
      {status?.authenticated ? (
        <>
          <Text size="sm" ta="right">
            {channelLabel ?? "チャンネル情報なし"}
          </Text>
          <Button variant="outline" onClick={handleLogout} loading={busy} disabled={busy}>
            ログアウト
          </Button>
        </>
      ) : (
        <Button onClick={handleLogin} loading={busy} disabled={busy}>
          Google でログイン
        </Button>
      )}
      {error ? (
        <Text size="xs" c="red" ta="right">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
