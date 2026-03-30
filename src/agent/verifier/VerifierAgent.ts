import { logger } from '../../config/logger';
import { SourceScoreStore, sourceScoreStore } from '../evaluation/sourceScoreStore';
import { CandidateResult, ProductExtractionResult, VerifierDecision } from '../workflows/productTypes';

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

        logger.info({
            event: 'verifier_check_start',
            inputConfidence: result.confidence,
            evidenceCount: result.evidence.length,
            shoppingCount: result.shoppingResults.length,
            hasSelectedProduct: Boolean(result.selectedProduct),
            sourceScoreSnapshot,
        }, `   🔎 [Verifier] 검증 조건 평가 시작 — input confidence: ${result.confidence}`);

        if (!result.selectedProduct) {
            reasons.push('selected_product_missing');
            adjustedConfidence = 0;
            logger.warn({
                event: 'verifier_penalty',
                rule: 'selected_product_missing',
                penalty: 'confidence → 0',
            }, `   ⛔ [Verifier] 선택된 상품 없음 → confidence를 0으로 설정`);
        }

        if (result.evidence.length < 2) {
            reasons.push('insufficient_evidence_sources');
            adjustedConfidence -= 0.2;
            logger.warn({
                event: 'verifier_penalty',
                rule: 'insufficient_evidence_sources',
                penalty: -0.2,
                evidenceCount: result.evidence.length,
            }, `   📉 [Verifier] evidence 소스 부족 (${result.evidence.length}개 < 2개) → -0.20`);
        }

        if (result.shoppingResults.length === 0) {
            reasons.push('shopping_confirmation_missing');
            adjustedConfidence -= 0.15;
            logger.warn({
                event: 'verifier_penalty',
                rule: 'shopping_confirmation_missing',
                penalty: -0.15,
            }, `   📉 [Verifier] 쇼핑 검색 결과 없음 → -0.15`);
        }

        if (result.legacyComparison && !result.legacyComparison.matched) {
            reasons.push('legacy_comparison_mismatch');
            adjustedConfidence -= 0.1;
            logger.warn({
                event: 'verifier_penalty',
                rule: 'legacy_comparison_mismatch',
                penalty: -0.1,
            }, `   📉 [Verifier] legacy 후보 불일치 → -0.10`);
        }

        if (sourceScoreSnapshot.length) {
            const averageSourceScore = sourceScoreSnapshot.reduce((sum, source) => sum + source.averageScore, 0) / sourceScoreSnapshot.length;
            if (averageSourceScore < 0.45) {
                reasons.push('low_source_score_confidence');
                adjustedConfidence -= 0.15;
                logger.warn({
                    event: 'verifier_penalty',
                    rule: 'low_source_score_confidence',
                    penalty: -0.15,
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   📉 [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) < 0.45 → -0.15`);
            } else if (averageSourceScore > 0.8) {
                adjustedConfidence += 0.05;
                logger.info({
                    event: 'verifier_bonus',
                    rule: 'high_source_score',
                    bonus: 0.05,
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   📈 [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) > 0.80 → +0.05`);
            } else {
                logger.info({
                    event: 'verifier_sourcescore_neutral',
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   ➖ [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) — 조정 없음`);
            }
        }

        adjustedConfidence = Number(Math.max(0, Math.min(1, adjustedConfidence)).toFixed(2));

        const status = adjustedConfidence >= this.approvalThreshold && result.shoppingResults.length > 0
            ? 'READY_FOR_REVIEW'
            : 'NEEDS_REVIEW';

        logger.info({
            event: 'verifier_decision',
            inputConfidence: result.confidence,
            adjustedConfidence,
            approvalThreshold: this.approvalThreshold,
            status,
            reasons,
        }, `   🏷️ [Verifier] 최종 판정 — ${result.confidence} → ${adjustedConfidence} | 임계값: ${this.approvalThreshold} | 결과: ${status}${reasons.length ? ` | 감점 사유: ${reasons.join(', ')}` : ' | 감점 없음'}`);

        return {
            status,
            recommendation: status === 'READY_FOR_REVIEW' ? 'approve_candidate' : 'review_required',
            adjustedConfidence,
            reasons,
            sourceScoreSnapshot,
        };
    }

    async verifySingle(candidateResult: CandidateResult): Promise<VerifierDecision> {
        let adjustedConfidence = candidateResult.confidence;
        const reasons: string[] = [];
        const sourceScores = await (this.deps.sourceScoreStore ?? sourceScoreStore).list();
        const sourceScoreSnapshot = candidateResult.evidence
            .map((evidence) => {
                const match = sourceScores.find((score) => score.sourceType === evidence.sourceType);
                return {
                    sourceType: evidence.sourceType,
                    averageScore: match?.averageScore ?? 0.5,
                };
            });

        const candidateName = candidateResult.candidate?.name ?? '(unknown)';

        logger.info({
            event: 'verifier_check_start',
            candidateName,
            inputConfidence: candidateResult.confidence,
            evidenceCount: candidateResult.evidence.length,
            shoppingCount: candidateResult.shoppingResults.length,
            hasSelectedProduct: Boolean(candidateResult.candidate),
            sourceScoreSnapshot,
        }, `   🔎 [Verifier] 검증 조건 평가 시작 — candidate: ${candidateName} | input confidence: ${candidateResult.confidence}`);

        if (!candidateResult.candidate) {
            reasons.push('selected_product_missing');
            adjustedConfidence = 0;
            logger.warn({
                event: 'verifier_penalty',
                candidateName,
                rule: 'selected_product_missing',
                penalty: 'confidence → 0',
            }, `   ⛔ [Verifier] 선택된 상품 없음 → confidence를 0으로 설정`);
        }

        if (candidateResult.evidence.length < 2) {
            reasons.push('insufficient_evidence_sources');
            adjustedConfidence -= 0.2;
            logger.warn({
                event: 'verifier_penalty',
                candidateName,
                rule: 'insufficient_evidence_sources',
                penalty: -0.2,
                evidenceCount: candidateResult.evidence.length,
            }, `   📉 [Verifier] evidence 소스 부족 (${candidateResult.evidence.length}개 < 2개) → -0.20`);
        }

        if (candidateResult.shoppingResults.length === 0) {
            reasons.push('shopping_confirmation_missing');
            adjustedConfidence -= 0.15;
            logger.warn({
                event: 'verifier_penalty',
                candidateName,
                rule: 'shopping_confirmation_missing',
                penalty: -0.15,
            }, `   📉 [Verifier] 쇼핑 검색 결과 없음 → -0.15`);
        }

        // SourceScore 조정 (기존 verify와 동일 로직)
        if (sourceScoreSnapshot.length) {
            const averageSourceScore = sourceScoreSnapshot.reduce((sum, s) => sum + s.averageScore, 0) / sourceScoreSnapshot.length;
            if (averageSourceScore < 0.45) {
                reasons.push('low_source_score_confidence');
                adjustedConfidence -= 0.15;
                logger.warn({
                    event: 'verifier_penalty',
                    candidateName,
                    rule: 'low_source_score_confidence',
                    penalty: -0.15,
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   📉 [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) < 0.45 → -0.15`);
            } else if (averageSourceScore > 0.8) {
                adjustedConfidence += 0.05;
                logger.info({
                    event: 'verifier_bonus',
                    candidateName,
                    rule: 'high_source_score',
                    bonus: 0.05,
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   📈 [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) > 0.80 → +0.05`);
            } else {
                logger.info({
                    event: 'verifier_sourcescore_neutral',
                    candidateName,
                    averageSourceScore: Number(averageSourceScore.toFixed(2)),
                }, `   ➖ [Verifier] SourceScore 평균(${averageSourceScore.toFixed(2)}) — 조정 없음`);
            }
        }

        adjustedConfidence = Number(Math.max(0, Math.min(1, adjustedConfidence)).toFixed(2));

        const status = adjustedConfidence >= this.approvalThreshold && candidateResult.shoppingResults.length > 0
            ? 'READY_FOR_REVIEW'
            : 'NEEDS_REVIEW';

        logger.info({
            event: 'verifier_decision',
            candidateName,
            inputConfidence: candidateResult.confidence,
            adjustedConfidence,
            approvalThreshold: this.approvalThreshold,
            status,
            reasons,
        }, `   🏷️ [Verifier] 최종 판정 — candidate: ${candidateName} | ${candidateResult.confidence} → ${adjustedConfidence} | 임계값: ${this.approvalThreshold} | 결과: ${status}${reasons.length ? ` | 감점 사유: ${reasons.join(', ')}` : ' | 감점 없음'}`);

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
