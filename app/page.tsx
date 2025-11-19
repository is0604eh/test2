"use client";

import { useEffect, useState, ChangeEvent, FocusEvent } from "react";

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

// ===== メインコンポーネント =====
export default function Home() {
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
  const [activeField, setActiveField] = useState<keyof Inputs | null>(null);

  // 売上候補
  const presets = [350000, 400000, 450000, 500000, 550000, 600000];

  // JSON 読み込み
  useEffect(() => {
    fetch("/meat_usage.json")
      .then((res) => res.json())
      .then((data: UsageRow[]) =>
        setUsageData(data.sort((a, b) => a.sales - b.sales))
      );
  }, []);

  // 入力変更
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const noComma = value.replace(/,/g, "");
    if (noComma === "" || !isNaN(Number(noComma))) {
      setInputs((prev) => ({ ...prev, [name]: noComma }));
    }
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setActiveField(e.target.name as keyof Inputs);
  };

  // 売上近似行取得
  const findRow = (sales: number): UsageRow => {
    if (usageData.length === 0)
      return { sales: 0, oyako_g: 0, gokujo_g: 0, karaage_pack: 0 };
    return usageData.reduce((prev, curr) =>
      Math.abs(curr.sales - sales) < Math.abs(prev.sales - sales) ? curr : prev
    );
  };

  const gToPack = (g: number) => g / 2000;

  const packFromSales = (
    sales: number,
    type: "oyako" | "gokujo" | "karaage"
  ): number => {
    const row = findRow(sales);
    return type === "karaage"
      ? row.karaage_pack
      : gToPack(type === "oyako" ? row.oyako_g : row.gokujo_g);
  };

  // 計算
  const calculateThaw = () => {
    const todayActual = Number(inputs.todayActualSales || 0);
    const todayPred = Number(inputs.todayPredSales || 0);
    const tomorrow = Number(inputs.tomorrowSales || 0);
    const dayAfter = Number(inputs.dayAfterSales || 0);

    const thawOy = Number(inputs.thawedOyako || 0);
    const thawGo = Number(inputs.thawedGokujo || 0);
    const thawKa = Number(inputs.thawedKaraage || 0);

    const calc = (
      type: "oyako" | "gokujo" | "karaage",
      thawedPack: number
    ): ResultDetail => {
      const todayPredPack = packFromSales(todayPred, type);
      const todaySoFarPack = packFromSales(todayActual, type);
      const remainingTodayUse = Math.max(todayPredPack - todaySoFarPack, 0);
      const leftoverEndOfDay = thawedPack - remainingTodayUse;
      const tomorrowNeed = packFromSales(tomorrow, type);
      const dayAfterNeed = packFromSales(dayAfter, type);
      const futureNeed = tomorrowNeed + dayAfterNeed;
      const needPack = Math.max(
        Math.ceil(futureNeed - Math.max(leftoverEndOfDay, 0)),
        0
      );

      return {
        pack: needPack,
        gram: needPack * 2000,
        detail: {
          todayPredPack,
          todaySoFarPack,
          remainingTodayUse,
          leftoverEndOfDay,
          tomorrowNeed,
          dayAfterNeed,
        },
      };
    };

    setResults({
      oyako: calc("oyako", thawOy),
      gokujo: calc("gokujo", thawGo),
      karaage: calc("karaage", thawKa),
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 min-h-screen bg-gray-50 text-gray-800">
      <h1 className="text-3xl font-bold text-center mb-8 flex items-center justify-center gap-2">
        おにくたち
      </h1>

      <div className="grid sm:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Section title="📅 今日の売上">
            <Input
              label="実績"
              name="todayActualSales"
              unit="円"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
            <Input
              label="予測（1日）"
              name="todayPredSales"
              unit="円"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
            <PresetButtons {...{ presets, activeField, setInputs }} />
          </Section>

          <Section title="🥩 解凍済み（パック）">
            <Input
              label="親子肉"
              name="thawedOyako"
              unit="パック"
              color="text-orange-600"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
            <Input
              label="極上肉"
              name="thawedGokujo"
              unit="パック"
              color="text-blue-600"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
            <Input
              label="鶏から"
              name="thawedKaraage"
              unit="パック"
              color="text-green-600"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
          </Section>

          <Section title="📊 売上予測（明日・明後日）">
            <Input
              label="明日"
              name="tomorrowSales"
              unit="円"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
            <Input
              label="明後日"
              name="dayAfterSales"
              unit="円"
              {...{ inputs, handleChange, handleFocus, activeField }}
            />
          </Section>
        </div>

        <div>
          {results ? (
            <ResultDisplay results={results} />
          ) : (
            <p className="text-gray-400 mt-10 text-center">
              ← 入力して「計算する」ボタンを押してください
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={calculateThaw}
          className="
            bg-pink-600 hover:bg-pink-700 text-white
            py-3 px-6 rounded-xl shadow-xl text-lg font-bold
            w-full sm:w-auto
          "
        >
          📌 計算する
        </button>
      </div>
    </div>
  );
}

// ===== UI コンポーネント =====

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function PresetButtons({ presets, activeField, setInputs }: any) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map((v: number) => (
        <button
          key={v}
          className="bg-gray-200 hover:bg-gray-300 rounded p-2 text-sm"
          onClick={() =>
            activeField &&
            setInputs((prev: Inputs) => ({ ...prev, [activeField]: String(v) }))
          }
        >
          {v.toLocaleString()}円
        </button>
      ))}
    </div>
  );
}

