# YouTube Uploader

動画を YouTube に一括アップロードし、公開日時をスケジュール設定できる Windows デスクトップアプリです。

## 使い方

1. [Releases](https://github.com/hrdtbs/youtube-uploader/releases) からインストーラ（.exe または .msi）をダウンロードしてインストール
2. 初回起動時、Google Cloud Console で作成した OAuth クライアントの `oauth.json` をアップロード
3. 「Google でログイン」で YouTube チャンネルに接続
4. 動画フォルダを選び、プレビューを確認してからアップロード

### oauth.json の準備

[Google Cloud Console](https://console.cloud.google.com/) で以下を行い、OAuth 2.0 クライアント ID（デスクトップアプリ）の JSON をダウンロードしてください。

- プロジェクトを作成
- YouTube Data API v3 を有効化
- OAuth 同意画面を設定

## 開発

メンテナ向けの開発・リリース手順は [docs/MAINTAINER.md](docs/MAINTAINER.md) を参照してください。
