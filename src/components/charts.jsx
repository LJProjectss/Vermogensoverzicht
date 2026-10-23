import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ASSET_CATEGORIES, CATEGORIES } from '../lib/model.js';
import { CAT_SLOT } from '../lib/theme.js';
import { fmtCompact, fmtEur, fmtPct, fmtSigned, monthLong, monthShort } from '../lib/format.js';

const H = 280;

function axisProps(chart) {
  return {
    x: {
      dataKey: 'month',
      tickFormatter: monthShort,
      stroke: chart.axis,
      tick: { fill: chart.muted, fontSize: 12 },
      tickLine: false,
      minTickGap: 28,
      interval: 'preserveStartEnd',
    },
    y: {
      tickFormatter: fmtCompact,
      stroke: chart.axis,
      tick: { fill: chart.muted, fontSize: 12 },
      tickLine: false,
      axisLine: false,
      width: 72,
    },
    grid: { vertical: false, stroke: chart.grid },
  };
}

function TipBox({ title, rows, note, footer }) {
  return (
    <div className="tip">
      <div className="tip-title">{title}</div>
      {rows.map((r) => (
        <div className="tip-row" key={r.label}>
          {r.color && <span className="swatch" style={{ background: r.color }} />}
          <span className="tip-label">{r.label}</span>
          <span className="tip-val">{r.value}</span>
        </div>
      ))}
      {footer && <div className="tip-footer">{footer}</div>}
      {note && <div className="tip-note">📝 {note}</div>}
    </div>
  );
}

