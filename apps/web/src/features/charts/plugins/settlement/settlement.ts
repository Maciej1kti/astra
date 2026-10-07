import type { ChartSummaryRow } from "../../chart-model.ts";

/** The person a counter belongs to: the last word of a name of several words. */
export function settlementPerson(name: string): string | null {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words.at(-1)! : null;
}

export interface SettlementParty {
  name: string;
  value: number;
}
export interface SettlementDebt {
  from: string;
  to: string;
  amount: number;
}
export interface Settlement {
  /** People named by the selected counters. */
  people: number;
  /** People with a rated counter, highest value first. */
  parties: SettlementParty[];
  /** Whoever earned less pays the difference, largest debt first. */
  debts: SettlementDebt[];
  /** Counters of a named person that have no rate and so count for nothing. */
  unrated: number;
}

/**
 * A person's value is the sum, over their rated counters, of the whole-history
 * total times the rate. The plotted range does not limit a debt.
 */
export function settle(rows: ChartSummaryRow[]): Settlement {
  const names = new Set<string>();
  const values = new Map<string, number>();
  let unrated = 0;
  for (const row of rows) {
    const person = settlementPerson(row.source.name);
    if (!person) continue;
    names.add(person);
    if (row.rate === null) {
      unrated++;
      continue;
    }
    values.set(
      person,
      (values.get(person) ?? 0) +
        (row.source.history?.total ?? row.stats.total) * row.rate,
    );
  }
  const parties = [...values]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "pl"));
  const debts: SettlementDebt[] = [];
  for (const [position, to] of parties.entries())
    for (const from of parties.slice(position + 1)) {
      const amount = Math.round((to.value - from.value) * 100) / 100;
      if (amount > 0) debts.push({ from: from.name, to: to.name, amount });
    }
  debts.sort((a, b) => b.amount - a.amount);
  return { people: names.size, parties, debts, unrated };
}

export function money(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
