import '../../../config/env';

export type ModelPolicyName = 'mini-default' | '4o-escalation' | 'transcribe-default';

export type ModelPolicyMode = 'chat' | 'transcription';

export interface ModelPolicy {
    name: ModelPolicyName;
    provider: 'openai';
    mode: ModelPolicyMode;
    model: string;
    temperature: number;
    maxOutputTokens?: number;
}

type ModelPolicyPatch = Partial<Omit<ModelPolicy, 'name'>>;

const defaultPolicies: Record<ModelPolicyName, ModelPolicy> = {
    'mini-default': {
        name: 'mini-default',
        provider: 'openai',
        mode: 'chat',
        model: process.env.OPENAI_MODEL_MINI_DEFAULT?.trim() || 'gpt-4o-mini',
        temperature: 0.2,
        maxOutputTokens: 400,
    },
    '4o-escalation': {
        name: '4o-escalation',
        provider: 'openai',
        mode: 'chat',
        model: process.env.OPENAI_MODEL_4O_ESCALATION?.trim() || 'gpt-4o',
        temperature: 0.2,
        maxOutputTokens: 600,
    },
    'transcribe-default': {
        name: 'transcribe-default',
        provider: 'openai',
        mode: 'transcription',
        model: process.env.OPENAI_MODEL_TRANSCRIBE_DEFAULT?.trim() || 'gpt-4o-mini-transcribe',
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
