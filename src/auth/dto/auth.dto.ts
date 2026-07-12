import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(
      6,
      'Password must be at least 6 characters long and contain at least one lowercase letter and one uppercase letter',
    )
    .refine((val) => /[a-z]/.test(val) && /[A-Z]/.test(val), {
      message:
        'Password must be at least 6 characters long and contain at least one lowercase letter and one uppercase letter',
    }),
  name: z.string().optional(),
});

export class SignUpDto implements z.infer<typeof signUpSchema> {
  email!: string;
  password!: string;
  name?: string;
}

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export class SignInDto implements z.infer<typeof signInSchema> {
  email!: string;
  password!: string;
}

export const googleSignInSchema = z.object({
  credentialToken: z.string().min(1, 'Credential token is required'),
  name: z.string().optional(),
});

export class GoogleSignInDto implements z.infer<typeof googleSignInSchema> {
  credentialToken!: string;
  name?: string;
}

