import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DYNAMO_ACCESS_KEY: z.string().min(1),
    DYNAMO_SECRET_KEY: z.string().min(1),
    GOOGLE_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().min(1),
    GROQ_API_KEY: z.string().min(1),
    NAVER_CLIENT_ID: z.string().optional(),
    NAVER_CLIENT_SECRET: z.string().optional(),
    COUPANG_ACCESS_KEY: z.string().optional(),
    COUPANG_SECRET_KEY: z.string().optional(),
    USER_SERVER_URL: z.string().url().optional(),
    INTERNAL_SYNC_TOKEN: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

function formatEnvIssues(issues: z.ZodIssue[]): string {
    const keys = issues.map((issue) => issue.path.join('.')).filter(Boolean);
    return Array.from(new Set(keys)).join(', ');
}

export function getEnv(): AppEnv {
    if (cachedEnv) {
        return cachedEnv;
    }

    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(`[STARTUP ERROR] Missing or invalid env vars: ${formatEnvIssues(parsed.error.issues)}`);
    }

    cachedEnv = parsed.data;
    return cachedEnv;
}

export function validateEnv(): AppEnv {
    return getEnv();
}

export function resetEnvCache(): void {
    cachedEnv = null;
}
