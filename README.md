# YouTube Uploader

YouTube CLI（`youtube-cli`）相当の機能を、自己完結型デスクトップアプリとして提供します。

- Tauri 2 + React
- Rust バックエンド（OAuth / config / schedule / YouTube API）
- Bun / CLI / `client_secret.json` のセットアップ不要（OAuth 資格情報はアプリ同梱）

## 機能

| 画面 | 対応 CLI |
|------|---------|
| 認証 | `auth login` / `status` / `channels` |
| アップロード | `upload`（dry-run プレビュー、進捗ログ） |
| 動画一覧 | `videos list` |
| 再生リスト | `playlists add` |
| カテゴリ | `categories list` |
| 設定 | `config.yaml` / デフォルト upload dir |

## 開発セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. OAuth 資格情報（ビルド時のみ）

Google Cloud Console で **Desktop OAuth クライアント** を作成し、以下に配置します。

```bash
cp src-tauri/resources/oauth.json.example src-tauri/resources/oauth.json
```

`oauth.json` は `.gitignore` 済みです。本番配布用ビルドでは CI secret 等で注入してください。

### 3. 開発起動

```bash
npm run tauri dev
```

### 4. リリースビルド

```bash
npm run tauri build
```

成果物:

- `src-tauri/target/release/bundle/nsis/YouTube Uploader_*_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/YouTube Uploader_*_x64_en-US.msi`

## データ保存先

| 項目 | パス |
|------|------|
| トークン | `%APPDATA%\youtube-uploader\token.json` |
| 設定 | `%APPDATA%\youtube-uploader\config.yaml` |
| アプリ設定 | `%APPDATA%\youtube-uploader\settings.json` |
| アップロード index | `<動画フォルダ>\.youtube-uploader-index.json` |

## ユーザー体験

1. アプリをインストール
2. 「Google でログイン」
3. 動画フォルダを選んで dry-run プレビュー → アップロード

## 注意

- ブランドアカウント管理者は OAuth 画面に管理対象チャンネルが出ない場合があります（YouTube の制限）。
- `youtube-cli` とは設定ディレクトリが別です。CLI 設定のインポートは将来対応可能です。
