"use client";

import { useMemo, useState } from "react";
import { POOL_CLASS_KEYS, filterPoolRows, poolClassLabel, poolCounts, type PoolRow, type PoolSort } from "@/lib/fighter-pool";

export function FighterPool({
  active,
  inactive,
}: {
  active: PoolRow[];
  inactive: PoolRow[];
}) {
  const [query, setQuery] = useState("");
  const [classKey, setClassKey] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<PoolSort>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const searched = useMemo(
    () =>
      filterPoolRows(active, {
        query,
        classKey: "all",
        availableOnly,
        sort,
        direction,
      }),
    [active, query, availableOnly, sort, direction],
  );
  const counts = useMemo(() => poolCounts(searched), [searched]);
  const visible = useMemo(
    () => searched.filter((row) => classKey === "all" || row.classKey === classKey),
    [searched, classKey],
  );

  function chooseSort(next: PoolSort) {
    if (sort === next) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDirection(next === "name" ? "asc" : "desc");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl tracking-wide">Fighter pool</h2>
        <p className="mt-1 text-sm text-mist">
          {counts.total} active {counts.total === 1 ? "fighter" : "fighters"}. These are the fighters the draft can
          select.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1 space-y-1.5">
          <span className="text-xs uppercase tracking-[0.18em] text-mist">Search</span>
          <input
            className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-paper outline-none ring-blood focus:ring-2"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fighter name"
            type="search"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            checked={availableOnly}
            className="accent-blood"
            onChange={(event) => setAvailableOnly(event.target.checked)}
            type="checkbox"
          />
          Available only
        </label>
        <div className="flex gap-1 pb-1">
          <SortButton active={sort === "name"} direction={direction} label="Name" onClick={() => chooseSort("name")} />
          <SortButton
            active={sort === "lastFight"}
            direction={direction}
            label="Last fight"
            onClick={() => chooseSort("lastFight")}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <ClassChip count={counts.total} label="All" selected={classKey === "all"} onClick={() => setClassKey("all")} />
        {POOL_CLASS_KEYS.map((key) => (
          <ClassChip
            count={counts.byClass[key]}
            key={key}
            label={poolClassLabel(key)}
            selected={classKey === key}
            onClick={() => setClassKey(key)}
          />
        ))}
        {counts.other > 0 ? (
          <ClassChip
            count={counts.other}
            label="Other"
            selected={classKey === "other"}
            onClick={() => setClassKey("other")}
          />
        ) : null}
      </div>

      <PoolTable empty="No fighters match." rows={visible} />

      {inactive.length > 0 ? (
        <details className="rounded-md border border-line bg-panel p-5">
          <summary className="cursor-pointer font-display text-xl tracking-wide">
            Inactive fighters ({inactive.length})
          </summary>
          <p className="mt-2 text-sm text-mist">Removed from the draft. Shown to the commissioner only.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.16em] text-mist">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Class</th>
                  <th>Record</th>
                  <th>Last fight</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((row) => (
                  <tr className="border-t border-line/70" key={row.id}>
                    <td className="py-2">{row.name}</td>
                    <td className="text-mist">{row.classLabel}</td>
                    <td className="text-mist">{row.record ?? "—"}</td>
                    <td className="text-mist">{formatLastFight(row)}</td>
                    <td className="text-mist">{row.removalNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PoolTable({ rows, empty }: { rows: PoolRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-mist">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-panel">
      <table className="w-full min-w-[64rem] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-[0.16em] text-mist">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th>Record</th>
            <th>Weight class</th>
            <th>Last fight</th>
            <th>Upcoming</th>
            <th>Tapology</th>
            <th>Draft</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-line/70" key={row.id}>
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="tabular-nums text-mist">{row.record ?? "—"}</td>
              <td className="text-mist">{row.weightClass}</td>
              <td className="text-mist">{formatLastFight(row)}</td>
              <td className="text-mist">{row.upcoming ?? "—"}</td>
              <td>
                {row.tapologyUrl ? (
                  <a className="text-amber hover:underline" href={row.tapologyUrl} rel="noreferrer" target="_blank">
                    Profile
                  </a>
                ) : (
                  <span className="text-mist">—</span>
                )}
              </td>
              <td>{row.draftedBy ? <span>Drafted · {row.draftedBy}</span> : <span className="text-mist">Available</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-sm px-2.5 py-1 text-xs ${selected ? "bg-blood text-white" : "bg-panel text-mist hover:text-paper"}`}
      onClick={onClick}
      type="button"
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-sm px-3 py-1.5 text-sm ${active ? "bg-raised text-paper" : "text-mist hover:text-paper"}`}
      onClick={onClick}
      type="button"
    >
      {label}
      {active ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function formatLastFight(row: PoolRow): string {
  if (!row.lastFightDate && !row.lastFightClass) return "—";
  return [row.lastFightDate, row.lastFightClass].filter(Boolean).join(" · ");
}
