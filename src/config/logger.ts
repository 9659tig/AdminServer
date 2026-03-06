type LogLevel = 'info' | 'warn' | 'error';

export type LogMeta = Record<string, unknown>;

export interface Logger {
    info(meta: LogMeta, message: string): void;
    warn(meta: LogMeta, message: string): void;
    error(meta: LogMeta, message: string): void;
    child(meta: LogMeta): Logger;
}

function serializeError(error: unknown): LogMeta {
    if (error instanceof Error) {
        return {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
        };
    }

    return {
        errorValue: String(error),
    };
}

function writeLog(level: LogLevel, meta: LogMeta, message: string): void {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
        return;
    }

    console.log(line);
}

function mergeMeta(baseMeta: LogMeta, meta: LogMeta): LogMeta {
    const merged: LogMeta = { ...baseMeta };
    Object.entries(meta).forEach(([key, value]) => {
        if (value instanceof Error) {
            Object.assign(merged, serializeError(value));
            return;
        }
        merged[key] = value;
    });
    return merged;
}

export function createLogger(baseMeta: LogMeta = {}): Logger {
    return {
        info(meta: LogMeta, message: string) {
            writeLog('info', mergeMeta(baseMeta, meta), message);
        },
        warn(meta: LogMeta, message: string) {
            writeLog('warn', mergeMeta(baseMeta, meta), message);
        },
        error(meta: LogMeta, message: string) {
            writeLog('error', mergeMeta(baseMeta, meta), message);
        },
        child(meta: LogMeta): Logger {
            return createLogger(mergeMeta(baseMeta, meta));
        },
    };
}

export const logger = createLogger();
