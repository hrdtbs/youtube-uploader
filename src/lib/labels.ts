const PRIVACY_LABELS: Record<string, string> = {
  public: '公開',
  private: '非公開',
  unlisted: '限定公開',
  unknown: '不明',
};

export function privacyStatusLabel(status: string): string {
  return PRIVACY_LABELS[status] ?? status;
}

export function formatErrorMessage(error: unknown): string {
  const message = String(error);
  const replacements: [RegExp, string][] = [
    [/Not authenticated\.?/i, 'ログインしていません。'],
    [/Sign in with Google first\.?/i, 'Google でログインしてください。'],
    [/Select at least one video\.?/i, '動画を1件以上選択してください。'],
  ];
  return replacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    message,
  );
}
