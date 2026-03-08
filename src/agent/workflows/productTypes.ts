import { ModelPolicyName } from '../providers/llm/modelPolicy';

export interface ProductCandidate {
    name: string;
    brand: string | null;
    category: string;
    confidence: number;
    evidence: string;
    searchQuery: string;
    source: 'vision' | 'transcript';
}

export interface VisionProductResult {
    products: ProductCandidate[];
    sceneDescription: string;
    uncertainty: string | null;
    policyUsed: ModelPolicyName;
    escalated: boolean;
}

export interface TranscriptExtractionResult {
    text: string;
    source: 'provided_text' | 'audio_transcription' | 'unavailable';
    confidence: number;
    warnings: string[];
}

export interface ShoppingSearchResult {
    source: 'coupang';
    productName: string;
    productUrl: string;
    deepLink?: string;
    price?: number;
    currency?: string;
    reviewCount: number;
    imageUrl?: string;
    rank: number;
    metadata?: Record<string, unknown>;
}

export interface ProductEvidence {
    sourceType: 'vision' | 'transcript' | 'shopping' | 'legacy';
    summary: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
}

export interface LegacyComparison {
    candidates: string[];
    overlap: string[];
    matched: boolean;
    selectedProduct?: string;
}

export interface ProductExtractionResult {
    status: 'READY_FOR_REVIEW' | 'NEEDS_REVIEW';
    recommendation: 'approve_candidate' | 'review_required';
    confidence: number;
    selectedProduct?: ProductCandidate;
    allCandidates: ProductCandidate[];
    vision: VisionProductResult;
    transcript?: TranscriptExtractionResult;
    transcriptCandidate?: ProductCandidate;
    shoppingResults: ShoppingSearchResult[];
    evidence: ProductEvidence[];
    uncertainty: string | null;
    legacyComparison?: LegacyComparison;
    fallbackReason?: string;
}
