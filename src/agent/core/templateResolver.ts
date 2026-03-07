export class TemplateResolver {
    private readonly values: Record<string, unknown>;

    constructor(initialValues: Record<string, unknown> = {}) {
        this.values = {
            input: initialValues,
        };
    }

    recordOutput(stepId: string, output: unknown): void {
        this.values[stepId] = {
            output,
        };
    }

    resolve<T>(input: T): T {
        return this.resolveValue(input) as T;
    }

    private resolveValue(value: unknown): unknown {
        if (typeof value === 'string') {
            return this.resolveString(value);
        }

        if (Array.isArray(value)) {
            return value.map((entry) => this.resolveValue(entry));
        }

        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, this.resolveValue(entry)]));
        }

        return value;
    }

    private resolveString(value: string): unknown {
        const fullMatch = value.match(/^\{\{(.+)\}\}$/);
        if (fullMatch) {
            return this.getValueByPath(fullMatch[1].trim());
        }

        return value.replace(/\{\{(.+?)\}\}/g, (_, path) => {
            const resolved = this.getValueByPath(String(path).trim());
            return resolved === undefined ? '' : String(resolved);
        });
    }

    private getValueByPath(path: string): unknown {
        const parts = path.split('.');
        let current: unknown = this.values;

        for (const part of parts) {
            if (!current || typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[part];
        }

        return current;
    }
}
