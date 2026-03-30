import { randomUUID } from 'crypto';
import { AgentTaskDetails, ReviewPayload } from '../core/types';
import { ProductEvidence, ProductExtractionResult } from '../workflows/productTypes';
import { GoldSetExample, ReviewLearningRecord, TaskEvidenceView } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

export function extractProductExtraction(details: AgentTaskDetails): ProductExtractionResult | undefined {
    const taskResult = details.task.result;
    if (isRecord(taskResult)) {
        const reviewPayload = taskResult.reviewPayload;
        if (isRecord(reviewPayload) && isRecord(reviewPayload.extraction)) {
            return reviewPayload.extraction as unknown as ProductExtractionResult;
        }

        if (isRecord(taskResult.extraction)) {
            return taskResult.extraction as unknown as ProductExtractionResult;
        }
    }

    const extractStep = details.steps.find((step) => step.stepId === 'extract-product');
    if (extractStep && isRecord(extractStep.output) && isRecord(extractStep.output.extraction)) {
        return extractStep.output.extraction as unknown as ProductExtractionResult;
    }

    return undefined;
}

export function buildTaskEvidenceView(details: AgentTaskDetails): TaskEvidenceView {
    const extraction = extractProductExtraction(details);

    return {
        taskId: details.task.taskId,
        evidence: extraction?.evidence ?? [],
        extraction,
        selectedProductName: extraction?.selectedProduct?.name,
        confidence: extraction?.confidence,
        candidateResults: extraction?.candidateResults,
    };
}

function getLearningScore(action: ReviewPayload['action']): number {
    if (action === 'approve') {
        return 1;
    }

    if (action === 'edit') {
        return 0.5;
    }

    return 0;
}

export function getLearningScoreForReview(action: ReviewPayload['action']): number {
    return getLearningScore(action);
}

export function buildGoldSetExample(record: ReviewLearningRecord): GoldSetExample | undefined {
    const extraction = extractProductExtraction(record.details);
    if (!extraction) {
        return undefined;
    }

    const editedFields = record.payload.editedFields ?? {};
    const expectedProduct = typeof editedFields.productName === 'string' && editedFields.productName.trim()
        ? editedFields.productName.trim()
        : extraction.selectedProduct?.name;

    if (!expectedProduct || record.payload.action === 'reject') {
        return undefined;
    }

    const category = typeof editedFields.category === 'string' && editedFields.category.trim()
        ? editedFields.category.trim()
        : extraction.selectedProduct?.category;

    return {
        exampleId: randomUUID(),
        taskId: record.details.task.taskId,
        reviewAction: record.payload.action,
        expectedProduct,
        category,
        taskInput: record.details.task.input,
        candidateNames: extraction.allCandidates.map((candidate) => candidate.name),
        evidenceSources: extraction.evidence.map((evidence) => evidence.sourceType),
        confidence: extraction.confidence,
        legacyMatched: extraction.legacyComparison?.matched,
        createdAt: new Date().toISOString(),
    };
}

export function getEvidenceSources(details: AgentTaskDetails): ProductEvidence['sourceType'][] {
    const extraction = extractProductExtraction(details);
    return extraction?.evidence.map((evidence) => evidence.sourceType) ?? [];
}

export function buildGoldSetExamplesFromCandidates(
    record: ReviewLearningRecord,
): GoldSetExample[] {
    const extraction = extractProductExtraction(record.details);
    if (!extraction || !extraction.candidateResults) {
        // fallback: 기존 단일 로직
        const single = buildGoldSetExample(record);
        return single ? [single] : [];
    }

    const approved = record.payload.approved ?? [];
    if (approved.length === 0 || record.payload.action === 'reject') {
        return [];
    }

    return approved
        .map((approval) => {
            const cr = extraction.candidateResults![approval.candidateIndex];
            if (!cr) return undefined;

            return {
                exampleId: randomUUID(),
                taskId: record.details.task.taskId,
                reviewAction: record.payload.action,
                expectedProduct: cr.candidate.name,
                category: cr.candidate.category,
                taskInput: record.details.task.input,
                candidateNames: extraction.allCandidates.map((c) => c.name),
                evidenceSources: cr.evidence.map((e) => e.sourceType),
                confidence: cr.confidence,
                createdAt: new Date().toISOString(),
            } as GoldSetExample;
        })
        .filter((ex): ex is GoldSetExample => ex !== undefined);
}
