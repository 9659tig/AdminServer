import type { Logger } from '../config/logger';

declare global {
    namespace Express {
        interface Request {
            requestId: string;
            log: Logger;
            validated: {
                body?: unknown;
                query?: unknown;
                params?: unknown;
            };
        }
    }
}

export {};
