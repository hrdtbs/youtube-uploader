# メンテナ向けガイド

YouTube Uploader の開発・リリース・運用を担当するメンテナ向けの手順書です。

## プロジェクト概要

| 項目                 | 内容                                                |
| -------------------- | --------------------------------------------------- |
| 種別                 | Tauri 2 + React の Windows デスクトップアプリ       |
| フロントエンド       | React 19, Vite, Mantine, TypeScript                 |
| バックエンド         | Rust (`src-tauri/`)                                 |
| パッケージマネージャ | pnpm（`packageManager` フィールドでバージョン固定） |
| デフォルトブランチ   | `main`                                              |

## 開発環境のセットアップ

### 必要なツール

- [Node.js](https://nodejs.org/) 22 系
- [pnpm](https://pnpm.io/) 11 系（`corepack enable` で有効化可能）
- [Rust](https://www.rust-lang.org/) stable
- Windows 向けビルド環境（Visual Studio Build Tools など）

### 初回セットアップ

```bash
pnpm install
pnpm prepare   # lefthook（pre-commit フック）をインストール
```

### よく使うコマンド

| コマンド           | 説明                                             |
| ------------------ | ------------------------------------------------ |
| `pnpm dev`         | Vite 開発サーバー                                |
| `pnpm tauri dev`   | Tauri アプリをホットリロード付きで起動           |
| `pnpm check`       | typecheck + lint + format + 依存ピン留めチェック |
| `pnpm tauri build` | 本番ビルド（インストーラ生成）                   |

`pnpm check` は CI と同じフロントエンド品質ゲートです。PR を出す前にローカルで通しておくと安全です。

### Rust の品質チェック

CI の Rust ジョブと同等の確認:

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -- -D warnings
```

## コーディング規約

- **npm 依存関係は厳密にピン留め**（`^` / `~` / 範囲指定は不可）。`scripts/check-pinned-deps.mjs` が CI で検証します。
- **pre-commit**: lefthook がステージ済みファイルに Prettier を実行します。
- **変更履歴**: ユーザー向けの変更は [CHANGELOG.md](../CHANGELOG.md) の `[Unreleased]` に追記します（[Keep a Changelog](https://keepachangelog.com/) 形式）。

## CI

`main` への push と PR で [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) が実行されます。

| ジョブ        | 内容                                |
| ------------- | ----------------------------------- |
| Lint Frontend | `pnpm check`                        |
| Lint Rust     | `cargo fmt --check`, `cargo clippy` |

### Dependabot と auto-merge

- Dependabot が npm / Cargo / GitHub Actions の更新 PR を週次で作成します。
- patch / minor の Dependabot PR は CI 通過後に自動マージされます（[`.github/workflows/auto-merge.yml`](../.github/workflows/auto-merge.yml)）。
- メンテナ（`hrdtbs`）の PR も auto-merge が有効になります。

## リリース

リリースは **Git タグの push をトリガー**に GitHub Actions が自動実行します。手動でインストーラをビルドしてアップロードする必要はありません。

### 仕組み

```
CHANGELOG 更新 → main にマージ → タグ vX.Y.Z を push → Release ワークフロー
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) が `v*` 形式のタグ push で起動し、以下を行います。

1. タグ名からバージョンを取得（例: `v0.1.0` → `0.1.0`）
2. `scripts/sync-app-version.mjs` でバージョンを同期
3. `scripts/extract-changelog.mjs` で `CHANGELOG.md` からリリースノートを抽出
4. [GitHub Releases](https://github.com/hrdtbs/youtube-uploader/releases) を作成または更新
5. `tauri-action` で Windows 向けインストーラ（`.exe` / `.msi`）をビルドしてアップロード

### リリース手順

#### 1. バージョン番号を決める

[Semantic Versioning](https://semver.org/) に従います。

| 変更の種類           | 例                |
| -------------------- | ----------------- |
| 破壊的変更           | `1.0.0` → `2.0.0` |
| 機能追加（後方互換） | `0.1.0` → `0.2.0` |
| バグ修正のみ         | `0.1.0` → `0.1.1` |

バージョンは次の 3 ファイルで管理されています（リリース時にスクリプトで一括同期）。

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

#### 2. CHANGELOG を更新する

`CHANGELOG.md` の `[Unreleased]` に書いた内容を、新しいバージョンセクションへ移動します。

```markdown
## [Unreleased]

## [0.1.0] - 2026-06-27

### Added

- 新機能の説明

### Fixed

- 修正内容
```

末尾のバージョン比較リンクも更新してください。

```markdown
[Unreleased]: https://github.com/hrdtbs/youtube-uploader/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hrdtbs/youtube-uploader/releases/tag/v0.1.0
```

リリースノートは `## [0.1.0]` セクションの本文が GitHub Release に使われます。セクションがない、または空の場合は GitHub の自動生成ノートにフォールバックします。

#### 3. main にマージし、CI を確認する

CHANGELOG の更新を含む PR を `main` にマージし、[Actions](https://github.com/hrdtbs/youtube-uploader/actions) で CI が成功していることを確認します。

#### 4. （推奨）ローカルでバージョンを同期する

タグ push 前に `main` 上のバージョンを揃えておくと、リポジトリの状態が分かりやすくなります。

```bash
node scripts/sync-app-version.mjs 0.1.0
```

または対話形式で:

```bash
pnpm version:bump
```

変更をコミットして `main` に push します。

> **Note:** リリースワークフロー内でもタグからバージョン同期が行われるため、タグさえ正しければビルド自体は成功します。ただし `main` とタグのバージョンがずれたままだと混乱の元になるため、事前同期を推奨します。

#### 5. タグを作成して push する

**リリースしたいコミット**（通常は `main` の先端）にタグを付けます。

```bash
git checkout main
git pull origin main
git tag v0.1.0
git push origin v0.1.0
```

タグ名は必ず `v` プレフィックス付きの SemVer 形式（例: `v0.1.0`）にしてください。

#### 6. リリース完了を確認する

1. [Actions](https://github.com/hrdtbs/youtube-uploader/actions) の **Release** ワークフローが成功すること
2. [Releases](https://github.com/hrdtbs/youtube-uploader/releases) に新バージョンが公開されていること
3. `.exe` / `.msi` がアセットとして添付されていること
4. リリースノートの内容が意図どおりであること

### ローカルでビルドを試す

タグを打つ前にインストーラの動作を確認したい場合（Windows 上）:

```bash
pnpm install
pnpm tauri build
```

成果物は `src-tauri/target/release/bundle/` 以下に生成されます。

### リリースノートのプレビュー

```bash
node scripts/extract-changelog.mjs 0.1.0
```

標準出力に GitHub Release に載る本文が表示されます。エラーが出る場合は `CHANGELOG.md` のセクション名・内容を確認してください。

### 再リリース・タグの付け直し

| 状況                                          | 対応                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 同じタグで Release ワークフローを再実行したい | GitHub Actions から該当ワークフローを Re-run                                                |
| ビルドだけ失敗した                            | 修正を `main` にマージ後、タグを削除して付け直す                                            |
| リリースノートだけ直したい                    | `CHANGELOG.md` を修正し、同じタグでワークフローを再実行（`gh release edit` で上書きされる） |

タグの付け直し例:

```bash
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

GitHub 上の Release とアセットも必要に応じて削除してください。

### プレリリースについて

現在のワークフローは `prerelease: false` 固定です。ベータ版などを出す場合は `.github/workflows/release.yml` の `prerelease` 設定の見直し、または手動で GitHub Release を draft / prerelease に変更する運用が必要です。

### コード署名について

現状、Windows コード署名のシークレットはワークフローに設定されていません。インストーラ実行時に SmartScreen の警告が出る可能性があります。署名を導入する場合は Tauri の署名設定と GitHub Secrets の追加が必要です。

## トラブルシューティング

### `extract-changelog.mjs` が失敗する

- `CHANGELOG.md` に `## [X.Y.Z]` セクションがあるか確認
- セクション本文が空でないか確認
- 日付行（`- 2026-06-27`）の直後に変更内容があるか確認

### Release ワークフローが失敗する

1. [Actions のログ](https://github.com/hrdtbs/youtube-uploader/actions) で失敗ステップを特定
2. ローカルで `pnpm check` と `pnpm tauri build` が通るか確認
3. Rust のビルドエラーは `src-tauri` で `cargo build --release` を試す

### `pnpm install --frozen-lockfile` が CI で失敗する

`pnpm-lock.yaml` が `package.json` と同期していません。ローカルで `pnpm install` して lockfile を更新し、コミットしてください。

## 関連ファイル

| ファイル                        | 役割                             |
| ------------------------------- | -------------------------------- |
| `.github/workflows/release.yml` | リリース自動化                   |
| `.github/workflows/ci.yml`      | 品質チェック                     |
| `scripts/sync-app-version.mjs`  | バージョン番号の一括同期         |
| `scripts/extract-changelog.mjs` | CHANGELOG からリリースノート抽出 |
| `CHANGELOG.md`                  | 変更履歴・リリースノートのソース |
