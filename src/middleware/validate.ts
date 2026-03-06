import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

function validate(target: ValidationTarget, schema: ZodTypeAny) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const parsed = schema.safeParse(req[target]);

        if (!parsed.success) {
            const message = parsed.error.issues[0]?.message ?? '잘못된 요청입니다.';
            req.log.warn({
                event: 'request_validation_failed',
                target,
                issues: parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            }, 'request_validation_failed');
            res.status(400).json({
                error: '입력 형식 에러',
                message,
            });
            return;
        }

        req.validated[target] = parsed.data;
        next();
    };
}

export function validateBody(schema: ZodTypeAny) {
    return validate('body', schema);
}

export function validateQuery(schema: ZodTypeAny) {
    return validate('query', schema);
}

export function validateParams(schema: ZodTypeAny) {
    return validate('params', schema);
}
