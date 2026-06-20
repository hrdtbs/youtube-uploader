import { useEffect, useState } from "react";
import {
  categoriesList,
  configGet,
  configSet,
  pickDirectory,
  settingsGet,
  settingsSet,
} from "../lib/tauri";
import type { AppConfig, ScheduleSlotDef, VideoCategory } from "../types";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const TIMEZONE_OPTIONS = [
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

function defaultSlot(): ScheduleSlotDef {
  return { daily: false, weekday: 3, time: "18:00" };
}

function timeToInput(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function inputToTime(value: string): string {
  return value.length === 5 ? value : value;
}

export default function SettingsPage() {
  const [uploadDir, setUploadDir] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [startDateAuto, setStartDateAuto] = useState(true);
  const [manualStartDate, setManualStartDate] = useState("");
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [settings, loadedConfig] = await Promise.all([
          settingsGet(),
          configGet(),
        ]);
        setUploadDir(settings.upload_dir ?? "");
        setConfig(loadedConfig);
        setStartDateAuto(loadedConfig.schedule.startDate === "auto");
        if (loadedConfig.schedule.startDate !== "auto") {
          setManualStartDate(loadedConfig.schedule.startDate);
        }
        try {
          setCategories(await categoriesList("JP", "ja", false));
        } catch {
          // カテゴリ取得失敗時は数値入力にフォールバック
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handlePickDirectory() {
    const selected = await pickDirectory("デフォルト動画フォルダ");
    if (selected) {
      setUploadDir(selected);
    }
  }

  function updateConfig(updater: (current: AppConfig) => AppConfig) {
    setConfig((current) => (current ? updater(current) : current));
  }

  function handleAddTag() {
    const value = tagInput.trim();
    if (!value || !config) {
      return;
    }
    if (config.template.tags.includes(value)) {
      setTagInput("");
      return;
    }
    updateConfig((current) => ({
      ...current,
      template: {
        ...current.template,
        tags: [...current.template.tags, value],
      },
    }));
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    updateConfig((current) => ({
      ...current,
      template: {
        ...current.template,
        tags: current.template.tags.filter((value) => value !== tag),
      },
    }));
  }

  function handleAddSlot() {
    updateConfig((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        slots: [...current.schedule.slots, defaultSlot()],
      },
    }));
  }

  function handleRemoveSlot(index: number) {
    if (!config || config.schedule.slots.length <= 1) {
      return;
    }
    updateConfig((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        slots: current.schedule.slots.filter((_, i) => i !== index),
      },
    }));
  }

  function handleSlotChange(index: number, patch: Partial<ScheduleSlotDef>) {
    updateConfig((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        slots: current.schedule.slots.map((slot, i) =>
          i === index ? { ...slot, ...patch } : slot,
        ),
      },
    }));
  }

  async function handleSave() {
    if (!config) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: AppConfig = {
      ...config,
      schedule: {
        ...config.schedule,
        startDate: startDateAuto ? "auto" : manualStartDate,
        slots: config.schedule.slots.map((slot) => ({
          ...slot,
          weekday: slot.daily ? null : (slot.weekday ?? 0),
        })),
      },
    };

    try {
      await settingsSet({ upload_dir: uploadDir || null });
      await configSet(payload);
      setMessage("設定を保存しました");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>設定</h2>
        <p>読み込み中...</p>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="panel">
        <h2>設定</h2>
        {error ? <p className="error">{error}</p> : <p className="error">設定を読み込めませんでした</p>}
      </section>
    );
  }

  return (
    <section className="panel settings-panel">
      <h2>設定</h2>

      <div className="card">
        <h3>一般</h3>
        <label>
          デフォルト動画フォルダ
          <div className="inline-field">
            <input value={uploadDir} onChange={(e) => setUploadDir(e.target.value)} />
            <button type="button" onClick={handlePickDirectory}>
              選択
            </button>
          </div>
        </label>
      </div>

      <div className="card">
        <h3>メタデータテンプレート</h3>
        <div className="form-grid">
          <label>
            タイトルテンプレート（任意）
            <input
              value={config.template.title ?? ""}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  template: {
                    ...current.template,
                    title: e.target.value || null,
                  },
                }))
              }
              placeholder="例: 【新曲】{{title}}"
            />
            <span className="field-hint">ファイル名は {"{{title}}"} に置き換わります</span>
          </label>

          <label>
            説明文
            <textarea
              value={config.template.description}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  template: { ...current.template, description: e.target.value },
                }))
              }
              rows={6}
            />
          </label>

          <div>
            <span className="field-label">タグ</span>
            <div className="tag-input-row">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="タグを入力して Enter"
              />
              <button type="button" onClick={handleAddTag}>
                追加
              </button>
            </div>
            <div className="tag-list">
              {config.template.tags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)} aria-label={`${tag} を削除`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <label>
            カテゴリ
            {categories.length > 0 ? (
              <select
                value={config.template.categoryId}
                onChange={(e) =>
                  updateConfig((current) => ({
                    ...current,
                    template: { ...current.template, categoryId: e.target.value },
                  }))
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title} ({category.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={config.template.categoryId}
                onChange={(e) =>
                  updateConfig((current) => ({
                    ...current,
                    template: { ...current.template, categoryId: e.target.value },
                  }))
                }
              />
            )}
          </label>

          <label>
            デフォルト言語
            <input
              value={config.template.defaultLanguage}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  template: { ...current.template, defaultLanguage: e.target.value },
                }))
              }
              placeholder="ja"
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>公開スケジュール</h3>
        <div className="form-grid">
          <label>
            タイムゾーン
            <input
              list="timezone-options"
              value={config.schedule.timezone}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  schedule: { ...current.schedule, timezone: e.target.value },
                }))
              }
            />
            <datalist id="timezone-options">
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={startDateAuto}
              onChange={(e) => setStartDateAuto(e.target.checked)}
            />
            最終公開日の翌日から自動設定（startDate: auto）
          </label>

          {!startDateAuto ? (
            <label>
              開始日
              <input
                type="date"
                value={manualStartDate}
                onChange={(e) => setManualStartDate(e.target.value)}
              />
            </label>
          ) : null}

          <div>
            <span className="field-label">公開スロット</span>
            <div className="slot-list">
              {config.schedule.slots.map((slot, index) => (
                <div key={index} className="slot-row">
                  <select
                    value={slot.daily ? "daily" : "weekday"}
                    onChange={(e) =>
                      handleSlotChange(index, {
                        daily: e.target.value === "daily",
                        weekday: e.target.value === "daily" ? null : (slot.weekday ?? 0),
                      })
                    }
                  >
                    <option value="weekday">曜日指定</option>
                    <option value="daily">毎日</option>
                  </select>

                  {!slot.daily ? (
                    <select
                      value={slot.weekday ?? 0}
                      onChange={(e) =>
                        handleSlotChange(index, { weekday: Number(e.target.value) })
                      }
                    >
                      {WEEKDAY_LABELS.map((label, weekday) => (
                        <option key={weekday} value={weekday}>
                          {label}曜日
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <input
                    type="time"
                    value={timeToInput(slot.time)}
                    onChange={(e) => handleSlotChange(index, { time: inputToTime(e.target.value) })}
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(index)}
                    disabled={config.schedule.slots.length <= 1}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="slot-add" onClick={handleAddSlot}>
              スロットを追加
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>アップロード既定値</h3>
        <label>
          デフォルト再生リスト ID / URL
          <input
            value={config.upload?.playlistId ?? ""}
            onChange={(e) =>
              updateConfig((current) => ({
                ...current,
                upload: {
                  playlistId: e.target.value || null,
                },
              }))
            }
            placeholder="PL... または https://www.youtube.com/playlist?list=..."
          />
        </label>
      </div>

      <div className="actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "すべて保存"}
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
