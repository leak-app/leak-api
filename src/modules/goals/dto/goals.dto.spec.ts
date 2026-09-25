import {
  createGoalSchema,
  goalContributionsQuerySchema,
  goalMovementSchema,
  updateGoalSchema,
} from './goals.dto';

const messages = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message);

describe('goal DTO schemas', () => {
  it('rejects savedAmount on create and update', () => {
    expect(
      messages(
        createGoalSchema.safeParse({
          name: 'Nhật',
          targetAmount: 1,
          savedAmount: 5,
        }),
      ),
    ).toEqual(['Trường không hợp lệ: savedAmount']);
    expect(messages(updateGoalSchema.safeParse({ savedAmount: 5 }))).toEqual([
      'Trường không hợp lệ: savedAmount',
    ]);
  });

  it('requires a name and a positive target', () => {
    expect(
      messages(createGoalSchema.safeParse({ name: '  ', targetAmount: 0 })),
    ).toEqual([
      'Tên mục tiêu là bắt buộc',
      'Số tiền mục tiêu phải là số dương',
    ]);
  });

  it('accepts an ISO date and lets update clear it with null', () => {
    expect(
      createGoalSchema.safeParse({
        name: 'Nhật',
        targetAmount: 1,
        targetDate: '2027-03-01',
      }).success,
    ).toBe(true);
    expect(
      createGoalSchema.safeParse({
        name: 'Nhật',
        targetAmount: 1,
        targetDate: '03/2027',
      }).success,
    ).toBe(false);
    expect(updateGoalSchema.safeParse({ targetDate: null }).data).toEqual({
      targetDate: null,
    });
  });

  it('movement needs a positive amount', () => {
    expect(messages(goalMovementSchema.safeParse({ amount: -1 }))).toEqual([
      'Số tiền phải là số dương',
    ]);
    expect(
      goalMovementSchema.safeParse({ amount: 1, accountId: 'w', note: 'x' })
        .success,
    ).toBe(true);
  });

  it('contributions query has defaults and caps the page size', () => {
    expect(goalContributionsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
    });
    expect(
      goalContributionsQuerySchema.safeParse({ limit: '500' }).success,
    ).toBe(false);
  });
});
