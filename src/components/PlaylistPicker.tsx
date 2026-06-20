import { useEffect, useState } from 'react';
import { Autocomplete } from '@mantine/core';
import { playlistsList } from '../lib/tauri';
import type { PlaylistSummary } from '../types';

interface Props {
  /** 保存・送信に使う再生リスト ID（または URL / 手入力） */
  value: string;
  onChange: (value: string) => void;
  authenticated: boolean;
  label?: string;
  placeholder?: string;
}

function displayText(value: string, playlists: PlaylistSummary[]): string {
  if (!value) {
    return '';
  }
  const match = playlists.find((playlist) => playlist.id === value);
  return match?.title ?? value;
}

function resolveInput(text: string, playlists: PlaylistSummary[]): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  const byTitle = playlists.find((playlist) => playlist.title === trimmed);
  if (byTitle) {
    return byTitle.id;
  }
  const byId = playlists.find((playlist) => playlist.id === trimmed);
  if (byId) {
    return byId.id;
  }
  return trimmed;
}

export default function PlaylistPicker({
  value,
  onChange,
  authenticated,
  label = '再生リスト',
  placeholder = '再生リストを選択',
}: Props) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [inputValue, setInputValue] = useState(value);
  const [prevSync, setPrevSync] = useState({ value, playlistCount: 0 });

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    void playlistsList()
      .then(setPlaylists)
      .catch(() => setPlaylists([]));
  }, [authenticated]);

  const effectivePlaylists = authenticated ? playlists : [];
  if (value !== prevSync.value || effectivePlaylists.length !== prevSync.playlistCount) {
    setPrevSync({ value, playlistCount: effectivePlaylists.length });
    setInputValue(displayText(value, effectivePlaylists));
  }

  function handleChange(text: string) {
    setInputValue(text);
    onChange(resolveInput(text, effectivePlaylists));
  }

  return (
    <Autocomplete
      label={label}
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      data={effectivePlaylists.map((playlist) => playlist.title)}
      clearable
    />
  );
}
