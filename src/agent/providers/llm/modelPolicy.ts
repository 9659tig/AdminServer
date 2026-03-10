import '../../../config/env';

export type ModelPolicyName = 'mini-default' | '4o-escalation' | 'transcribe-default';

export type ModelPolicyMode = 'chat' | 'transcription';
export type ModelPolicyProvider = 'openai' | 'gemini' | 'groq';

export interface ModelPolicy {
    name: ModelPolicyName;
    provider: ModelPolicyProvider;
    mode: ModelPolicyMode;
    model: string;
    temperature: number;
    maxOutputTokens?: number;
}

type ModelPolicyPatch = Partial<Omit<ModelPolicy, 'name'>>;

const defaultPolicies: Record<ModelPolicyName, ModelPolicy> = {
    'mini-default': {
        name: 'mini-default',
        provider: 'gemini',
        mode: 'chat',
        model: process.env.GEMINI_MODEL_DEFAULT?.trim() || 'gemini-2.5-flash',
        temperature: 0.1,
        maxOutputTokens: 4096,
    },
    '4o-escalation': {
        name: '4o-escalation',
        provider: 'gemini',
        mode: 'chat',
        model: process.env.GEMINI_MODEL_ESCALATION?.trim() || 'gemini-2.5-flash',
        temperature: 0.1,
        maxOutputTokens: 4096,
    },
    'transcribe-default': {
        name: 'transcribe-default',
        provider: 'groq',
        mode: 'transcription',
        model: process.env.GROQ_MODEL_TRANSCRIBE?.trim() || 'whisper-large-v3',
        temperature: 0,
    },
};

class StaticModelPolicyRegistry {
    constructor(private readonly policies: Record<ModelPolicyName, ModelPolicy>) {}

    resolve(name: ModelPolicyName): ModelPolicy {
        const policy = this.policies[name];
        if (!policy) {
            throw new Error(`Unknown model policy: ${name}`);
        }
        return { ...policy };
    }

    list(): ModelPolicy[] {
        return Object.values(this.policies).map((policy) => ({ ...policy }));
    }
}

export function createModelPolicyRegistry(overrides: Partial<Record<ModelPolicyName, ModelPolicyPatch>> = {}) {
    const policies = Object.entries(defaultPolicies).reduce((acc, [name, policy]) => {
        const policyName = name as ModelPolicyName;
        acc[policyName] = {
            ...policy,
            ...(overrides[policyName] ?? {}),
            name: policyName,
        };
        return acc;
    }, {} as Record<ModelPolicyName, ModelPolicy>);

    return new StaticModelPolicyRegistry(policies);
}

export const modelPolicyRegistry = createModelPolicyRegistry();

export function resolveModelPolicy(name: ModelPolicyName): ModelPolicy {
    return modelPolicyRegistry.resolve(name);
}
