import { z } from 'zod';
import { logger } from '../../config/logger';
import { AgentTool } from '../tools/types';
import { VisionProductTool } from '../tools/VisionProductTool';
import { TranscriptExtractTool } from '../tools/TranscriptExtractTool';
import { ShoppingSearchTool } from '../tools/ShoppingSearchTool';
import { GeminiProvider, geminiProvider } from '../providers/llm/GeminiProvider';
import { VerifierAgent, verifierAgent } from '../verifier/VerifierAgent';
import { FewShotBuilder, fewShotBuilder } from '../memory/FewShotBuilder';
import {
    CandidateResult,
    LegacyComparison,
    ProductCandidate,
    ProductEvidence,
    ProductExtractionResult,
    ShoppingSearchResult,
    TranscriptExtractionResult,
    VisionProductResult,
} from './productTypes';

const transcriptCandidateSchema = z.object({
    name: z.string().trim().min(1),
    brand: z.string().trim().min(1).nullable(),
    category: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    evidence: z.string().trim().min(1),
    searchQuery: z.string().trim().min(1),
    uncertainty: z.string().trim().nullable().default(null),
});

interface WorkflowContext {
    taskType?: string;
    sourceType?: string;
    channelCategory?: string;
    videoUrl?: string;
    clipContext?: Record<string, unknown>;
    legacyCandidates?: string[];
}

interface ProductExtractionWorkflowDeps {
    visionTool?: VisionProductTool;
    transcriptTool?: TranscriptExtractTool;
    shoppingTool?: ShoppingSearchTool;
    provider?: Pick<GeminiProvider, 'generateObject'>;
    verifier?: Pick<VerifierAgent, 'verify' | 'verifySingle'>;
    fewShotBuilder?: Pick<FewShotBuilder, 'buildForCategory'>;
    reviewThreshold?: number;
}

function normalizeContext(input: Record<string, unknown>): WorkflowContext {
    return {
        taskType: typeof input.taskType === 'string' ? input.taskType : undefined,
        sourceType: typeof input.sourceType === 'string' ? input.sourceType : undefined,
        channelCategory: typeof input.channelCategory === 'string' ? input.channelCategory : undefined,
        videoUrl: typeof input.videoUrl === 'string' ? input.videoUrl : undefined,
        clipContext: input.clipContext && typeof input.clipContext === 'object'
            ? input.clipContext as Record<string, unknown>
            : undefined,
        legacyCandidates: Array.isArray(input.legacyCandidates)
            ? input.legacyCandidates.filter((item): item is string => typeof item === 'string')
            : [],
    };
}

