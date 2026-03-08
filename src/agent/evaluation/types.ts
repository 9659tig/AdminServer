import { AgentTaskDetails, AgentTaskInput, ReviewPayload } from '../core/types';
import { ProductEvidence, ProductExtractionResult } from '../workflows/productTypes';

export interface TaskEvidenceView {
    taskId: string;
    evidence: ProductEvidence[];
    extraction?: ProductExtractionResult;
    selectedProductName?: string;
    confidence?: number;
}

export interface GoldSetExample {
    exampleId: string;
    taskId?: string;
    evaluationId?: string;
    reviewAction: ReviewPayload['action'];
    expectedProduct: string;
    category?: string;
    taskInput: AgentTaskInput;
    candidateNames: string[];
    evidenceSources: ProductEvidence['sourceType'][];
    confidence?: number;
    legacyMatched?: boolean;
    createdAt: string;
}

export interface SourceScoreSnapshot {
    sourceType: ProductEvidence['sourceType'];
    scoreSum: number;
    totalCount: number;
    averageScore: number;
    updatedAt: string;
}

export interface DualRunIterationResult {
    runId: string;
    iteration: number;
    status: 'SUCCESS' | 'FAILED';
    latencyMs: number;
    selectedProductName?: string;
    topCandidates: string[];
    confidence: number;
    evidenceSources: ProductEvidence['sourceType'][];
    legacyMatched: boolean;
    top1MatchedGold?: boolean;
    top3MatchedGold?: boolean;
    error?: string;
    result?: ProductExtractionResult;
}

export interface DualRunMetrics {
    iterations: number;
    taskSuccessRate: number;
    failureRate: number;
    top1MatchRate?: number;
    top3MatchRate?: number;
    evidenceCoverageScore: number;
    consistencyScore: number;
    confidenceCalibration?: number;
    avgLatencyMs: number;
    avgConfidence: number;
}

export interface DualRunRecord {
    evaluationId: string;
    evaluationName?: string;
    createdAt: string;
    input: AgentTaskInput;
    goldLabel?: string;
    iterations: DualRunIterationResult[];
    metrics: DualRunMetrics;
}

export interface DualRunRequest {
    input: AgentTaskInput;
    goldLabel?: string;
    evaluationName?: string;
    iterations?: number;
}

export interface EvaluationSummary {
    totalEvaluations: number;
    avgTaskSuccessRate: number;
    avgFailureRate: number;
    avgTop1MatchRate?: number;
    avgTop3MatchRate?: number;
    avgConsistencyScore: number;
    avgEvidenceCoverageScore: number;
    avgLatencyMs: number;
    goldSetSize: number;
    sourceScores: SourceScoreSnapshot[];
}

export interface ReviewLearningRecord {
    details: AgentTaskDetails;
    payload: ReviewPayload;
}
