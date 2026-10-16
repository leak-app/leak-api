import { Injectable } from '@nestjs/common';
import { CategoryService } from '@/modules/categories/categories.service';
import { TransactionService } from '@/modules/transactions/transactions.service';
import { WalletService } from '@/modules/wallets/wallets.service';
import { ParseQuickLogDto } from './dto/quick-log.dto';
import { learnKeywords } from './learned-keywords';
import { parseQuickLog, type QuickLogDraft } from './quick-log.parser';

@Injectable()
export class QuickLogService {
  constructor(
    private readonly _categories: CategoryService,
    private readonly _wallets: WalletService,
    private readonly _transactions: TransactionService,
  ) {}

  async parse(userId: string, dto: ParseQuickLogDto): Promise<QuickLogDraft> {
    const [categories, wallets, history] = await Promise.all([
      this._categories.findAll(userId),
      this._wallets.findOptions(userId),
      this._transactions.findRecentDescriptions(userId),
    ]);
    return parseQuickLog(dto.text, {
      categories: categories.map(({ id, name, type }) => ({ id, name, type })),
      wallets,
      learned: learnKeywords(history),
    });
  }
}
