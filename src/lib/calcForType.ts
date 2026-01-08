// calcForType.ts
// 曜日無視
// 入力：営業終了後の総量（段＋pack）、売上予想（明日・明後日・明々後日）
// 表：meat_usage.json の「最も近い sales 行」を採用
//
// 表示したい式（あなたの指定）に合わせた計算：
// ① S - d1 = left
// ② d2 - left = short（※short = max(d2 - left, 0)）
// ③ d3 + short = thaw（明日の朝に溶かす量）
// 出力：kg と pack（端数OK）

export type UsageRow = {
  sales: number;
  oyako_g: number;
  gokujo_g: number;
  karaage_pack: number;
};

export type InventoryInput = {
  oyako: { dan: number; pack: number };
  gokujo: { dan: number; pack: number };
  karaage: { dan: number; pack: number };
};

export type OneMeat = {
  stockKg: number;

  d1: number;
  d2: number;
  d3: number;

  used1: number;
  used2: number;
  used3: number;

  left: number;   // S - d1
  short: number;  // max(d2 - left, 0)

  thawKg: number;   // d3 + short
  thawPack: number; // thawKg / 2
};

export type CalcResult = {
  oyako: OneMeat;
  gokujo: OneMeat;
  karaage: OneMeat;
};

const KG_PER_PACK = 2;
const KG_PER_DAN = 3;
const KARAAGE_KG_PER_DAN = 6;

const r1 = (n: number) => Math.round(n * 10) / 10;

const clamp0 = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

function nearestRow(data: UsageRow[], sales: number): UsageRow {
  if (!data.length) return { sales, oyako_g: 0, gokujo_g: 0, karaage_pack: 0 };
  return data.reduce((best, cur) =>
    Math.abs(cur.sales - sales) < Math.abs(best.sales - sales) ? cur : best
  );
}

function invToKg(inv: InventoryInput) {
  return {
    oyako: clamp0(inv.oyako.dan) * KG_PER_DAN + clamp0(inv.oyako.pack) * KG_PER_PACK,
    gokujo: clamp0(inv.gokujo.dan) * KG_PER_DAN + clamp0(inv.gokujo.pack) * KG_PER_PACK,
    karaage:
      clamp0(inv.karaage.dan) * KARAAGE_KG_PER_DAN + clamp0(inv.karaage.pack) * KG_PER_PACK,
  };
}

function needKg(row: UsageRow) {
  return {
    oyako: (row.oyako_g ?? 0) / 1000,
    gokujo: (row.gokujo_g ?? 0) / 1000,
    karaage: (row.karaage_pack ?? 0) * KG_PER_PACK,
  };
}

function calcOne(S: number, d1: number, d2: number, d3: number, u1: number, u2: number, u3: number): OneMeat {
  const left = S - d1;
  const short = Math.max(d2 - left, 0);
  const thawKg = d3 + short;

  return {
    stockKg: r1(S),

    d1: r1(d1),
    d2: r1(d2),
    d3: r1(d3),

    used1: u1,
    used2: u2,
    used3: u3,

    left: r1(left),
    short: r1(short),

    thawKg: r1(thawKg),
    thawPack: r1(thawKg / KG_PER_PACK),
  };
}

export function calculate(args: {
  inventory: InventoryInput;
  salesTomorrow: number;
  salesDayAfter: number;
  salesTwoDaysAfter: number;
  usageData: UsageRow[];
}): CalcResult {
  const S = invToKg(args.inventory);

  const row1 = nearestRow(args.usageData, args.salesTomorrow);
  const row2 = nearestRow(args.usageData, args.salesDayAfter);
  const row3 = nearestRow(args.usageData, args.salesTwoDaysAfter);

  const n1 = needKg(row1);
  const n2 = needKg(row2);
  const n3 = needKg(row3);

  return {
    oyako: calcOne(S.oyako, n1.oyako, n2.oyako, n3.oyako, row1.sales, row2.sales, row3.sales),
    gokujo: calcOne(S.gokujo, n1.gokujo, n2.gokujo, n3.gokujo, row1.sales, row2.sales, row3.sales),
    karaage: calcOne(S.karaage, n1.karaage, n2.karaage, n3.karaage, row1.sales, row2.sales, row3.sales),
  };
}
