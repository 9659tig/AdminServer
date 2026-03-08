import { z } from 'zod';
import { AgentTool } from '../tools/types';
import { VisionProductTool } from '../tools/VisionProductTool';
import { TranscriptExtractTool } from '../tools/TranscriptExtractTool';
import { ShoppingSearchTool } from '../tools/ShoppingSearchTool';
import { OpenAIProvider, openAIProvider } from '../providers/llm/OpenAIProvider';
import {
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
    provider?: Pick<OpenAIProvider, 'generateObject'>;
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

function pickBestCandidate(candidates: ProductCandidate[]): ProductCandidate | undefined {
    return [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
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

function buildEvidence(
    vision: VisionProductResult,
    transcript: TranscriptExtractionResult | undefined,
    transcriptCandidate: ProductCandidate | undefined,
    shoppingResults: ShoppingSearchResult[],
    legacyComparison: LegacyComparison | undefined,
): ProductEvidence[] {
    const evidence: ProductEvidence[] = [
        {
            sourceType: 'vision',
            summary: vision.sceneDescription || 'Vision analysis completed.',
            confidence: vision.products[0]?.confidence,
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

        const vision = await (this.deps.visionTool ?? new VisionProductTool()).identify({
            imageUrls,
            channelCategory: context.channelCategory,
            channelName: typeof clipContext.channelName === 'string' ? clipContext.channelName : undefined,
            videoTitle: typeof clipContext.videoTitle === 'string' ? clipContext.videoTitle : undefined,
            videoUrl: context.videoUrl,
            candidateHints: context.legacyCandidates,
        });

        let selectedProduct = pickBestCandidate(vision.products);
        let transcript: TranscriptExtractionResult | undefined;
        let transcriptCandidate: ProductCandidate | undefined;
        let fallbackReason = vision.products.length ? undefined : 'vision_no_product_found';

        if (!selectedProduct || selectedProduct.confidence < this.reviewThreshold) {
            transcript = await (this.deps.transcriptTool ?? new TranscriptExtractTool()).extract({
                ...context,
                clipContext,
            });

            if (transcript.text) {
                transcriptCandidate = await this.extractProductFromTranscript(transcript.text, context, selectedProduct);

                if (!selectedProduct || transcriptCandidate.confidence >= selectedProduct.confidence) {
                    selectedProduct = transcriptCandidate;
                    fallbackReason = 'transcript_promoted_candidate';
                }
            } else if (!selectedProduct) {
                fallbackReason = transcript.warnings[0] ?? 'transcript_unavailable';
            }
        }

        let shoppingResults: ShoppingSearchResult[] = [];
        if (selectedProduct?.searchQuery || selectedProduct?.name) {
            try {
                shoppingResults = await (this.deps.shoppingTool ?? new ShoppingSearchTool()).search(
                    selectedProduct.searchQuery || selectedProduct.name,
                    5,
                );
            } catch (err) {
                fallbackReason = err instanceof Error ? err.message : String(err);
            }
        }

        const allCandidates = mergeCandidates([
            ...vision.products,
            transcriptCandidate,
        ]);
        const legacyComparison = buildLegacyComparison(context.legacyCandidates ?? [], selectedProduct);
        const evidence = buildEvidence(vision, transcript, transcriptCandidate, shoppingResults, legacyComparison);
        const confidence = calculateConfidence(selectedProduct, shoppingResults, transcriptCandidate);
        const status = selectedProduct && shoppingResults.length > 0 && confidence >= this.reviewThreshold
            ? 'READY_FOR_REVIEW'
            : 'NEEDS_REVIEW';

        return {
            status,
            recommendation: status === 'READY_FOR_REVIEW' ? 'approve_candidate' : 'review_required',
            confidence,
            selectedProduct,
            allCandidates,
            vision,
            transcript,
            transcriptCandidate,
            shoppingResults,
            evidence,
            uncertainty: vision.uncertainty ?? null,
            legacyComparison,
            fallbackReason,
        };
    }

    private async extractProductFromTranscript(
        transcriptText: string,
        context: WorkflowContext,
        visionCandidate?: ProductCandidate,
    ): Promise<ProductCandidate> {
        const response = await (this.deps.provider ?? openAIProvider).generateObject({
            policy: 'mini-default',
            schema: transcriptCandidateSchema,
            temperature: 0.1,
            maxOutputTokens: 300,
            systemPrompt: 'Return JSON only. Extract the single most likely product mentioned in the transcript.',
            userPrompt: [
                `Transcript: ${transcriptText}`,
                `Category: ${context.channelCategory ?? 'unknown'}`,
                `Current vision candidate: ${visionCandidate ? visionCandidate.name : 'none'}`,
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
