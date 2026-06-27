# YouTube Uploader

動画を YouTube に一括アップロードし、公開日時をスケジュール設定できる Windows デスクトップアプリです。

## 使い方

1. [Releases](https://github.com/hrdtbs/youtube-uploader/releases) からインストーラ（.exe または .msi）をダウンロードしてインストール
2. 初回起動時、Google Cloud Console で作成した OAuth クライアントの `oauth.json` をアップロード
3. 「Google でログイン」で YouTube チャンネルに接続
4. 動画フォルダを選び、プレビューを確認してからアップロード

### 自動更新

アプリは起動時に GitHub Releases から更新を確認します。新しいバージョンがある場合は確認ダイアログが表示され、承認すると自動でダウンロード・インストールされます。設定画面の「更新を確認」から手動でも確認できます。

> アップデーター未搭載の旧バージョンからは、最初の1回だけ手動インストールが必要です。

### oauth.json の準備

[Google Cloud Console](https://console.cloud.google.com/) で以下を行い、OAuth 2.0 クライアント ID（デスクトップアプリ）の JSON をダウンロードしてください。

- プロジェクトを作成
- YouTube Data API v3 を有効化
- OAuth 同意画面を設定

## リリース（メンテナ向け）

自動更新を有効にするリリースには、署名付きビルドが必要です。

### 署名鍵の生成（初回のみ）

```bash
pnpm tauri signer generate -w ~/.tauri/youtube-uploader.key --ci
```

- 公開鍵（`youtube-uploader.key.pub` の内容）は `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に設定する
- 秘密鍵は GitHub リポジトリの Secrets に登録する
  - `TAURI_SIGNING_PRIVATE_KEY`: 秘密鍵ファイルの内容
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: パスワードを設定した場合のみ（`--ci` で生成した鍵は不要）

### リリース手順

1. バージョンを更新（`pnpm version:bump` など）
2. GitHub Secrets に署名鍵を設定
3. `v*` タグを push すると Release ワークフローが実行され、インストーラ・`latest.json`・署名ファイルが GitHub Releases にアップロードされる
