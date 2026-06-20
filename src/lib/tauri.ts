import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  AppSettings,
  AuthStatus,
  AuthenticatedChannel,
  ChannelVideo,
  UploadPreviewItem,
  UploadProgressEvent,
  UploadSummary,
  VideoCategory,
  PlaylistSummary,
} from "../types";

export async function initApp(): Promise<void> {
  await invoke("init_app");
}

export async function authLogin(): Promise<AuthenticatedChannel[]> {
  return invoke("auth_login");
}

export async function authStatus(): Promise<AuthStatus> {
  return invoke("auth_status");
}

export async function authChannels(): Promise<AuthenticatedChannel[]> {
  return invoke("auth_channels");
}

export async function authLogout(): Promise<void> {
  return invoke("auth_logout");
}

export async function videosList(limit: number): Promise<ChannelVideo[]> {
  return invoke("videos_list", { limit });
}

export async function categoriesList(
  region?: string,
  hl?: string,
  includeAll?: boolean,
): Promise<VideoCategory[]> {
  return invoke("categories_list", {
    region,
    hl,
    includeAll,
  });
}

export async function playlistsList(): Promise<PlaylistSummary[]> {
  return invoke("playlists_list");
}

export async function playlistsAdd(
  playlist: string | undefined,
  videoIds: string[],
  configPath?: string,
): Promise<string> {
  return invoke("playlists_add", {
    playlist,
    configPath,
    videoIds,
  });
}

export async function uploadPreview(options: {
  dir?: string;
  config?: string;
  recursive?: boolean;
  force?: boolean;
}): Promise<UploadPreviewItem[]> {
  return invoke("upload_preview_cmd", options);
}

export async function uploadRun(options: {
  dir?: string;
  config?: string;
  recursive?: boolean;
  force?: boolean;
  delay?: number;
}): Promise<UploadSummary> {
  return invoke("upload_run_cmd", options);
}

export async function configGet(): Promise<AppConfig> {
  return invoke("config_get");
}

export async function configSet(config: AppConfig): Promise<void> {
  return invoke("config_set", { config });
}

export async function settingsGet(): Promise<AppSettings> {
  return invoke("settings_get");
}

export async function settingsSet(settings: AppSettings): Promise<void> {
  return invoke("settings_set", { settings });
}

export async function pickDirectory(title: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

export function onUploadProgress(
  handler: (event: UploadProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<UploadProgressEvent>("upload-progress", (payload) => {
    handler(payload.payload);
  });
}
