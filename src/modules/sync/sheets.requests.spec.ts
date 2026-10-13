import {
  buildCreateSpreadsheetBody,
  buildWritePlan,
  groupByRowBudget,
  WRITE_CHUNK_ROWS,
  type TabInfo,
  type ValueRange,
} from './sheets.requests';
import {
  TAB_HEADERS,
  TAB_KEYS,
  TAB_NAMES,
  type SheetRow,
  type SnapshotTabs,
} from './sync.schema';

const rows = (count: number, prefix = 'r'): SheetRow[] =>
  Array.from({ length: count }, (_, index) => [`${prefix}${index}`]);

function snapshot(overrides: Partial<SnapshotTabs> = {}): SnapshotTabs {
  return {
    transactions: [],
    accounts: [],
    budgets: [],
    goals: [],
    meta: [['tx_count', 0]],
    ...overrides,
  };
}

function allTabs(rowCount = 20_000): TabInfo[] {
  return TAB_KEYS.map((key, index) => ({
    sheetId: index + 1,
    title: TAB_NAMES[key],
    rowCount,
  }));
}

describe('buildCreateSpreadsheetBody', () => {
  it('creates the five tabs in order with a frozen, bold header row', () => {
    const body = buildCreateSpreadsheetBody();
    expect(body.properties).toMatchObject({
      locale: 'vi_VN',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(body.sheets?.map((sheet) => sheet.properties?.title)).toEqual(
      TAB_KEYS.map((key) => TAB_NAMES[key]),
    );

    const transactions = body.sheets[0];
    expect(transactions.properties?.gridProperties).toMatchObject({
      rowCount: 20_000,
      columnCount: 11,
      frozenRowCount: 1,
    });
    const header = transactions.data[0].rowData[0].values;
    expect(header.map((cell) => cell.userEnteredValue?.stringValue)).toEqual([
      ...TAB_HEADERS.transactions,
    ]);
    expect(header[0].userEnteredFormat?.textFormat?.bold).toBe(true);
    expect(body.sheets[1].properties?.gridProperties?.rowCount).toBe(2_000);
  });
});

describe('buildWritePlan', () => {
  it('for a user with no rows: clears everything, sends no empty value range, still writes _meta', () => {
    const plan = buildWritePlan(snapshot(), allTabs());

    expect(plan.structureRequests).toEqual([]);
    expect(plan.valueBatches).toEqual([]);
    expect(plan.clearRanges).toEqual(
      TAB_KEYS.map((key) => `'${TAB_NAMES[key]}'!A2:Z`),
    );
    expect(plan.meta).toEqual({
      range: "'_meta'!A2",
      values: [['tx_count', 0]],
    });
  });

  it('writes rows below the header row', () => {
    const plan = buildWritePlan(snapshot({ accounts: rows(2) }), allTabs());
    expect(plan.valueBatches).toEqual([
      [{ range: "'_accounts'!A2", values: rows(2) }],
    ]);
  });

  it('splits a 12,000-row snapshot into contiguous chunks of at most 5,000 rows per request', () => {
    const plan = buildWritePlan(
      snapshot({ transactions: rows(12_000) }),
      allTabs(),
    );

    const ranges = plan.valueBatches.flat();
    expect(ranges.map((range) => range.range)).toEqual([
      "'_transactions'!A2",
      "'_transactions'!A5002",
      "'_transactions'!A10002",
    ]);
    expect(ranges.reduce((sum, range) => sum + range.values.length, 0)).toBe(
      12_000,
    );
    for (const batch of plan.valueBatches) {
      const size = batch.reduce((sum, range) => sum + range.values.length, 0);
      expect(size).toBeLessThanOrEqual(WRITE_CHUNK_ROWS);
    }
    expect(plan.structureRequests).toEqual([]);
  });

  it('grows a tab that is smaller than the data (header row included)', () => {
    const tabs = allTabs();
    tabs[0].rowCount = 100;
    const plan = buildWritePlan(snapshot({ transactions: rows(150) }), tabs);

    expect(plan.structureRequests).toEqual([
      { appendDimension: { sheetId: 1, dimension: 'ROWS', length: 51 } },
    ]);
  });

  it('adds a data tab the user deleted or renamed, with its header row', () => {
    const tabs = allTabs().filter((tab) => tab.title !== '_goals');
    const plan = buildWritePlan(snapshot({ goals: rows(1) }), tabs);

    expect(plan.structureRequests).toHaveLength(1);
    expect(plan.structureRequests[0].addSheet?.properties?.title).toBe(
      '_goals',
    );
    expect(
      plan.structureRequests[0].addSheet?.properties?.gridProperties,
    ).toMatchObject({
      rowCount: 2_000,
      columnCount: TAB_HEADERS.goals.length,
      frozenRowCount: 1,
    });

    const ranges = plan.valueBatches.flat();
    expect(ranges[0]).toEqual({
      range: "'_goals'!A1",
      values: [[...TAB_HEADERS.goals]],
    });
    expect(ranges[1]).toEqual({ range: "'_goals'!A2", values: rows(1) });
  });

  it('adds the _meta tab back when it is missing', () => {
    const tabs = allTabs().filter((tab) => tab.title !== '_meta');
    const plan = buildWritePlan(snapshot(), tabs);

    expect(plan.structureRequests[0].addSheet?.properties?.title).toBe('_meta');
    expect(plan.valueBatches.flat()).toContainEqual({
      range: "'_meta'!A1",
      values: [[...TAB_HEADERS.meta]],
    });
  });
});

describe('groupByRowBudget', () => {
  const range = (name: string, count: number): ValueRange => ({
    range: name,
    values: rows(count),
  });

  it('packs ranges into batches without exceeding the row budget', () => {
    const batches = groupByRowBudget(
      [range('a', 3000), range('b', 3000), range('c', 2000)],
      5000,
    );
    expect(batches.map((batch) => batch.map((item) => item.range))).toEqual([
      ['a'],
      ['b', 'c'],
    ]);
  });

  it('returns no batches for no ranges', () => {
    expect(groupByRowBudget([], 5000)).toEqual([]);
  });
});