// Eigen legenda: vierkantje in de serie-kleur, tekst in inktkleur
function legendContent(items) {
  return () => (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <span className={it.line ? 'swatch line' : 'swatch'} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// 1. Netto vermogen door de tijd, met notitie-markeringen
export function NetWorthChart({ rows, chart }) {
  const a = axisProps(chart);
  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} />
        <YAxis {...a.y} />
        <ReferenceLine y={0} stroke={chart.axis} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <TipBox
                title={monthLong(r.month)}
                rows={[
                  { label: 'Netto vermogen', value: fmtEur(r.net) },
                  { label: 't.o.v. vorige', value: r.delta == null ? '—' : `${fmtSigned(r.delta)} (${fmtPct(r.deltaPct)})` },
                ]}
                note={r.note}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Netto vermogen"
          stroke={chart.line}
          strokeWidth={2}
          dot={rows.length === 1 ? { r: 4 } : false}
          activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {rows
          .filter((r) => r.note)
          .map((r) => (
            <ReferenceDot
              key={r.month}
              x={r.month}
              y={r.net}
              r={5}
              fill={chart.surface}
              stroke={chart.ink}
              strokeWidth={2}
            />
          ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// 2. Samenstelling per categorie (gestapeld), schulden onder de nullijn
export function CompositionChart({ rows, chart }) {
  const a = axisProps(chart);
  const present = CATEGORIES.filter((c) => rows.some((r) => r[c.id] !== 0));
  return (
    <ResponsiveContainer width="100%" height={H + 30}>
      <AreaChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} />
        <YAxis {...a.y} />
        <ReferenceLine y={0} stroke={chart.axis} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <TipBox
                title={monthLong(r.month)}
                rows={present.map((c) => ({
                  label: c.label,
                  color: chart.series[CAT_SLOT[c.id]],
                  value: c.id === 'schulden' ? fmtSigned(-r.debts) : fmtEur(r[c.id]),
                }))}
                footer={`Netto: ${fmtEur(r.net)}`}
              />
            );
          }}
        />
        <Legend content={legendContent(present.map((c) => ({ label: c.label, color: chart.series[CAT_SLOT[c.id]] })))} />
        {present.map((c) => (
          <Area
            key={c.id}
            type="monotone"
            dataKey={c.id === 'schulden' ? 'debtsNeg' : c.id}
            name={c.label}
            stackId={c.id === 'schulden' ? 'debt' : 'assets'}
            stroke={chart.surface}
            strokeWidth={1.5}
            fill={chart.series[CAT_SLOT[c.id]]}
            fillOpacity={0.9}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// 3. Verdeling van de laatste maand (donut) + legenda met bedragen
export function AllocationDonut({ row, chart }) {
  const data = ASSET_CATEGORIES.map((c) => ({ id: c.id, name: c.label, value: row[c.id] })).filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="donut-wrap">
      <div className="donut">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={96}
              stroke={chart.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.id} fill={chart.series[CAT_SLOT[d.id]]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <TipBox
                    title={d.name}
                    rows={[
                      { label: 'Waarde', value: fmtEur(d.value) },
                      { label: 'Aandeel bezit', value: fmtPct(d.value / total).replace('+', '') },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="muted small">Bezittingen</div>
          <div className="donut-total">{fmtCompact(total)}</div>
        </div>
      </div>
      <table className="alloc-table">
        <tbody>
          {data.map((d) => (
            <tr key={d.id}>
              <td>
                <span className="swatch" style={{ background: chart.series[CAT_SLOT[d.id]] }} />
                {d.name}
              </td>
              <td className="num">{fmtEur(d.value)}</td>
              <td className="num muted">{Math.round((d.value / total) * 100)}%</td>
            </tr>
          ))}
          {row.debts > 0 && (
            <tr>
              <td>
                <span className="swatch" style={{ background: chart.series[CAT_SLOT.schulden] }} />
                Schulden
              </td>
              <td className="num">{fmtSigned(-row.debts)}</td>
              <td className="num muted" />
            </tr>
          )}
          <tr className="total-row">
            <td>Netto vermogen</td>
            <td className="num">{fmtEur(row.net)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 4. Waar komt de groei vandaan: rendement vs sparen/aflossen/overig
export function GrowthChart({ buckets, chart }) {
  const byYear = buckets[0]?.byYear;
  const a = axisProps(chart);
  return (
    <ResponsiveContainer width="100%" height={H + 30}>
      <BarChart data={buckets} stackOffset="sign" margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} dataKey="key" tickFormatter={byYear ? (k) => k : monthShort} />
        <YAxis {...a.y} />
        <ReferenceLine y={0} stroke={chart.axis} />
        <Tooltip
          cursor={{ fill: chart.grid, opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const b = payload[0].payload;
            return (
              <TipBox
                title={byYear ? b.key : monthLong(b.key)}
                rows={[
                  { label: 'Sparen, aflossen & overig', color: chart.series[0], value: fmtSigned(b.other) },
                  { label: 'Rendement beleggingen', color: chart.series[1], value: fmtSigned(b.ret) },
                ]}
                footer={`Totale verandering: ${fmtSigned(b.delta)}`}
              />
            );
          }}
        />
        <Legend content={legendContent([{ label: 'Sparen, aflossen & overig', color: chart.series[0] }, { label: 'Rendement beleggingen', color: chart.series[1] }])} />
        <Bar dataKey="other" name="Sparen, aflossen & overig" stackId="g" fill={chart.series[0]} stroke={chart.surface} strokeWidth={1} radius={2} isAnimationActive={false} />
        <Bar dataKey="ret" name="Rendement beleggingen" stackId="g" fill={chart.series[1]} stroke={chart.surface} strokeWidth={1} radius={2} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// 6. Prognose: historie (doorgetrokken) + verwachting (gestippeld) + doellijn
export function ProjectionChart({ data, goal, chart }) {
  const a = axisProps(chart);
  return (
    <ResponsiveContainer width="100%" height={H + 30}>
      <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} />
        <YAxis {...a.y} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <TipBox
                title={monthLong(r.month)}
                rows={[
                  r.net != null
                    ? { label: 'Netto vermogen', color: chart.line, value: fmtEur(r.net) }
                    : { label: 'Verwacht', color: chart.series[1], value: fmtEur(r.projected) },
                ]}
              />
            );
          }}
        />
        <Legend
          content={legendContent([
            { label: 'Netto vermogen', color: chart.line, line: true },
            { label: 'Prognose', color: chart.series[1], line: true },
            ...(goal ? [{ label: 'Doel', color: chart.series[2], line: true }] : []),
          ])}
        />
        {goal ? <ReferenceLine y={goal} stroke={chart.series[2]} strokeDasharray="4 4" strokeWidth={1.5} /> : null}
        <Line type="monotone" dataKey="net" stroke={chart.line} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="projected" stroke={chart.series[1]} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 7. Verloop van één rekening (met ingelegd bedrag als die rekening "rendement volgen" heeft)
export function AccountChart({ data, chart, debt }) {
  const a = axisProps(chart);
  const tracked = data.some((r) => r.cumDeposit != null);
  const color = debt ? chart.series[4] : chart.series[1];
  return (
    <ResponsiveContainer width="100%" height={H}>
      <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} />
        <YAxis {...a.y} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <TipBox
                title={monthLong(r.month)}
                rows={[
                  { label: debt ? 'Openstaand' : 'Waarde', color, value: fmtEur(r.value) },
                  ...(tracked ? [{ label: 'Ingelegd (totaal)', color: chart.series[0], value: fmtEur(r.cumDeposit) }] : []),
                ]}
                footer={tracked ? `Rendement tot nu: ${fmtSigned(r.value - r.cumDeposit)}` : undefined}
              />
            );
          }}
        />
        {tracked && (
          <Legend content={legendContent([{ label: 'Ingelegd (totaal)', color: chart.series[0], line: true }, { label: 'Waarde', color, line: true }])} />
        )}
        {tracked && <Line type="stepAfter" dataKey="cumDeposit" stroke={chart.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={data.length < 3 ? { r: 3 } : false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 5. Waarde van gevolgde beleggingen vs wat je erin hebt gestopt
export function DepositChart({ rows, chart }) {
  const a = axisProps(chart);
  return (
    <ResponsiveContainer width="100%" height={H + 30}>
      <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...a.grid} />
        <XAxis {...a.x} />
        <YAxis {...a.y} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <TipBox
                title={monthLong(r.month)}
                rows={[
                  { label: 'Waarde', color: chart.series[1], value: fmtEur(r.trackedValue) },
                  { label: 'Ingelegd (totaal)', color: chart.series[0], value: fmtEur(r.cumDeposit) },
                ]}
                footer={`Rendement tot nu: ${fmtSigned(r.cumReturn)}`}
              />
            );
          }}
        />
        <Legend content={legendContent([{ label: 'Ingelegd (totaal)', color: chart.series[0], line: true }, { label: 'Waarde', color: chart.series[1], line: true }])} />
        <Line type="stepAfter" dataKey="cumDeposit" name="Ingelegd (totaal)" stroke={chart.series[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="trackedValue" name="Waarde" stroke={chart.series[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