function mergeCandidates(candidates: Array<ProductCandidate | undefined>): ProductCandidate[] {
    const byKey = new Map<string, ProductCandidate>();

    candidates
        .filter((candidate): candidate is ProductCandidate => Boolean(candidate))
        .forEach((candidate) => {
            const key = candidate.name.trim().toLowerCase();
            const current = byKey.get(key);
            if (!current || current.confidence < candidate.confidence) {
                byKey.set(key, candidate);
            }
        });

    return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

function normalizeForComparison(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

function buildLegacyComparison(legacyCandidates: string[], selectedProduct?: ProductCandidate): LegacyComparison | undefined {
    if (!legacyCandidates.length) {
        return undefined;
    }

    const selectedName = selectedProduct?.name ?? '';
    const normalizedSelected = normalizeForComparison(selectedName);
    const overlap = legacyCandidates.filter((candidate) => {
        const normalizedCandidate = normalizeForComparison(candidate);
        return normalizedCandidate && (
            normalizedSelected.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedSelected)
        );
    });

    return {
        candidates: legacyCandidates,
        overlap,
        matched: overlap.length > 0,
        selectedProduct: selectedName || undefined,
    };
}

function buildEvidenceForCandidate(
    candidate: ProductCandidate,
    vision: VisionProductResult,
    transcript: TranscriptExtractionResult | undefined,
    transcriptCandidate: ProductCandidate | undefined,
    shoppingResults: ShoppingSearchResult[],
    legacyComparison?: LegacyComparison,
): ProductEvidence[] {
    const evidence: ProductEvidence[] = [
        {
            sourceType: 'vision',
            summary: vision.sceneDescription || 'Vision analysis completed.',
            confidence: candidate.confidence,
            metadata: {
                policyUsed: vision.policyUsed,
                escalated: vision.escalated,
                uncertainty: vision.uncertainty,
                productCount: vision.products.length,
            },
        },
    ];

    if (transcript) {
        evidence.push({
            sourceType: 'transcript',
            summary: transcript.text
                ? `Transcript extracted via ${transcript.source}.`
                : `Transcript unavailable: ${transcript.warnings.join('; ') || 'no source'}`,
            confidence: transcriptCandidate?.confidence ?? transcript.confidence,
            metadata: {
                source: transcript.source,
                warnings: transcript.warnings,
                transcriptCandidate,
            },
        });
    }

    if (shoppingResults.length) {
        evidence.push({
            sourceType: 'shopping',
            summary: `${shoppingResults.length} shopping candidates found.`,
            metadata: {
                topResult: shoppingResults[0],
            },
        });
    }

    if (legacyComparison) {
        evidence.push({
            sourceType: 'legacy',
            summary: legacyComparison.matched
                ? 'Legacy candidates overlap with the selected product.'
                : 'No overlap found with legacy candidates.',
            metadata: legacyComparison as unknown as Record<string, unknown>,
        });
    }

    return evidence;
}

function calculateConfidence(
    selectedProduct: ProductCandidate | undefined,
    shoppingResults: ShoppingSearchResult[],
    transcriptCandidate?: ProductCandidate,
): number {
    if (!selectedProduct) {
        return 0;
    }

    let confidence = selectedProduct.confidence;

    if (selectedProduct.source === 'transcript') {
        confidence += 0.05;
    }

    if (transcriptCandidate && selectedProduct.source === 'vision') {
        confidence += Math.min(transcriptCandidate.confidence, 0.15);
    }

    if (shoppingResults.length > 0) {
        confidence += 0.1;
    }

    return Number(Math.min(1, confidence).toFixed(2));
}

export class ProductExtractionWorkflow implements AgentTool {
    private readonly reviewThreshold: number;

    constructor(private readonly deps: ProductExtractionWorkflowDeps = {}) {
        this.reviewThreshold = deps.reviewThreshold ?? 0.7;
    }

    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            extraction: await this.execute(input),
        };
    }

    async execute(input: Record<string, unknown>): Promise<ProductExtractionResult> {
        const context = normalizeContext(input.context && typeof input.context === 'object'
            ? input.context as Record<string, unknown>
            : input);

        const clipContext = context.clipContext ?? {};
        const imageUrls = Array.isArray(clipContext.imageUrls)
            ? clipContext.imageUrls.filter((item): item is string => typeof item === 'string')
            : [];

        logger.info({
            event: 'workflow_vision_start',
            imageCount: imageUrls.length,
            category: context.channelCategory,
        }, `🔍 [Vision] Gemini Vision 분석 시작 — 이미지 ${imageUrls.length}장 | 카테고리: ${context.channelCategory ?? 'none'}`);

        const visionStart = Date.now();
        const vision = await (this.deps.visionTool ?? new VisionProductTool()).identify({
            imageUrls,
            channelCategory: context.channelCategory,
            channelName: typeof clipContext.channelName === 'string' ? clipContext.channelName : undefined,
            videoTitle: typeof clipContext.videoTitle === 'string' ? clipContext.videoTitle : undefined,
            videoUrl: context.videoUrl,
            candidateHints: context.legacyCandidates,
        });

        logger.info({
            event: 'workflow_vision_done',
            elapsedMs: Date.now() - visionStart,
            productCount: vision.products.length,
            topConfidence: vision.products[0]?.confidence ?? 0,
            topProduct: vision.products[0]?.name ?? 'none',
            policyUsed: vision.policyUsed,
            escalated: vision.escalated,
            sceneDescription: vision.sceneDescription,
        }, `👁️ [Vision] 완료 (${Date.now() - visionStart}ms) — 상품 ${vision.products.length}개 발견 | 최고 confidence: ${vision.products[0]?.confidence ?? 0} | 정책: ${vision.policyUsed}${vision.escalated ? ' (에스컬레이션됨)' : ''}`);

        if (vision.products.length) {
            vision.products.forEach((p, i) => {
                logger.info({
                    event: 'workflow_vision_candidate',
                    rank: i + 1,
                    name: p.name,
                    brand: p.brand,
                    confidence: p.confidence,
                    searchQuery: p.searchQuery,
                }, `   📦 [Vision 후보 ${i + 1}] ${p.name} (${p.brand ?? '브랜드 미상'}) — confidence: ${p.confidence}`);
            });
        }

        // Transcript 보완 판단: 최고 confidence 기준
        const topCandidate = vision.products.reduce(
            (best, c) => (!best || c.confidence > best.confidence ? c : best),
            null as ProductCandidate | null
        );
        let transcript: TranscriptExtractionResult | undefined;
        let transcriptCandidate: ProductCandidate | undefined;
        let fallbackReason = vision.products.length ? undefined : 'vision_no_product_found';

        if (!topCandidate || topCandidate.confidence < this.reviewThreshold) {
            const reason = !topCandidate
                ? 'Vision에서 상품을 찾지 못함'
                : `Vision confidence(${topCandidate.confidence})가 임계값(${this.reviewThreshold}) 미만`;

            logger.info({
                event: 'workflow_transcript_trigger',
                reason,
                visionConfidence: topCandidate?.confidence ?? 0,
                threshold: this.reviewThreshold,
            }, `🎙️ [Transcript] 자막 추출 시작 — 사유: ${reason}`);

            const transcriptStart = Date.now();
            transcript = await (this.deps.transcriptTool ?? new TranscriptExtractTool()).extract({
                ...context,
                clipContext,
            });

            logger.info({
                event: 'workflow_transcript_done',
                elapsedMs: Date.now() - transcriptStart,
                source: transcript.source,
                confidence: transcript.confidence,
                hasText: Boolean(transcript.text),
                textLength: transcript.text?.length ?? 0,
                warnings: transcript.warnings,
            }, `🎙️ [Transcript] 완료 (${Date.now() - transcriptStart}ms) — 소스: ${transcript.source} | confidence: ${transcript.confidence} | 텍스트 길이: ${transcript.text?.length ?? 0}자`);

            if (transcript.text) {
                transcriptCandidate = await this.extractProductFromTranscript(transcript.text, context, topCandidate ?? undefined);

                logger.info({
                    event: 'workflow_transcript_candidate',
                    name: transcriptCandidate.name,
                    confidence: transcriptCandidate.confidence,
                    visionConfidence: topCandidate?.confidence ?? 0,
                    promoted: !topCandidate || transcriptCandidate.confidence >= (topCandidate?.confidence ?? 0),
                }, `   📦 [Transcript 후보] ${transcriptCandidate.name} — confidence: ${transcriptCandidate.confidence}${!topCandidate || transcriptCandidate.confidence >= (topCandidate?.confidence ?? 0) ? ' ⬆️ 승격됨' : ''}`);

                if (!topCandidate || transcriptCandidate.confidence >= topCandidate.confidence) {
                    fallbackReason = 'transcript_promoted_candidate';
                }
            } else if (!topCandidate) {
                fallbackReason = transcript.warnings[0] ?? 'transcript_unavailable';
                logger.warn({
                    event: 'workflow_transcript_unavailable',
                    warnings: transcript.warnings,
                }, `⚠️ [Transcript] 전사 실패 — ${transcript.warnings.join('; ') || '소스 없음'}`);
            }
        } else {
            logger.info({
                event: 'workflow_transcript_skip',
                selectedProduct: topCandidate!.name,
                confidence: topCandidate!.confidence,
                threshold: this.reviewThreshold,
            }, `⏭️ [Transcript] 생략 — Vision confidence(${topCandidate!.confidence}) ≥ 임계값(${this.reviewThreshold})`);
        }

        // 후보 확정
        const allCandidates = mergeCandidates([
            ...vision.products,
            transcriptCandidate,
        ]);

        // 후보별 병렬 쇼핑 검색 (confidence >= 0.5인 후보만)
        const eligibleCandidates = allCandidates.filter(c => c.confidence >= 0.5);

        if (eligibleCandidates.length === 0) {
            logger.warn({
                event: 'workflow_shopping_skip',
                reason: 'no_eligible_candidates',
            }, `⏭️ [Shopping] 생략 — 검색할 상품이 없음`);
        }

        const shoppingStart = Date.now();
        const candidateResults: CandidateResult[] = await Promise.all(
            eligibleCandidates.map(async (candidate) => {
                const candidateShoppingStart = Date.now();
                let candidateShoppingResults: ShoppingSearchResult[] = [];
                const searchQuery = candidate.searchQuery || candidate.name;

                logger.info({
                    event: 'workflow_shopping_start',
                    query: searchQuery,
                }, `🛒 [Shopping] 쇼핑 검색 시작 — 검색어: "${searchQuery}"`);

                try {
                    candidateShoppingResults = await (this.deps.shoppingTool ?? new ShoppingSearchTool()).search(
                        searchQuery,
                        5,
                    );

                    logger.info({
                        event: 'workflow_shopping_done',
                        elapsedMs: Date.now() - candidateShoppingStart,
                        query: searchQuery,
                        resultCount: candidateShoppingResults.length,
                        source: candidateShoppingResults[0]?.source ?? 'none',
                        topResult: candidateShoppingResults[0]?.productName,
                        topPrice: candidateShoppingResults[0]?.price,
                    }, `🛒 [Shopping] 완료 — "${searchQuery}" ${candidateShoppingResults.length}개 결과 | 소스: ${candidateShoppingResults[0]?.source ?? 'none'}${candidateShoppingResults[0] ? ` | 1위: ${candidateShoppingResults[0].productName}` : ''}`);
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    logger.error({
                        event: 'workflow_shopping_failed',
                        query: searchQuery,
                        error: errMsg,
                    }, `❌ [Shopping] 검색 실패 — "${searchQuery}": ${errMsg}`);
                }

                const legacyCompForCandidate = buildLegacyComparison(context.legacyCandidates ?? [], candidate);
                const candidateEvidence = buildEvidenceForCandidate(
                    candidate,
                    vision,
                    transcript,
                    transcriptCandidate,
                    candidateShoppingResults,
                    legacyCompForCandidate,
                );
                const candidateConfidence = calculateConfidence(candidate, candidateShoppingResults, transcriptCandidate);

                const cr: CandidateResult = {
                    candidate,
                    shoppingResults: candidateShoppingResults,
                    evidence: candidateEvidence,
                    confidence: candidateConfidence,
                };

                // 후보별 검증
                const verifierInstance = this.deps.verifier ?? verifierAgent;
                const verifierDecision = await verifierInstance.verifySingle(cr);
                cr.verifier = verifierDecision;
                cr.confidence = verifierDecision.adjustedConfidence;

                return cr;
            })
        );

        // 하위 호환 필드: candidateResults[0]에서 복사
        const topResult = candidateResults[0];
        const selectedProduct = topResult?.candidate;
        const shoppingResults = topResult?.shoppingResults ?? [];
        const legacyComparison = buildLegacyComparison(context.legacyCandidates ?? [], selectedProduct);
        const evidence = topResult?.evidence ?? [];
        const confidence = topResult?.confidence ?? 0;

        logger.info({
            event: 'workflow_confidence_calculated',
            baseConfidence: selectedProduct?.confidence ?? 0,
            finalConfidence: confidence,
            selectedProduct: selectedProduct?.name,
            selectedSource: selectedProduct?.source,
            hasTranscript: Boolean(transcriptCandidate),
            hasShoppingResults: shoppingResults.length > 0,
            candidateCount: allCandidates.length,
            eligibleCount: eligibleCandidates.length,
            evidenceCount: evidence.length,
        }, `📐 [Confidence] 산출 — base: ${selectedProduct?.confidence ?? 0} → final: ${confidence} | 상품: ${selectedProduct?.name ?? 'none'} (${selectedProduct?.source ?? 'none'}) | evidence ${evidence.length}개`);

        if (legacyComparison) {
            logger.info({
                event: 'workflow_legacy_comparison',
                matched: legacyComparison.matched,
                overlapCount: legacyComparison.overlap.length,
                legacyCandidateCount: legacyComparison.candidates.length,
            }, `🔄 [Legacy] 비교 결과 — ${legacyComparison.matched ? '✅ 일치' : '❌ 불일치'} | legacy 후보 ${legacyComparison.candidates.length}개 중 ${legacyComparison.overlap.length}개 겹침`);
        }

        const preVerifiedResult: ProductExtractionResult = {
            status: selectedProduct && shoppingResults.length > 0 && confidence >= this.reviewThreshold
                ? 'READY_FOR_REVIEW'
                : 'NEEDS_REVIEW',
            recommendation: selectedProduct && shoppingResults.length > 0 && confidence >= this.reviewThreshold
                ? 'approve_candidate'
                : 'review_required',
            confidence,
            selectedProduct,
            allCandidates,
            candidateResults,
            vision,
            transcript,
            transcriptCandidate,
            shoppingResults,
            evidence,
            uncertainty: vision.uncertainty ?? null,
            legacyComparison,
            fallbackReason,
        };

        // verifier.verify()가 있는 경우에만 전체 결과 검증 실행 (하위 호환)
        const verifierInstance = this.deps.verifier ?? verifierAgent;
        if (typeof verifierInstance.verify === 'function') {
            logger.info({
                event: 'workflow_verifier_start',
                preVerifiedConfidence: confidence,
            }, `🔎 [Verifier] 검증 시작 — pre-verified confidence: ${confidence}`);

            const verification = await verifierInstance.verify(preVerifiedResult);

            logger.info({
                event: 'workflow_verifier_done',
                preConfidence: confidence,
                adjustedConfidence: verification.adjustedConfidence,
                delta: Number((verification.adjustedConfidence - confidence).toFixed(2)),
                status: verification.status,
                recommendation: verification.recommendation,
                reasons: verification.reasons,
                sourceScoreSnapshot: verification.sourceScoreSnapshot,
            }, `🔎 [Verifier] 완료 — confidence: ${confidence} → ${verification.adjustedConfidence} (${verification.adjustedConfidence >= confidence ? '+' : ''}${(verification.adjustedConfidence - confidence).toFixed(2)}) | 상태: ${verification.status}${verification.reasons.length ? ` | 사유: ${verification.reasons.join(', ')}` : ''}`);

            return {
                ...preVerifiedResult,
                status: verification.status,
                recommendation: verification.recommendation,
                confidence: verification.adjustedConfidence,
                verifier: verification,
            };
        }

        return preVerifiedResult;
    }

    private async extractProductFromTranscript(
        transcriptText: string,
        context: WorkflowContext,
        visionCandidate?: ProductCandidate,
    ): Promise<ProductCandidate> {
        const fewShotPrompt = await (this.deps.fewShotBuilder ?? fewShotBuilder).buildForCategory(context.channelCategory);
        const response = await (this.deps.provider ?? geminiProvider).generateObject({
            policy: 'mini-default',
            schema: transcriptCandidateSchema,
            temperature: 0.1,
            maxOutputTokens: 2048,
            systemPrompt: [
                'Return a single JSON object with exactly this structure:',
                '{"name": "string", "brand": "string or null", "category": "string", "confidence": 0.0-1.0, "evidence": "string", "searchQuery": "string", "uncertainty": "string or null"}',
                'Never return a bare array. Use conservative confidence and do not invent unsupported attributes.',
            ].join('\n'),
            userPrompt: [
                `Transcript: ${transcriptText}`,
                `Category: ${context.channelCategory ?? 'unknown'}`,
                `Current vision candidate: ${visionCandidate ? visionCandidate.name : 'none'}`,
                fewShotPrompt ? `Approved examples:\n${fewShotPrompt}` : '',
                'Use conservative confidence and do not invent price or unsupported attributes.',
            ].join('\n'),
        });

        return {
            name: response.object.name,
            brand: response.object.brand,
            category: response.object.category,
            confidence: response.object.confidence,
            evidence: response.object.evidence,
            searchQuery: response.object.searchQuery,
            source: 'transcript',
        };
    }
}
