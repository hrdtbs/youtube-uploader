import { useState } from "react";
import { categoriesList } from "../lib/tauri";
import type { VideoCategory } from "../types";

export default function CategoriesPage() {
  const [region, setRegion] = useState("JP");
  const [hl, setHl] = useState("ja");
  const [includeAll, setIncludeAll] = useState(false);
  const [categories, setCategories] = useState<VideoCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setError(null);
    try {
      setCategories(await categoriesList(region, hl, includeAll));
    } catch (err) {
      setError(String(err));
    }
  }

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id);
  }

  return (
    <section className="panel">
      <h2>カテゴリ参照</h2>
      <div className="form-grid">
        <label>
          Region
          <input value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} />
        </label>
        <label>
          Language
          <input value={hl} onChange={(e) => setHl(e.target.value)} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
          />
          assignable 以外も表示
        </label>
      </div>
      <div className="actions">
        <button type="button" onClick={handleLoad}>
          読み込み
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>タイトル</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.id}</td>
                <td>{category.title}</td>
                <td>
                  <button type="button" onClick={() => copyId(category.id)}>
                    コピー
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
