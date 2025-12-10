"use client";

import { useState, ChangeEvent } from "react";

// ===== 定数 =====
const OYAKO_PACK_GRAM = 1000; // 1パックあたりのグラム数（必要なら変更）
const GOKUJO_PACK_GRAM = 1000; // 1パックあたりのグラム数（必要なら変更）

// ===== 型定義 =====
interface Inputs {
  todayActualSales: string;
  todayPredSales: string;
  tomorrowSales: string;
  dayAfterSales: string;
  thawedOyako: string;
  thawedGokujo: string;
  thawedKaraage: string;
}

interface UsageRow {
  sales: number;
  oyako_g: number;
  gokujo_g: number;
  karaage_pack: number;
}

interface CalcDetail {
  todayPredPack: number;
  todaySoFarPack: number;
  remainingTodayUse: number;
  leftoverEndOfDay: number;
  tomorrowNeed: number;
  dayAfterNeed: number;
}

interface ResultDetail {
  pack: number;
  gram: number;
  detail: CalcDetail;
}

interface Results {
  oyako: ResultDetail;
  gokujo: ResultDetail;
  karaage: ResultDetail;
}

// ===== 数値フォーマット（3桁カンマ） =====
function formatNumberComma(value: string): string {
  const num = value.replace(/,/g, "");
  if (!num || isNaN(Number(num)))
    return num === "" ? "" : value.replace(/[^\d,]/g, "");
  return Number(num).toLocaleString();
}

// ===== カンマを外して数値に変換 =====
function parseNumber(value: string): number {
  if (!value) return 0;
  return Number(value.replace(/,/g, ""));
}

// ===== 使用量テーブルから線形補間で使用量を取得 =====
function getUsageBySales(
  sales: number,
  type: "oyako" | "gokujo" | "karaage",
  usageData: UsageRow[]
): { gram: number; pack: number } {
  if (!usageData.length || isNaN(sales)) return { gram: 0, pack: 0 };

  const sorted = [...usageData].sort((a, b) => a.sales - b.sales);

  // 範囲外は端の値を使う
  if (sales <= sorted[0].sales) return convertUsage(sorted[0], type);
  if (sales >= sorted[sorted.length - 1].sales)
    return convertUsage(sorted[sorted.length - 1], type);

  // 挟む2点を探す
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].sales <= sales && sales <= sorted[i + 1].sales) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }

  const rate = (sales - lower.sales) / (upper.sales - lower.sales || 1); // 0除算回避

  return convertUsageInterpolated(lower, upper, type, rate);
}

// ===== 補間なし（テーブルそのまま） =====
function convertUsage(row: UsageRow, type: "oyako" | "gokujo" | "karaage") {
  if (type === "oyako")
    return { gram: row.oyako_g, pack: row.oyako_g / OYAKO_PACK_GRAM };

  if (type === "gokujo")
    return { gram: row.gokujo_g, pack: row.gokujo_g / GOKUJO_PACK_GRAM };

  // 唐揚げは pack だけ管理
  return { gram: 0, pack: row.karaage_pack };
}

// ===== 補間あり =====
function convertUsageInterpolated(
  lower: UsageRow,
  upper: UsageRow,
  type: "oyako" | "gokujo" | "karaage",
  rate: number
) {
  if (type === "oyako") {
    const gram = lower.oyako_g + (upper.oyako_g - lower.oyako_g) * rate;
    return { gram, pack: gram / OYAKO_PACK_GRAM };
  }

  if (type === "gokujo") {
    const gram = lower.gokujo_g + (upper.gokujo_g - lower.gokujo_g) * rate;
    return { gram, pack: gram / GOKUJO_PACK_GRAM };
  }

  const pack =
    lower.karaage_pack + (upper.karaage_pack - lower.karaage_pack) * rate;

  return { gram: 0, pack };
}

// ===== 親子 / 極上 / 唐揚げごとの計算ロジック本体 =====
function calcForType(params: {
  todayActualSales: number;
  todayPredSales: number;
  tomorrowSales: number;
  dayAfterSales: number;
  thawedNow: number; // すでに解凍済み（パック）
  type: "oyako" | "gokujo" | "karaage";
  usageData: UsageRow[];
}): ResultDetail {
  const {
    todayActualSales,
    todayPredSales,
    tomorrowSales,
    dayAfterSales,
    thawedNow,
    type,
    usageData,
  } = params;

  // 今日のトータル予測・ここまでの実績
  const todayPredUsage = getUsageBySales(todayPredSales, type, usageData);
  const todaySoFarUsage = getUsageBySales(todayActualSales, type, usageData);

  const todayPredPack = todayPredUsage.pack;
  const todaySoFarPack = todaySoFarUsage.pack;

  // 今日これから必要な分
  const remainingTodayUse = Math.max(0, todayPredPack - todaySoFarPack);

  // 明日・明後日
  const tomorrowNeed = getUsageBySales(tomorrowSales, type, usageData).pack;
  const dayAfterNeed = getUsageBySales(dayAfterSales, type, usageData).pack;

  // 3日間で「これから」必要な合計
  const requiredTotal = remainingTodayUse + tomorrowNeed + dayAfterNeed;

  // 解凍済みを差し引いて追加解凍パック数
  const thawToAddPack = Math.max(0, requiredTotal - thawedNow);

  // 今日営業終了時点での残り目安
  const leftoverEndOfDay = thawedNow + thawToAddPack - todayPredPack;

  const detail: CalcDetail = {
    todayPredPack,
    todaySoFarPack,
    remainingTodayUse,
    leftoverEndOfDay,
    tomorrowNeed,
    dayAfterNeed,
  };

  const gram =
    type === "oyako"
      ? thawToAddPack * OYAKO_PACK_GRAM
      : type === "gokujo"
      ? thawToAddPack * GOKUJO_PACK_GRAM
      : 0;

  return {
    pack: thawToAddPack,
    gram,
    detail,
  };
}

