export interface AuthenticatedChannel {
  id: string;
  title: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
}

export interface AuthStatus {
  authenticated: boolean;
  token_path: string;
  access_token_expires?: string | null;
  refresh_token_present: boolean;
  channels: AuthenticatedChannel[];
  message?: string | null;
}

export interface ChannelVideo {
  id: string;
  title: string;
  uploaded_at: string;
  privacy_status: string;
  playlists: string[];
  publish_at?: string | null;
}

export interface VideoCategory {
  id: string;
  title: string;
  assignable: boolean;
}

export interface UploadPreviewItem {
  relative_path: string;
  title: string;
  description: string;
  publish_at_local: string;
  publish_at_utc: string;
  playlist_id?: string | null;
}

export interface UploadSummary {
  uploaded: number;
  skipped: number;
  failed: number;
}

export type UploadProgressKind =
  | 'batch_start'
  | 'start'
  | 'progress'
  | 'success'
  | 'error'
  | 'warning'
  | 'summary';

export type UploadFileStatus = 'pending' | 'uploading' | 'success' | 'error' | 'warning';

export interface UploadProgressEvent {
  kind: UploadProgressKind;
  relative_path?: string | null;
  message: string;
  video_id?: string | null;
  percent?: number | null;
  file_index?: number | null;
  file_count?: number | null;
}

export interface AppSettings {
  upload_dir?: string | null;
  oauth_credentials_path?: string | null;
}

export interface OAuthCredentialsInfo {
  customPath?: string | null;
  effectivePath: string;
  source: 'user' | string;
  clientId: string;
}

export interface TemplateConfig {
  title?: string | null;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
}

export interface ScheduleSlotDef {
  daily: boolean;
  weekday?: number | null;
  time: string;
}

export interface ScheduleConfig {
  timezone: string;
  startDate: string;
  slots: ScheduleSlotDef[];
}

export interface UploadConfig {
  playlistId?: string | null;
}

export interface AppConfig {
  template: TemplateConfig;
  schedule: ScheduleConfig;
  upload?: UploadConfig | null;
}
