// page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import usageJson from "../public/meat_usage.json";
import {
  calculate,
  type InventoryInput,
  type UsageRow,
} from "../src/lib/calcForType";

const usageData = usageJson as UsageRow[];

const fmt = new Intl.NumberFormat("ja-JP");
const SALES_OPTS = Array.from({ length: 15 }, (_, i) => (i + 1) * 100_000);

function parseCommaNumber(s: string) {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function SalesInput(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(props.value ? fmt.format(props.value) : "");
  }, [props.value]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <b>{props.label}</b>
      <div>
        <input
          list="sales-options"
          placeholder="例：850,000"
          value={text}
          onChange={(e) => {
            const n = parseCommaNumber(e.target.value);
            props.onChange(n);
            setText(n ? fmt.format(n) : "");
          }}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
          }}
        />
        <datalist id="sales-options">
          {SALES_OPTS.map((n) => (
            <option key={n} value={fmt.format(n)} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

function NumInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      inputMode="decimal"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #cbd5e1",
      }}
    />
  );
}

function MeatRow(props: {
  title: string;
  note?: string;
  dan: string;
  pack: string;
  onDan: (v: string) => void;
  onPack: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr 1fr",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 900 }}>
        {props.title}
        {props.note && (
          <div style={{ fontSize: 11, color: "#6b7280" }}>{props.note}</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>段</div>
        <NumInput
          value={props.dan}
          onChange={props.onDan}
          placeholder="例：8"
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>pack</div>
        <NumInput
          value={props.pack}
          onChange={props.onPack}
          placeholder="例：15"
        />
      </div>
    </div>
  );
}

function FormulaBlock(props: {
  label: string;
  m: {
    stockKg: number;
    d1: number;
    d2: number;
    d3: number;
    used1: number;
    used2: number;
    used3: number;
    left: number;
    short: number;
    thawKg: number;
  };
}) {
  const { m } = props;

  return (
    <div
      style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}
    >
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{props.label}</div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #cbd5e1",
          whiteSpace: "pre-wrap",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.7,
          background: "#fff",
        }}
      >
        {`${m.stockKg}kg（今あるお肉）-${m.d1}kg（明日の${fmt.format(
          m.used1
        )}の時の${props.label}）＝${m.left}kg
${m.d2}kg（明後日の${fmt.format(m.used2)}の時の${props.label}）-${
          m.left
        }kg（今あるお肉-明日の${fmt.format(m.used1)}の時の${props.label}）＝${
          m.short
        }kg
${m.d3}kg（明々後日の${fmt.format(m.used3)}の時の${props.label}）＋${
          m.short
        }kg（（明後日の${fmt.format(m.used2)}の時の${
          props.label
        }）-（今あるお肉-明日の${fmt.format(m.used1)}の時の${
          props.label
        }））＝${m.thawKg}kg（明日の朝に溶かす量）`}
      </pre>
    </div>
  );
}

export default function Page() {
  // 初期値は空
  const [inv, setInv] = useState({
    oyako: { dan: "", pack: "" },
    gokujo: { dan: "", pack: "" },
    karaage: { dan: "", pack: "" },
  });

  const [salesTomorrow, setSalesTomorrow] = useState(0);
  const [salesDayAfter, setSalesDayAfter] = useState(0);
  const [salesTwoDaysAfter, setSalesTwoDaysAfter] = useState(0);

  const [result, setResult] = useState<ReturnType<typeof calculate> | null>(
    null
  );

  const inventory: InventoryInput = useMemo(() => {
    const toN = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      oyako: { dan: toN(inv.oyako.dan), pack: toN(inv.oyako.pack) },
      gokujo: { dan: toN(inv.gokujo.dan), pack: toN(inv.gokujo.pack) },
      karaage: { dan: toN(inv.karaage.dan), pack: toN(inv.karaage.pack) },
    };
  }, [inv]);

  const onCalc = () => {
    const r = calculate({
      inventory,
      salesTomorrow,
      salesDayAfter,
      salesTwoDaysAfter,
      usageData,
    });
    setResult(r);
  };

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: 20,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 14 }}>おにくたち</h1>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <h2 style={{ marginTop: 0 }}>営業終了後の総量</h2>

        <MeatRow
          title="親子肉"
          dan={inv.oyako.dan}
          pack={inv.oyako.pack}
          onDan={(v) =>
            setInv((p) => ({ ...p, oyako: { ...p.oyako, dan: v } }))
          }
          onPack={(v) =>
            setInv((p) => ({ ...p, oyako: { ...p.oyako, pack: v } }))
          }
        />
        <MeatRow
          title="極上肉"
          dan={inv.gokujo.dan}
          pack={inv.gokujo.pack}
          onDan={(v) =>
            setInv((p) => ({ ...p, gokujo: { ...p.gokujo, dan: v } }))
          }
          onPack={(v) =>
            setInv((p) => ({ ...p, gokujo: { ...p.gokujo, pack: v } }))
          }
        />
        <MeatRow
          title="から揚げ"
          note="※から揚げ：1段＝3pack＝6kg"
          dan={inv.karaage.dan}
          pack={inv.karaage.pack}
          onDan={(v) =>
            setInv((p) => ({ ...p, karaage: { ...p.karaage, dan: v } }))
          }
          onPack={(v) =>
            setInv((p) => ({ ...p, karaage: { ...p.karaage, pack: v } }))
          }
        />
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <h2 style={{ marginTop: 0 }}>各売り上げ予想</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <SalesInput
            label="明日"
            value={salesTomorrow}
            onChange={setSalesTomorrow}
          />
          <SalesInput
            label="明後日"
            value={salesDayAfter}
            onChange={setSalesDayAfter}
          />
          <SalesInput
            label="明々後日"
            value={salesTwoDaysAfter}
            onChange={setSalesTwoDaysAfter}
          />
        </div>
      </section>

      <button
        onClick={onCalc}
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          border: "1px solid #111827",
          background: "#111827",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        計算する
      </button>

      {result && (
        <>
          <section
            style={{
              border: "2px solid #111827",
              borderRadius: 14,
              padding: 14,
              marginTop: 14,
            }}
          >
            <h2 style={{ marginTop: 0 }}>解凍する量</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                親子肉：{result.oyako.thawKg}kg（{result.oyako.thawPack}pack）
              </li>
              <li>
                極上肉：{result.gokujo.thawKg}kg（{result.gokujo.thawPack}pack）
              </li>
              <li>
                から揚げ：{result.karaage.thawKg}kg（{result.karaage.thawPack}
                pack）
              </li>
            </ul>
          </section>

          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              marginTop: 14,
            }}
          >
            <h2 style={{ marginTop: 0 }}>計算過程</h2>

            <FormulaBlock label="親子肉" m={result.oyako} />
            <FormulaBlock label="極上肉" m={result.gokujo} />
            <FormulaBlock label="から揚げ" m={result.karaage} />
          </section>
        </>
      )}
    </main>
  );
}
