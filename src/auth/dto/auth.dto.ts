import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
  password: z
    .string()
    .min(
      6,
      'Mật khẩu phải dài ít nhất 6 ký tự, chứa ít nhất một chữ thường và một chữ hoa',
    )
    .refine((val) => /[a-z]/.test(val) && /[A-Z]/.test(val), {
      message:
        'Mật khẩu phải dài ít nhất 6 ký tự, chứa ít nhất một chữ thường và một chữ hoa',
    }),
  name: z.string().optional(),
});

export class SignUpDto implements z.infer<typeof signUpSchema> {
  email!: string;
  password!: string;
  name?: string;
}

export const signInSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
  password: z.string().min(1, 'Mật khẩu là bắt buộc'),
});

export class SignInDto implements z.infer<typeof signInSchema> {
  email!: string;
  password!: string;
}

export const googleSignInSchema = z.object({
  credentialToken: z.string().min(1, 'Mã xác thực với google không hợp lệ'),
  name: z.string().optional(),
});

export class GoogleSignInDto implements z.infer<typeof googleSignInSchema> {
  credentialToken!: string;
  name?: string;
}

export const forgotPasswordSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
});

export class ForgotPasswordDto implements z.infer<typeof forgotPasswordSchema> {
  email!: string;
}

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Mã xác thực không hợp lệ'),
  password: z
    .string()
    .min(
      6,
      'Mật khẩu phải dài ít nhất 6 ký tự, chứa ít nhất một chữ thường và một chữ hoa',
    )
    .refine((val) => /[a-z]/.test(val) && /[A-Z]/.test(val), {
      message:
        'Mật khẩu phải dài ít nhất 6 ký tự, chứa ít nhất một chữ thường và một chữ hoa',
    }),
});

export class ResetPasswordDto implements z.infer<typeof resetPasswordSchema> {
  token!: string;
  password!: string;
}

