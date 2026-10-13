import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleApiError, withRetry } from './sheets.errors';
import {
  buildCreateSpreadsheetBody,
  buildWritePlan,
  type TabInfo,
} from './sheets.requests';
import { SyncConfig } from './sync.config';
import type { SnapshotTabs } from './sync.schema';

/** Thin wrapper over googleapis. Every call retries transient failures and throws classified errors. */
@Injectable()
export class SheetsClientService {
  constructor(private readonly _config: SyncConfig) {}

  async createSpreadsheet(refreshToken: string): Promise<string> {
    const sheets = this._sheets(refreshToken);
    const response = await withRetry(() =>
      sheets.spreadsheets.create({ requestBody: buildCreateSpreadsheetBody() }),
    );
    const spreadsheetId = response.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new GoogleApiError('Google did not return a spreadsheet id');
    }
    return spreadsheetId;
  }

  async getTabs(
    refreshToken: string,
    spreadsheetId: string,
  ): Promise<TabInfo[]> {
    const sheets = this._sheets(refreshToken);
    const response = await withRetry(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,title,gridProperties.rowCount)',
      }),
    );
    return (response.data.sheets ?? []).map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? '',
      rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
    }));
  }

  /** Replaces the data area of every tab: structure, clear, write in chunks, `_meta` last. */
  async writeSnapshot(
    refreshToken: string,
    spreadsheetId: string,
    snapshot: SnapshotTabs,
    tabs: readonly TabInfo[],
  ): Promise<void> {
    const sheets = this._sheets(refreshToken);
    const plan = buildWritePlan(snapshot, tabs);

    if (plan.structureRequests.length > 0) {
      await withRetry(() =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: plan.structureRequests },
        }),
      );
    }

    await withRetry(() =>
      sheets.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: { ranges: plan.clearRanges },
      }),
    );

    for (const batch of plan.valueBatches) {
      await withRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'USER_ENTERED', data: batch },
        }),
      );
    }

    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: plan.meta.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: plan.meta.values },
      }),
    );
  }

  private _sheets(refreshToken: string) {
    const auth = new google.auth.OAuth2(
      this._config.clientId,
      this._config.clientSecret,
    );
    auth.setCredentials({ refresh_token: refreshToken });
    return google.sheets({ version: 'v4', auth });
  }
}
