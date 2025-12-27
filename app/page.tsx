// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calcForType,
  type UsageRow,
  type WeatherKind,
  type TargetDay,
} from "../src/lib/calcForType";

// ★現場換算（答え合わせのキー：必要なら調整）
const OYAKO_PACK_GRAM = 2000;
const GOKUJO_PACK_GRAM = 2500;
const KARAAGE_NEED_FACTOR = 0.9;

const daysJP = ["日", "月", "火", "水", "木", "金", "土"];

const weatherLabel: Record<WeatherKind, string> = {
  sun: "晴",
  cloud: "曇",
  rain: "雨",
  snow: "雪",
  storm: "荒",
  unknown: "不明",
};

// ===== number format utils（カンマ対応）=====
const parseNum = (v: string): number => {
  if (!v) return 0;
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

const fmtComma = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ja-JP");
};

const safeNum = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ===== 祝日API =====
// Holidays JP API: https://holidays-jp.github.io/api/v1/date.json
type HolidayMap = Record<string, string>; // "YYYY-MM-DD": "祝日名"

async function fetchHolidaysJP(): Promise<HolidayMap> {
  const res = await fetch("https://holidays-jp.github.io/api/v1/date.json", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`holiday api failed: ${res.status}`);
  const data = (await res.json()) as HolidayMap;
  return data && typeof data === "object" ? data : {};
}

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function md(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ===== 曜日ルール（基本）=====
function baseOffsetsByWeekday(dow: number): number[] {
  // 0=日..6=土
  switch (dow) {
    case 1: // 月 -> 火
    case 2: // 火 -> 水
    case 3: // 水 -> 木
    case 0: // 日 -> 月
      return [1];
    case 4: // 木 -> 金 + 土
      return [1, 2];
    case 5: // 金 -> 日（基本）
      return [2];
    case 6: // 土 -> 日
      return [1];
    default:
      return [1];
  }
}

function uniqSorted(nums: number[]) {
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// ===== 予報入力（手入力）=====
type Plan = {
  offset: number; // 1=明日,2=明後日...
  sales: string; // 表示はカンマ
  weather: WeatherKind;
};

export default function Page() {
  // ✅ カレンダー選択の基準日
  const [baseDate, setBaseDate] = useState<Date>(new Date());
  const dow = baseDate.getDay();

  // ===== 祝日データ =====
  const [holidayMap, setHolidayMap] = useState<HolidayMap>({});
  const [holidayError, setHolidayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchHolidaysJP();
        if (!cancelled) setHolidayMap(m);
      } catch (e: any) {
        if (!cancelled) setHolidayError(e?.message ?? "holiday load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getHolidayName = (d: Date) => holidayMap[toISODate(d)];
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const isHolidayOrWeekend = (d: Date) =>
    Boolean(getHolidayName(d)) || isWeekend(d);

  // ===== 使用量テーブル =====
  const [usageData, setUsageData] = useState<UsageRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/meat_usage.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const data = (await res.json()) as UsageRow[];
        if (!cancelled) setUsageData(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) {
          setUsageData([]);
          setLoadError(e?.message ?? "load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== 入力 =====
  const [thawed, setThawed] = useState({
    oyako: "",
    gokujo: "",
    karaage: "",
  });

  // 明日〜4日後（天気は手入力・売上は手入力）
  const [plans, setPlans] = useState<Plan[]>([
    { offset: 1, sales: "", weather: "unknown" },
    { offset: 2, sales: "", weather: "unknown" },
    { offset: 3, sales: "", weather: "unknown" },
    { offset: 4, sales: "", weather: "unknown" },
  ]);

  // 金曜だけ任意スイッチ（土曜不足を見る）
  const [includeSatOnFriday, setIncludeSatOnFriday] = useState(false);

  const setPlan = (offset: number, patch: Partial<Plan>) => {
    setPlans((prev) =>
      prev.map((p) => (p.offset === offset ? { ...p, ...patch } : p))
    );
  };

  // ===== targets生成（曜日 + 2日前ルール + 金曜スイッチ + 祝日自動判定）=====
  const buildTargets = (): TargetDay[] => {
    let offsets = baseOffsetsByWeekday(dow);

    // 金曜：土曜不足も見る（任意）
    if (dow === 5 && includeSatOnFriday) offsets = offsets.concat([1]);

    // 2日前ルール：2日後が土日祝なら targets に必ず入れる
    const date2 = addDays(baseDate, 2);
    if (isHolidayOrWeekend(date2)) offsets = offsets.concat([2]);

    offsets = uniqSorted(offsets);

    return offsets
      .map((off) => {
        const p = plans.find((x) => x.offset === off);
        if (!p) return null;

        const d = addDays(baseDate, off);
        const holidayName = getHolidayName(d);
        const holiday = Boolean(holidayName) || isWeekend(d);

        return {
          offset: off,
          label: `${daysJP[d.getDay()]}(${md(d)})`,
          dateISO: toISODate(d),
          sales: parseNum(p.sales),
          weather: p.weather,
          isHoliday: holiday,
          holidayName: holidayName || undefined,
        } as TargetDay;
      })
      .filter(Boolean) as TargetDay[];
  };

  // ===== 計算結果 =====
  const [targets, setTargets] = useState<TargetDay[]>([]);
  const [result, setResult] = useState<{
    oyako: ReturnType<typeof calcForType>;
    gokujo: ReturnType<typeof calcForType>;
    karaage: ReturnType<typeof calcForType>;
  } | null>(null);

  const handleCalc = () => {
    const t = buildTargets();
    setTargets(t);

    const oyako = calcForType({
      type: "oyako",
      usageData,
      thawedNowPack: parseNum(thawed.oyako),
      targets: t,
      packGram: OYAKO_PACK_GRAM,
    });

    const gokujo = calcForType({
      type: "gokujo",
      usageData,
      thawedNowPack: parseNum(thawed.gokujo),
      targets: t,
      packGram: GOKUJO_PACK_GRAM,
    });

    const karaage = calcForType({
      type: "karaage",
      usageData,
      thawedNowPack: parseNum(thawed.karaage),
      targets: t,
      karaageNeedFactor: KARAAGE_NEED_FACTOR,
    });

    setResult({ oyako, gokujo, karaage });
  };

  // 表示用（未計算でも確認できるように）
  const previewTargets = useMemo(() => {
    try {
      return targets.length ? targets : buildTargets();
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, baseDate, plans, includeSatOnFriday, holidayMap]);

  return (
    <main className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-5xl px-4 space-y-6">
        {/* Header / Calendar */}
        <section className="rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">おにくたち（解凍計算）</h1>
              <p className="text-sm text-slate-600">
                📅 選択日：{baseDate.getFullYear()}年{baseDate.getMonth() + 1}月
                {baseDate.getDate()}日（{daysJP[dow]}）
                {getHolidayName(baseDate)
                  ? `【${getHolidayName(baseDate)}】`
                  : ""}
                {isWeekend(baseDate) ? "（週末）" : ""}
              </p>
              <p
                className={`mt-1 text-xs ${
                  loadError ? "text-rose-600" : "text-slate-500"
                }`}
              >
                {loadError
                  ? `対応表エラー: ${loadError}`
                  : `対応表: ${usageData.length} 行`}
              </p>
              <p
                className={`mt-1 text-xs ${
                  holidayError ? "text-rose-600" : "text-slate-500"
                }`}
              >
                {holidayError
                  ? `祝日APIエラー: ${holidayError}`
                  : `祝日判定: 自動`}
              </p>
            </div>

            <div className="flex flex-col gap-2 items-start md:items-end">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-700">基準日</label>
                <input
                  type="date"
                  value={toISODate(baseDate)}
                  onChange={(e) => {
                    const d = new Date(e.target.value);
                    if (!isNaN(d.getTime())) setBaseDate(d);
                  }}
                  className="rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              {dow === 5 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeSatOnFriday}
                    onChange={(e) => setIncludeSatOnFriday(e.target.checked)}
                  />
                  金曜：土曜不足も考慮
                </label>
              )}
            </div>
          </div>
        </section>

        {/* Inputs */}
        <section className="rounded-2xl bg-white p-5 shadow space-y-4">
          <h2 className="font-semibold">解凍済み在庫（pack）</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="親子"
              value={thawed.oyako}
              onChange={(v) =>
                setThawed((p) => ({ ...p, oyako: fmtComma(parseNum(v)) }))
              }
            />
            <Field
              label="極上"
              value={thawed.gokujo}
              onChange={(v) =>
                setThawed((p) => ({ ...p, gokujo: fmtComma(parseNum(v)) }))
              }
            />
            <Field
              label="唐揚げ"
              value={thawed.karaage}
              onChange={(v) =>
                setThawed((p) => ({ ...p, karaage: fmtComma(parseNum(v)) }))
              }
            />
          </div>

          <h2 className="font-semibold mt-2">明日以降の予想（売上・天気）</h2>

          <div className="grid gap-3 md:grid-cols-2">
            {plans.map((p) => {
              const d = addDays(baseDate, p.offset);
              const holidayName = getHolidayName(d);
              const holiday = Boolean(holidayName) || isWeekend(d);

              const label = `${p.offset}日後：${daysJP[d.getDay()]}(${md(d)})`;
              return (
                <div
                  key={p.offset}
                  className="rounded-xl border bg-slate-50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {label} {holiday ? "（祝/休）" : ""}
                      {holidayName ? `【${holidayName}】` : ""}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-700">予想売上</div>
                      <input
                        value={p.sales}
                        inputMode="numeric"
                        onChange={(e) =>
                          setPlan(p.offset, {
                            sales: fmtComma(parseNum(e.target.value)),
                          })
                        }
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                        placeholder="例: 240,000"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-slate-700">
                        天気（手入力）
                      </div>
                      <select
                        value={p.weather}
                        onChange={(e) =>
                          setPlan(p.offset, {
                            weather: e.target.value as WeatherKind,
                          })
                        }
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="unknown">不明</option>
                        <option value="sun">晴</option>
                        <option value="cloud">曇</option>
                        <option value="rain">雨</option>
                        <option value="snow">雪</option>
                        <option value="storm">荒</option>
                      </select>
                      <div className="text-[11px] text-slate-500">
                        補正：雨0.9 / 雪0.8 / 荒0.85（calcForType側）
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCalc}
              disabled={!usageData.length}
              className="rounded-xl bg-sky-600 px-4 py-2 text-white font-semibold disabled:opacity-50"
            >
              解凍数を計算
            </button>
          </div>
        </section>

        {/* Targets preview */}
        <section className="rounded-2xl bg-white p-5 shadow">
          <h2 className="font-semibold mb-2">今回仕込む日（targets）</h2>
          <div className="flex flex-wrap gap-2">
            {previewTargets.map((t) => (
              <span
                key={t.offset}
                className="rounded-full border bg-slate-50 px-3 py-1 text-xs"
              >
                {t.label}
                {t.isHoliday ? "（祝/休）" : ""}
                {t.holidayName ? `【${t.holidayName}】` : ""}
                {" / "}
                {weatherLabel[t.weather]}
                {" / "}
                {fmtComma(t.sales)}円
              </span>
            ))}
            {!previewTargets.length && (
              <span className="text-xs text-slate-500">
                targets がありません（入力を確認）
              </span>
            )}
          </div>
        </section>

        {/* Result */}
        <section className="rounded-2xl bg-white p-5 shadow">
          <h2 className="font-semibold mb-3">追加で解凍</h2>

          {result ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultBox label="親子" pack={result.oyako.addPack} />
                <ResultBox label="極上" pack={result.gokujo.addPack} />
                <ResultBox label="唐揚げ" pack={result.karaage.addPack} />
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-slate-700">
                  計算の内訳
                </summary>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <NeedBox title="親子" r={result.oyako} />
                  <NeedBox title="極上" r={result.gokujo} />
                  <NeedBox title="唐揚げ" r={result.karaage} />
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              入力して「解凍数を計算」を押す
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

// ===== Components =====
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-700">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9,.-]*"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="例: 3"
      />
    </div>
  );
}

function ResultBox({ label, pack }: { label: string; pack: number }) {
  const p = safeNum(pack, 0);
  return (
    <div className="rounded-xl bg-slate-50 p-4 border text-center">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-4xl font-bold">{fmtComma(p)}</div>
      <div className="text-xs text-slate-500">pack</div>
    </div>
  );
}

function NeedBox({ title, r }: { title: string; r: any }) {
  const peak = safeNum(r?.detail?.peakNeedPack, 0);
  const thawed = safeNum(r?.detail?.thawedNowPack, 0);
  const targets = Array.isArray(r?.detail?.targets) ? r.detail.targets : [];
  const chosen = r?.detail?.chosen ?? null;

  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="font-semibold text-sm">{title}</div>

      <div className="mt-1 text-xs text-slate-700">
        目標在庫（ピーク）: {peak.toFixed(2)} pack
      </div>
      <div className="text-xs text-slate-700">
        解凍済み: {thawed.toFixed(2)} pack
      </div>

      {chosen && (
        <div className="mt-1 text-xs text-slate-600">
          採用: {chosen.label}（必要 {safeNum(chosen.needPack, 0).toFixed(2)}{" "}
          pack）
        </div>
      )}

      <div className="mt-2 space-y-1">
        {targets.map((t: any, i: number) => (
          <div key={i} className="rounded-lg bg-white border p-2 text-xs">
            <div className="font-semibold">{t.label}</div>
            <div className="text-slate-600">
              売上 {fmtComma(safeNum(t.rawSales, 0))} → 補正{" "}
              {fmtComma(safeNum(t.adjustedSales, 0))}
              {" / "}
              必要 {safeNum(t.needPack, 0).toFixed(2)} pack
              {" / "}
              天気係数 {safeNum(t.weatherFactor, 1).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
