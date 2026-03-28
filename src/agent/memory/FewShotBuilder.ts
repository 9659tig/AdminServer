import { logger } from '../../config/logger';
import { GoldSetStore, goldSetStore } from '../evaluation/goldSetStore';
import { GoldSetExample } from '../evaluation/types';

interface FewShotBuilderDeps {
    goldSetStore?: GoldSetStore;
}

function normalizeCategory(value?: string): string {
    return (value ?? 'unknown').trim().toLowerCase();
}

export class FewShotBuilder {
    constructor(private readonly deps: FewShotBuilderDeps = {}) {}

    async buildForCategory(category?: string, limit = 3): Promise<string> {
        const examples = await (this.deps.goldSetStore ?? goldSetStore).list();
        const selected = this.pickExamples(examples, category, limit);

        if (!selected.length) {
            logger.info({
                event: 'fewshot_empty',
                category: category ?? 'unknown',
                totalExamples: examples.length,
            }, `   📖 [FewShot] GoldSet 예시 없음 — 카테고리: ${category ?? 'unknown'} | 전체 GoldSet: ${examples.length}개`);
            return '';
        }

        const categoryMatched = selected.filter(
            (e) => (e.category ?? 'unknown').trim().toLowerCase() === (category ?? 'unknown').trim().toLowerCase(),
        ).length;

        logger.info({
            event: 'fewshot_built',
            category: category ?? 'unknown',
            selectedCount: selected.length,
            categoryMatchedCount: categoryMatched,
            fallbackCount: selected.length - categoryMatched,
            totalExamples: examples.length,
            selectedProducts: selected.map((e) => e.expectedProduct),
        }, `   📖 [FewShot] ${selected.length}개 예시 주입 — 카테고리 매칭: ${categoryMatched}개, 폴백: ${selected.length - categoryMatched}개 | 예시: ${selected.map((e) => e.expectedProduct).join(', ')}`);

        return selected.map((example, index) => [
            `Example ${index + 1}:`,
            `Category: ${example.category ?? 'unknown'}`,
            `Expected Product: ${example.expectedProduct}`,
            `Candidates: ${example.candidateNames.join(', ') || 'none'}`,
            `Evidence Sources: ${example.evidenceSources.join(', ') || 'none'}`,
        ].join('\n')).join('\n\n');
    }

    private pickExamples(examples: GoldSetExample[], category?: string, limit = 3): GoldSetExample[] {
        const normalized = normalizeCategory(category);
        const categoryMatched = examples.filter((example) => normalizeCategory(example.category) === normalized);

        const fallback = categoryMatched.length >= limit ? categoryMatched : [
            ...categoryMatched,
            ...examples.filter((example) => normalizeCategory(example.category) !== normalized),
        ];

        return fallback
            .slice()
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, limit);
    }
}

export const fewShotBuilder = new FewShotBuilder();
