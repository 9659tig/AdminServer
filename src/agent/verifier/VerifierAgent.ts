import { SourceScoreStore, sourceScoreStore } from '../evaluation/sourceScoreStore';
import { ProductExtractionResult, VerifierDecision } from '../workflows/productTypes';

interface VerifierAgentDeps {
    sourceScoreStore?: SourceScoreStore;
    approvalThreshold?: number;
}

export class VerifierAgent {
    private readonly approvalThreshold: number;

    constructor(private readonly deps: VerifierAgentDeps = {}) {
        this.approvalThreshold = deps.approvalThreshold ?? 0.78;
    }

    async verify(result: ProductExtractionResult): Promise<VerifierDecision> {
        let adjustedConfidence = result.confidence;
        const reasons: string[] = [];
        const sourceScores = await (this.deps.sourceScoreStore ?? sourceScoreStore).list();
        const sourceScoreSnapshot = result.evidence
            .map((evidence) => {
                const match = sourceScores.find((score) => score.sourceType === evidence.sourceType);
                return {
                    sourceType: evidence.sourceType,
                    averageScore: match?.averageScore ?? 0.5,
                };
            });

        if (!result.selectedProduct) {
            reasons.push('selected_product_missing');
            adjustedConfidence = 0;
        }

        if (result.evidence.length < 2) {
            reasons.push('insufficient_evidence_sources');
            adjustedConfidence -= 0.2;
        }

        if (result.shoppingResults.length === 0) {
            reasons.push('shopping_confirmation_missing');
            adjustedConfidence -= 0.15;
        }

        if (result.legacyComparison && !result.legacyComparison.matched) {
            reasons.push('legacy_comparison_mismatch');
            adjustedConfidence -= 0.1;
        }

        if (sourceScoreSnapshot.length) {
            const averageSourceScore = sourceScoreSnapshot.reduce((sum, source) => sum + source.averageScore, 0) / sourceScoreSnapshot.length;
            if (averageSourceScore < 0.45) {
                reasons.push('low_source_score_confidence');
                adjustedConfidence -= 0.15;
            } else if (averageSourceScore > 0.8) {
                adjustedConfidence += 0.05;
            }
        }

        adjustedConfidence = Number(Math.max(0, Math.min(1, adjustedConfidence)).toFixed(2));

        const status = adjustedConfidence >= this.approvalThreshold && result.shoppingResults.length > 0
            ? 'READY_FOR_REVIEW'
            : 'NEEDS_REVIEW';

        return {
            status,
            recommendation: status === 'READY_FOR_REVIEW' ? 'approve_candidate' : 'review_required',
            adjustedConfidence,
            reasons,
            sourceScoreSnapshot,
        };
    }
}

export const verifierAgent = new VerifierAgent();
