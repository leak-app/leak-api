/**
 * zod strictObject error option: names the unknown keys instead of dropping
 * them silently, which would hide a client bug.
 */
export const rejectUnknownKeys = {
  error: (issue: { code?: string; keys?: string[] }) =>
    issue.code === 'unrecognized_keys'
      ? `Trường không hợp lệ: ${issue.keys?.join(', ')}`
      : undefined,
};