function Input({
  label,
  name,
  unit,
  inputs,
  handleChange,
  handleFocus,
  activeField,
  color,
}: any) {
  const formatted = inputs[name] ? Number(inputs[name]).toLocaleString() : "";
  return (
    <div>
      <label className={`block font-bold mb-1 ${color || ""}`}>{label}</label>
      <input
        type="text"
        name={name}
        value={formatted}
        onChange={handleChange}
        onFocus={handleFocus}
        className={`w-full rounded border p-3 text-lg ${
          activeField === name ? "border-blue-500" : "border-gray-300"
        }`}
        inputMode="numeric"
      />
      <span className="text-sm text-gray-500">{unit}</span>
    </div>
  );
}

function ResultDisplay({ results }: { results: Results }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-4">
      <h2 className="text-xl font-semibold text-pink-700">
        📌 今日追加で解凍すべき量
      </h2>

      <ResultItem type="親子肉" color="text-orange-600" data={results.oyako} />
      <ResultItem type="極上肉" color="text-blue-600" data={results.gokujo} />
      <ResultItem type="鶏から" color="text-green-600" data={results.karaage} />

      <details className="mt-4 cursor-pointer">
        <summary className="font-semibold">🧮 計算過程を見る</summary>
        <DetailSection title="親子肉" result={results.oyako} />
        <DetailSection title="極上肉" result={results.gokujo} />
        <DetailSection title="鶏から" result={results.karaage} />
      </details>
    </div>
  );
}

function ResultItem({ type, color, data }: any) {
  return (
    <p className={`${color} text-lg font-bold`}>
      {type}：{data.pack} パック（{data.gram} g）
    </p>
  );
}

function DetailSection({ title, result }: any) {
  const d = result.detail;
  return (
    <div className="mt-2 text-sm bg-gray-50 p-3 rounded-lg leading-relaxed">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p>
        今日の予測：<code>{d.todayPredPack.toFixed(2)}</code> パック
        <br />
        今日の実績：<code>{d.todaySoFarPack.toFixed(2)}</code> パック
        <br />⇒ まだ使う：<strong>{d.remainingTodayUse.toFixed(2)}</strong>{" "}
        パック
        <br />
        <br />
        現在解凍済み：<code>{d.leftoverEndOfDay.toFixed(2)}</code> パック
        <br />
        明日必要：<code>{d.tomorrowNeed.toFixed(2)}</code> パック
        <br />
        明後日必要：<code>{d.dayAfterNeed.toFixed(2)}</code> パック
        <br />⇒ <strong>追加必要：{result.pack} パック</strong>
      </p>
    </div>
  );
}
