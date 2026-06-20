import { openUrl } from "@tauri-apps/plugin-opener";

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function openVideoOnYouTube(videoId: string): Promise<void> {
  await openUrl(youtubeWatchUrl(videoId));
}

export function formatPlaylistNames(playlists: string[]): string {
  return playlists.length > 0 ? playlists.join("、") : "-";
}
