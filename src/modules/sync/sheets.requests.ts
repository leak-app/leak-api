import type { sheets_v4 } from 'googleapis';
import { chunkRows } from './sheets.errors';
import {
  SYNC_TIME_ZONE,
  TAB_HEADERS,
  TAB_KEYS,
  TAB_NAMES,
  type SheetRow,
  type SnapshotTabs,
  type TabKey,
} from './sync.schema';

export const TRANSACTIONS_INITIAL_ROWS = 20_000;
export const OTHER_TABS_INITIAL_ROWS = 2_000;
export const WRITE_CHUNK_ROWS = 5_000;
export const SPREADSHEET_TITLE = 'Leak – Dữ liệu';

export interface TabInfo {
  sheetId: number;
  title: string;
  rowCount: number;
}

export interface ValueRange {
  range: string;
  values: SheetRow[];
}

export interface WritePlan {
  /** One batchUpdate: add missing tabs, grow tabs that are too small. May be empty. */
  structureRequests: sheets_v4.Schema$Request[];
  /** Rows 2+ of all five tabs. */
  clearRanges: string[];
  /** Each inner array is one values.batchUpdate call of at most WRITE_CHUNK_ROWS rows. */
  valueBatches: ValueRange[][];
  /** Written last: it doubles as the commit marker of a run. */
  meta: ValueRange;
}

const initialRows = (key: TabKey) =>
  key === 'transactions' ? TRANSACTIONS_INITIAL_ROWS : OTHER_TABS_INITIAL_ROWS;

const a1 = (key: TabKey, cell: string) => `'${TAB_NAMES[key]}'!${cell}`;

const gridProperties = (key: TabKey, rowCount: number) => ({
  rowCount,
  columnCount: TAB_HEADERS[key].length,
  frozenRowCount: 1,
});

export function buildCreateSpreadsheetBody(): sheets_v4.Schema$Spreadsheet {
  return {
    properties: {
      title: SPREADSHEET_TITLE,
      locale: 'vi_VN',
      timeZone: SYNC_TIME_ZONE,
    },
    sheets: TAB_KEYS.map((key) => ({
      properties: {
        title: TAB_NAMES[key],
        gridProperties: gridProperties(key, initialRows(key)),
      },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [
            {
              values: TAB_HEADERS[key].map((header) => ({
                userEnteredValue: { stringValue: header },
                userEnteredFormat: { textFormat: { bold: true } },
              })),
            },
          ],
        },
      ],
    })),
  };
}

export function groupByRowBudget(
  ranges: readonly ValueRange[],
  budget: number,
): ValueRange[][] {
  const batches: ValueRange[][] = [];
  let current: ValueRange[] = [];
  let used = 0;
  for (const range of ranges) {
    if (current.length > 0 && used + range.values.length > budget) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(range);
    used += range.values.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function buildWritePlan(
  snapshot: SnapshotTabs,
  tabs: readonly TabInfo[],
): WritePlan {
  const structureRequests: sheets_v4.Schema$Request[] = [];
  const ranges: ValueRange[] = [];

  for (const key of TAB_KEYS) {
    const title = TAB_NAMES[key];
    const tabRows = snapshot[key];
    const needed = tabRows.length + 1; // header row + data rows
    const existing = tabs.find((tab) => tab.title === title);

    if (!existing) {
      structureRequests.push({
        addSheet: {
          properties: {
            title,
            gridProperties: gridProperties(
              key,
              Math.max(initialRows(key), needed),
            ),
          },
        },
      });
      ranges.push({ range: a1(key, 'A1'), values: [[...TAB_HEADERS[key]]] });
    } else if (existing.rowCount < needed) {
      structureRequests.push({
        appendDimension: {
          sheetId: existing.sheetId,
          dimension: 'ROWS',
          length: needed - existing.rowCount,
        },
      });
    }

    if (key === 'meta') continue; // written last, outside the batches
    chunkRows(tabRows, WRITE_CHUNK_ROWS).forEach((chunk, index) => {
      ranges.push({
        range: a1(key, `A${2 + index * WRITE_CHUNK_ROWS}`),
        values: chunk,
      });
    });
  }

  return {
    structureRequests,
    clearRanges: TAB_KEYS.map((key) => a1(key, 'A2:Z')),
    valueBatches: groupByRowBudget(ranges, WRITE_CHUNK_ROWS),
    meta: { range: a1('meta', 'A2'), values: snapshot.meta },
  };
}
