import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  NativeSelect,
  Paper,
  Pill,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  categoriesList,
  configGet,
  configSet,
  pickDirectory,
  settingsGet,
  settingsSet,
} from '../lib/tauri';
import PlaylistPicker from '../components/PlaylistPicker';
import { formatErrorMessage } from '../lib/labels';
import type { AppConfig, ScheduleSlotDef, VideoCategory } from '../types';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const TIMEZONE_OPTIONS = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function defaultSlot(): ScheduleSlotDef {
  return { daily: false, weekday: 3, time: '18:00' };
}

function timeToInput(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function inputToTime(value: string): string {
  return value.length === 5 ? value : value;
}

function buildConfigPayload(
  config: AppConfig,
  startDateAuto: boolean,
  manualStartDate: string,
): AppConfig {
  return {
    ...config,
    schedule: {
      ...config.schedule,
      startDate: startDateAuto ? 'auto' : manualStartDate,
      slots: config.schedule.slots.map((slot) => ({
        ...slot,
        weekday: slot.daily ? null : (slot.weekday ?? 0),
      })),
    },
  };
}

const AUTO_SAVE_DELAY_MS = 500;

export default function SettingsPage({ authenticated }: { authenticated: boolean }) {
  const [uploadDir, setUploadDir] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [startDateAuto, setStartDateAuto] = useState(true);
  const [manualStartDate, setManualStartDate] = useState('');
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipAutoSave = useRef(true);
  const saveVersion = useRef(0);

  useEffect(() => {
    void (async () => {
      try {
        const [settings, loadedConfig] = await Promise.all([settingsGet(), configGet()]);
        setUploadDir(settings.upload_dir ?? '');
        setConfig(loadedConfig);
        setStartDateAuto(loadedConfig.schedule.startDate === 'auto');
        if (loadedConfig.schedule.startDate !== 'auto') {
          setManualStartDate(loadedConfig.schedule.startDate);
        }
        try {
          setCategories(await categoriesList('JP', 'ja', false));
        } catch {
          // カテゴリ取得失敗時は数値入力にフォールバック
        }
      } catch (err) {
        setError(formatErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || !config) {
      return;
    }

    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return;
    }

    const version = ++saveVersion.current;
    setSaving(true);
    setMessage(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        const payload = buildConfigPayload(config, startDateAuto, manualStartDate);

        try {
          await settingsSet({ upload_dir: uploadDir || null });
          await configSet(payload);
          if (version !== saveVersion.current) {
            return;
          }
          setError(null);
          setMessage('保存しました');
        } catch (err) {
          if (version !== saveVersion.current) {
            return;
          }
          setError(formatErrorMessage(err));
          setMessage(null);
        } finally {
          if (version === saveVersion.current) {
            setSaving(false);
          }
        }
      })();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [config, uploadDir, startDateAuto, manualStartDate, loading]);

  async function handlePickDirectory() {
    const selected = await pickDirectory('デフォルト動画フォルダ');
    if (selected) {
      setUploadDir(selected);
    }
  }

  function updateConfig(updater: (current: AppConfig) => AppConfig) {
    setConfig((current) => (current ? updater(current) : current));
  }

  function addTags(rawTags: string[]) {
    if (!config) {
      return;
    }
    const existing = new Set(config.template.tags);
    const toAdd: string[] = [];
    for (const tag of rawTags) {
      const value = tag.trim();
      if (value && !existing.has(value)) {
        existing.add(value);
        toAdd.push(value);
      }
    }
    if (toAdd.length === 0) {
      return;
    }
    updateConfig((current) => ({
      ...current,
      template: {
        ...current.template,
        tags: [...current.template.tags, ...toAdd],
      },
    }));
  }

  function handleTagInputChange(value: string) {
    if (!value.includes(',')) {
      setTagInput(value);
      return;
    }
    const parts = value.split(',');
    const remaining = parts.pop() ?? '';
    addTags(parts);
    setTagInput(remaining);
  }

  function handleAddTag() {
    const tags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      return;
    }
    addTags(tags);
    setTagInput('');
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

  if (loading) {
    return (
      <Paper p="md">
        <Center py="lg">
          <Loader />
        </Center>
      </Paper>
    );
  }

  if (!config) {
    return (
      <Paper p="md">
        <Alert color="red">{error ?? '設定を読み込めませんでした'}</Alert>
      </Paper>
    );
  }

  return (
    <Stack gap="lg">
      {saving || message ? (
        <Group justify="flex-end">
          {saving ? (
            <Text size="xs" c="dimmed">
              保存中...
            </Text>
          ) : message ? (
            <Text size="xs" c="green">
              {message}
            </Text>
          ) : null}
        </Group>
      ) : null}

      <Card withBorder padding="md" radius="md">
        <Title order={3} mb="md">
          一般
        </Title>
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <TextInput
              label="デフォルト動画フォルダ"
              value={uploadDir}
              onChange={(e) => setUploadDir(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="outline" onClick={handlePickDirectory}>
              選択
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={3} mb="md">
          メタデータテンプレート
        </Title>
        <Stack gap="md">
          <TextInput
            label="タイトルテンプレート（任意）"
            value={config.template.title ?? ''}
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
            description='ファイル名は {"{{title}}"} に置き換わります'
          />

          <Textarea
            label="説明文"
            value={config.template.description}
            onChange={(e) =>
              updateConfig((current) => ({
                ...current,
                template: { ...current.template, description: e.target.value },
              }))
            }
            rows={6}
          />

          <Stack gap="sm">
            <Text size="sm" fw={500}>
              タグ
            </Text>
            <Group align="flex-end" gap="sm">
              <TextInput
                flex={1}
                value={tagInput}
                onChange={(e) => handleTagInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="タグを入力（カンマ区切り可）"
              />
              <Button variant="outline" onClick={handleAddTag}>
                追加
              </Button>
            </Group>
            <Group gap="xs">
              {config.template.tags.map((tag) => (
                <Pill key={tag} withRemoveButton onRemove={() => handleRemoveTag(tag)}>
                  {tag}
                </Pill>
              ))}
            </Group>
          </Stack>

          {categories.length > 0 ? (
            <NativeSelect
              label="カテゴリ"
              value={config.template.categoryId}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  template: { ...current.template, categoryId: e.target.value },
                }))
              }
              data={categories.map((category) => ({
                value: category.id,
                label: `${category.title} (${category.id})`,
              }))}
            />
          ) : (
            <TextInput
              label="カテゴリ"
              value={config.template.categoryId}
              onChange={(e) =>
                updateConfig((current) => ({
                  ...current,
                  template: { ...current.template, categoryId: e.target.value },
                }))
              }
            />
          )}

          <TextInput
            label="デフォルト言語"
            value={config.template.defaultLanguage}
            onChange={(e) =>
              updateConfig((current) => ({
                ...current,
                template: { ...current.template, defaultLanguage: e.target.value },
              }))
            }
            placeholder="ja"
          />
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={3} mb="md">
          公開スケジュール
        </Title>
        <Stack gap="md">
          <Autocomplete
            label="タイムゾーン"
            value={config.schedule.timezone}
            onChange={(value) =>
              updateConfig((current) => ({
                ...current,
                schedule: { ...current.schedule, timezone: value },
              }))
            }
            data={TIMEZONE_OPTIONS}
          />

          <Checkbox
            label="最終公開日の翌日から自動設定"
            checked={startDateAuto}
            onChange={(e) => setStartDateAuto(e.currentTarget.checked)}
          />

          {!startDateAuto ? (
            <DateInput
              label="開始日"
              value={manualStartDate || null}
              onChange={(value) => setManualStartDate(value ?? '')}
              valueFormat="YYYY-MM-DD"
            />
          ) : null}

          <Stack gap="sm">
            <Text size="sm" fw={500}>
              公開スロット
            </Text>
            <Stack gap="sm">
              {config.schedule.slots.map((slot, index) => (
                <Group key={index} gap="sm" align="flex-end" wrap="wrap">
                  <NativeSelect
                    label={index === 0 ? '種別' : undefined}
                    value={slot.daily ? 'daily' : 'weekday'}
                    onChange={(e) =>
                      handleSlotChange(index, {
                        daily: e.target.value === 'daily',
                        weekday: e.target.value === 'daily' ? null : (slot.weekday ?? 0),
                      })
                    }
                    data={[
                      { value: 'weekday', label: '曜日指定' },
                      { value: 'daily', label: '毎日' },
                    ]}
                    w={140}
                  />

                  {!slot.daily ? (
                    <NativeSelect
                      label={index === 0 ? '曜日' : undefined}
                      value={String(slot.weekday ?? 0)}
                      onChange={(e) => handleSlotChange(index, { weekday: Number(e.target.value) })}
                      data={WEEKDAY_LABELS.map((label, weekday) => ({
                        value: String(weekday),
                        label: `${label}曜日`,
                      }))}
                      w={120}
                    />
                  ) : null}

                  <TextInput
                    label={index === 0 ? '時刻' : undefined}
                    type="time"
                    value={timeToInput(slot.time)}
                    onChange={(e) => handleSlotChange(index, { time: inputToTime(e.target.value) })}
                    w={120}
                  />

                  <Button
                    variant="light"
                    color="red"
                    onClick={() => handleRemoveSlot(index)}
                    disabled={config.schedule.slots.length <= 1}
                  >
                    削除
                  </Button>
                </Group>
              ))}
            </Stack>
            <Button variant="outline" onClick={handleAddSlot} mt="sm">
              スロットを追加
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={3} mb="md">
          アップロード既定値
        </Title>
        <PlaylistPicker
          value={config.upload?.playlistId ?? ''}
          onChange={(value) =>
            updateConfig((current) => ({
              ...current,
              upload: {
                playlistId: value || null,
              },
            }))
          }
          authenticated={authenticated}
          label="デフォルト再生リスト"
        />
      </Card>

      {error ? <Alert color="red">{error}</Alert> : null}
    </Stack>
  );
}
