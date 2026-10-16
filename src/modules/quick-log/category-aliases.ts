/**
 * Folded keywords people type, grouped by a folded hint that is looked up as a
 * substring of the user's own folded category names ("an uong" -> "Ăn uống").
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  'an uong': [
    'pho',
    'bun',
    'com',
    'banh mi',
    'ca phe',
    'cafe',
    'tra sua',
    'an sang',
    'an trua',
    'an toi',
    'nhau',
  ],
  'di chuyen': ['grab', 'be', 'xanh sm', 'taxi', 'xang', 'gui xe'],
  'mua sam': ['shopee', 'lazada', 'tiki', 'quan ao'],
  'hoa don': ['dien', 'nuoc', 'internet', 'wifi', 'tien nha'],
  'giai tri': ['phim', 'netflix', 'spotify', 'game'],
  'suc khoe': ['thuoc', 'kham benh'],
  luong: ['luong'],
  thuong: ['thuong'],
};

/** Folded cues that make a phrase income rather than an expense. */
export const INCOME_CUES = [
  'luong',
  'thuong',
  'nhan',
  'lai',
  'hoan tien',
  'thu nhap',
];

/** Folded words that introduce a wallet name ("ví tiền mặt", "thẻ techcombank"). */
export const WALLET_CUES = ['vi', 'the', 'tk', 'tai khoan'];