// ==================== UI 本体 ====================

export default function Page() {
  const [inputs, setInputs] = useState<Inputs>({
    todayActualSales: "",
    todayPredSales: "",
    tomorrowSales: "",
    dayAfterSales: "",
    thawedOyako: "",
    thawedGokujo: "",
    thawedKaraage: "",
  });

  const [usageData, setUsageData] = useState<UsageRow[]>([]);
  const [results, setResults] = useState<Results | null>(null);

  // ★ ここに既存の useEffect で usageData（表）読み込みを戻すイメージ
  // useEffect(() => {
  //   fetch("/usage.json")
  //     .then((res) => res.json())
  //     .then((data) => setUsageData(data));
  // }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const formatted = formatNumberComma(value);
    setInputs((prev) => ({ ...prev, [name]: formatted }));
  };

  const handleCalculate = () => {
    const todayActualSales = parseNumber(inputs.todayActualSales);
    const todayPredSales = parseNumber(inputs.todayPredSales);
    const tomorrowSales = parseNumber(inputs.tomorrowSales);
    const dayAfterSales = parseNumber(inputs.dayAfterSales);

    const thawedOyako = parseNumber(inputs.thawedOyako);
    const thawedGokujo = parseNumber(inputs.thawedGokujo);
    const thawedKaraage = parseNumber(inputs.thawedKaraage);

    const common = {
      todayActualSales,
      todayPredSales,
      tomorrowSales,
      dayAfterSales,
      usageData,
    };

    const oyako = calcForType({
      ...common,
      thawedNow: thawedOyako,
      type: "oyako",
    });

    const gokujo = calcForType({
      ...common,
      thawedNow: thawedGokujo,
      type: "gokujo",
    });

    const karaage = calcForType({
      ...common,
      thawedNow: thawedKaraage,
      type: "karaage",
    });

    setResults({ oyako, gokujo, karaage });
  };

  return (
    <main className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-5xl px-4">
        {/* ヘッダー */}
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              おにくたち
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              今日の売上・予測と解凍済み在庫から、
              親子・極上・唐揚げの追加解凍数を自動計算
            </p>
          </div>
          <div className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-slate-50 shadow">
            実務用ロジック版
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[1.4fr,1fr]">
          {/* 入力エリア */}
          <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">売上入力</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  今日の実績売上
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="todayActualSales"
                  value={inputs.todayActualSales}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）120,000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  今日の最終予測売上
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="todayPredSales"
                  value={inputs.todayPredSales}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）150,000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  明日の予測売上
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="tomorrowSales"
                  value={inputs.tomorrowSales}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）130,000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  明後日の予測売上
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="dayAfterSales"
                  value={inputs.dayAfterSales}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）110,000"
                />
              </div>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              解凍済み在庫（パック）
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  親子 解凍済み
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="thawedOyako"
                  value={inputs.thawedOyako}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）3"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  極上 解凍済み
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="thawedGokujo"
                  value={inputs.thawedGokujo}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）2"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  唐揚げ 解凍済み
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  name="thawedKaraage"
                  value={inputs.thawedKaraage}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="例）4"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCalculate}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-1"
              >
                解凍数を計算
              </button>
            </div>
          </section>

          {/* 結果エリア */}
          <section className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                追加で解凍する数
              </h2>
              {results ? (
                <div className="space-y-3">
                  <ResultCard title="親子" result={results.oyako} unitGram />
                  <ResultCard title="極上" result={results.gokujo} unitGram />
                  <ResultCard
                    title="唐揚げ"
                    result={results.karaage}
                    unitGram={false}
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  売上と解凍済み在庫を入力して「解凍数を計算」を押す
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

// ===== 結果カードコンポーネント =====
function ResultCard({
  title,
  result,
  unitGram,
}: {
  title: string;
  result: ResultDetail;
  unitGram: boolean;
}) {
  const d = result.detail;
  const baseColor =
    title === "親子" ? "sky" : title === "極上" ? "amber" : "emerald";

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-inner">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span
          className={`rounded-full bg-${baseColor}-100 px-3 py-1 text-xs font-semibold text-${baseColor}-800`}
        >
          追加 {result.pack.toFixed(2)} パック
          {unitGram && (
            <span className="ml-1 text-[11px] text-slate-500">
              （約 {Math.round(result.gram)} g）
            </span>
          )}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <div>
          <dt className="text-slate-400">今日の予測</dt>
          <dd>{d.todayPredPack.toFixed(2)} pack</dd>
        </div>
        <div>
          <dt className="text-slate-400">ここまでの使用</dt>
          <dd>{d.todaySoFarPack.toFixed(2)} pack</dd>
        </div>
        <div>
          <dt className="text-slate-400">今日これから</dt>
          <dd>{d.remainingTodayUse.toFixed(2)} pack</dd>
        </div>
        <div>
          <dt className="text-slate-400">明日分</dt>
          <dd>{d.tomorrowNeed.toFixed(2)} pack</dd>
        </div>
        <div>
          <dt className="text-slate-400">明後日分</dt>
          <dd>{d.dayAfterNeed.toFixed(2)} pack</dd>
        </div>
        <div>
          <dt className="text-slate-400">今日閉店時の残り目安</dt>
          <dd>{d.leftoverEndOfDay.toFixed(2)} pack</dd>
        </div>
      </dl>
    </div>
  );
}
