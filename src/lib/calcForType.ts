// src/lib/calcForType.ts
// 完成形（ピーク方式 + 現場換算）
// ✅ targets は合算せず「最大（ピーク）」を満たす
// ✅ 天気補正（雨0.9 / 雪0.8 / 荒0.85）
// ✅ oyako/gokujo: usageのgを packGram で pack換算
// ✅ karaage: usageのpackに karaageNeedFactor を掛けて調整（例: 0.9）

export type MeatType = "oyako" | "gokujo" | "karaage";

export type UsageRow = {
  sales: number;
  oyako_g: number;
  gokujo_g: number;
  karaage_pack: number;
};

export type WeatherKind = "sun" | "cloud" | "rain" | "snow" | "storm" | "unknown";

export type TargetDay = {
  offset: number;
  label: string; // 例: 日(12/28)
  dateISO: string; // YYYY-MM-DD
  sales: number; // 円
  weather: WeatherKind;
  isHoliday: boolean;
  holidayName?: string;
};

export type TargetNeed = {
  label: string;
  dateISO: string;
  rawSales: number;
  adjustedSales: number;
  needPack: number;
  weatherFactor: number;
};

export type ResultDetail = {
  addPack: number;
  addGram: number; // oyako/gokujo用（参考）
  detail: {
    thawedNowPack: number;
    peakNeedPack: number;
    targets: TargetNeed[];
    chosen: { label: string; dateISO: string; adjustedSales: number; needPack: number } | null;
    factors: {
      packGramUsed?: number;
      karaageNeedFactorUsed?: number;
    };
  };
};

// ===== utils =====
const clamp0 = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

const getKey = (type: MeatType): keyof UsageRow => {
  if (type === "oyako") return "oyako_g";
  if (type === "gokujo") return "gokujo_g";
  return "karaage_pack";
};

export const weatherFactor = (w: WeatherKind) => {
  if (w === "rain") return 0.9;
  if (w === "snow") return 0.8;
  if (w === "storm") return 0.85;
  return 1.0;
};

// usage表から必要量（線形補間）
const needFromSalesRaw = (usage: UsageRow[], sales: number, type: MeatType): number => {
  const s = clamp0(sales);
  if (!usage.length) return 0;

  const rows = [...usage].sort((a, b) => a.sales - b.sales);
  const key = getKey(type);

  if (s <= rows[0].sales) return rows[0][key];
  if (s >= rows.at(-1)!.sales) return rows.at(-1)![key];

  const exact = rows.find((r) => r.sales === s);
  if (exact) return exact[key];

  for (let i = 0; i < rows.length - 1; i++) {
    const lo = rows[i];
    const hi = rows[i + 1];
    if (lo.sales < s && s < hi.sales) {
      const t = (s - lo.sales) / (hi.sales - lo.sales);
      return lo[key] + (hi[key] - lo[key]) * t;
    }
  }
  return rows.at(-1)![key];
};

export const calcForType = (params: {
  type: MeatType;
  usageData: UsageRow[];
  thawedNowPack: number;
  targets: TargetDay[];

  // ★現場換算パラメータ
  packGram?: number; // oyako/gokujo: 1pack何gか
  karaageNeedFactor?: number; // karaage: 必要packに掛ける係数（例: 0.9）
}): ResultDetail => {
  const {
    type,
    usageData,
    thawedNowPack,
    targets,
    packGram = 1000,
    karaageNeedFactor = 1.0,
  } = params;

  const thawed = clamp0(thawedNowPack);

  const needs: TargetNeed[] = targets.map((t) => {
    const wf = weatherFactor(t.weather);
    const adjustedSales = Math.round(clamp0(t.sales) * wf);

    const rawNeed = needFromSalesRaw(usageData, adjustedSales, type);

    let needPack =
      type === "karaage" ? rawNeed * karaageNeedFactor : rawNeed / packGram;

    needPack = clamp0(needPack);

    const holidaySuffix = t.isHoliday ? "（祝/休）" : "";
    const label = t.holidayName
      ? `${t.label}${holidaySuffix}【${t.holidayName}】`
      : `${t.label}${holidaySuffix}`;

    return {
      label,
      dateISO: t.dateISO,
      rawSales: clamp0(t.sales),
      adjustedSales,
      needPack,
      weatherFactor: wf,
    };
  });

  // ピーク（最大）を採用
  let peakNeedPack = 0;
  let chosen: ResultDetail["detail"]["chosen"] = null;

  for (const n of needs) {
    if (n.needPack >= peakNeedPack) {
      peakNeedPack = n.needPack;
      chosen = {
        label: n.label,
        dateISO: n.dateISO,
        adjustedSales: n.adjustedSales,
        needPack: n.needPack,
      };
    }
  }

  const addPack = Math.max(0, Math.ceil(peakNeedPack - thawed));

  return {
    addPack,
    addGram: type === "karaage" ? 0 : addPack * packGram,
    detail: {
      thawedNowPack: thawed,
      peakNeedPack,
      targets: needs,
      chosen,
      factors: {
        packGramUsed: type === "karaage" ? undefined : packGram,
        karaageNeedFactorUsed: type === "karaage" ? karaageNeedFactor : undefined,
      },
    },
  };
};
