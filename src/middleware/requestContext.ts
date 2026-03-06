import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '../config/logger';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incomingRequestId = req.header('x-request-id');
    const requestId = incomingRequestId && incomingRequestId.trim() ? incomingRequestId : randomUUID();
    const startedAt = Date.now();

    req.requestId = requestId;
    req.log = createLogger({
        requestId,
        method: req.method,
        path: req.path,
    });
    req.validated = {};

    res.setHeader('x-request-id', requestId);

    req.log.info({
        event: 'request_started',
    }, 'request_started');

    res.on('finish', () => {
        req.log.info({
            event: 'request_completed',
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
        }, 'request_completed');
    });

    next();
}
