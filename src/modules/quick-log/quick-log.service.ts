import { Injectable, Logger } from '@nestjs/common';
import { CategoryService } from '@/modules/categories/categories.service';
import { TransactionService } from '@/modules/transactions/transactions.service';
import { WalletService } from '@/modules/wallets/wallets.service';
import { ParseQuickLogDto } from './dto/quick-log.dto';
import { findAmounts } from './amount.parser';
import { mergeGemini } from './gemini.merge';
import { GeminiParser } from './gemini.parser';
import { learnKeywords } from './learned-keywords';
import { parseQuickLog, type QuickLogDraft } from './quick-log.parser';
import { fold } from './text';

@Injectable()
export class QuickLogService {
  private readonly logger = new Logger(QuickLogService.name);

  constructor(
    private readonly _categories: CategoryService,
    private readonly _wallets: WalletService,
    private readonly _transactions: TransactionService,
    private readonly _gemini: GeminiParser,
  ) {}

  async parse(userId: string, dto: ParseQuickLogDto): Promise<QuickLogDraft> {
    const [categories, wallets, history] = await Promise.all([
      this._categories.findAll(userId),
      this._wallets.findOptions(userId),
      this._transactions.findRecentDescriptions(userId),
    ]);
    const context = {
      categories: categories.map(({ id, name, type }) => ({ id, name, type })),
      wallets,
      learned: learnKeywords(history),
    };
    const draft = parseQuickLog(dto.text, context);

    // Layer 2 runs only for what layer 1 could not settle, and only the phrase
    // and the category names leave the server.
    const amountCount = findAmounts(fold(dto.text.normalize('NFC'))).length;
    if (!draft.unresolved.includes('category') && amountCount > 0) return draft;

    try {
      const gemini = await this._gemini.parse(
        userId,
        dto.text,
        context.categories.map(({ id, name }) => ({ id, name })),
      );
      return gemini
        ? mergeGemini(draft, gemini, context.categories, amountCount)
        : draft;
    } catch (error) {
      this.logger.warn(
        `Gemini fallback failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return draft;
    }
  }
}
