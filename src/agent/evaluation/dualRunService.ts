import { randomUUID } from 'crypto';
import { ProductExtractionWorkflow } from '../workflows/ProductExtractionWorkflow';
import { ProductExtractionResult } from '../workflows/productTypes';
import { EvaluationStore, evaluationStore } from './evaluationStore';
import { GoldSetStore, goldSetStore } from './goldSetStore';
import { SourceScoreStore, sourceScoreStore } from './sourceScoreStore';
import {
    DualRunIterationResult,
    DualRunRecord,
    DualRunRequest,
    EvaluationSummary,
} from './types';
import { calculateAggregateRate, calculateDualRunMetrics, matchesGold } from './metrics';

interface DualRunServiceDeps {
    workflow?: Pick<ProductExtractionWorkflow, 'execute'>;
    evaluationStore?: EvaluationStore;
    goldSetStore?: GoldSetStore;
    sourceScoreStore?: SourceScoreStore;
}

function normalizeWorkflowInput(input: DualRunRequest['input']): Record<string, unknown> {
    return {
        context: {
            taskType: input.taskType,
            sourceType: input.taskType === 'AUTO_PRODUCT_FROM_CLIP' ? 'clip' : 'video',
            videoUrl: input.videoUrl,
            channelCategory: input.channelCategory,
            clipContext: input.clipContext,
            legacyCandidates: input.legacyCandidates ?? [],
        },
    };
}

function buildIterationResult(
    iteration: number,
    latencyMs: number,
    result: ProductExtractionResult,
    goldLabel?: string,
): DualRunIterationResult {
    const topCandidates = result.allCandidates.map((candidate) => candidate.name);

    return {
        runId: randomUUID(),
        iteration,
        status: 'SUCCESS',
        latencyMs,
        selectedProductName: result.selectedProduct?.name,
        topCandidates,
        confidence: result.confidence,
        evidenceSources: result.evidence.map((evidence) => evidence.sourceType),
        legacyMatched: result.legacyComparison?.matched ?? false,
        top1MatchedGold: matchesGold(topCandidates, goldLabel, 1),
        top3MatchedGold: matchesGold(topCandidates, goldLabel, 3),
        result,
    };
}

export class DualRunService {
    constructor(private readonly deps: DualRunServiceDeps = {}) {}

    async run(request: DualRunRequest): Promise<DualRunRecord> {
        const iterations = Math.max(1, Math.min(request.iterations ?? 3, 10));
        const runs: DualRunIterationResult[] = [];

        for (let iteration = 1; iteration <= iterations; iteration++) {
            const startedAt = Date.now();

            try {
                const result = await (this.deps.workflow ?? new ProductExtractionWorkflow()).execute(normalizeWorkflowInput(request.input));
                const latencyMs = Date.now() - startedAt;
                runs.push(buildIterationResult(iteration, latencyMs, result, request.goldLabel));
            } catch (err) {
                runs.push({
                    runId: randomUUID(),
                    iteration,
                    status: 'FAILED',
                    latencyMs: Date.now() - startedAt,
                    topCandidates: [],
                    confidence: 0,
                    evidenceSources: [],
                    legacyMatched: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        const record: DualRunRecord = {
            evaluationId: randomUUID(),
            evaluationName: request.evaluationName,
            createdAt: new Date().toISOString(),
            input: request.input,
            goldLabel: request.goldLabel,
            iterations: runs,
            metrics: calculateDualRunMetrics(runs, request.goldLabel),
        };

        await (this.deps.evaluationStore ?? evaluationStore).create(record);
        await this.persistLearningSignals(record);

        return record;
    }

    async get(evaluationId: string): Promise<DualRunRecord | undefined> {
        return (this.deps.evaluationStore ?? evaluationStore).get(evaluationId);
    }

    async getSummary(): Promise<EvaluationSummary> {
        const evaluations = await (this.deps.evaluationStore ?? evaluationStore).list();
        const scores = await (this.deps.sourceScoreStore ?? sourceScoreStore).list();

        return {
            totalEvaluations: evaluations.length,
            avgTaskSuccessRate: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.taskSuccessRate)) ?? 0,
            avgFailureRate: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.failureRate)) ?? 0,
            avgTop1MatchRate: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.top1MatchRate)),
            avgTop3MatchRate: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.top3MatchRate)),
            avgConsistencyScore: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.consistencyScore)) ?? 0,
            avgEvidenceCoverageScore: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.evidenceCoverageScore)) ?? 0,
            avgLatencyMs: calculateAggregateRate(evaluations.map((evaluation) => evaluation.metrics.avgLatencyMs)) ?? 0,
            goldSetSize: await (this.deps.goldSetStore ?? goldSetStore).size(),
            sourceScores: scores,
        };
    }

    async reset(): Promise<void> {
        await (this.deps.evaluationStore ?? evaluationStore).reset();
        await (this.deps.goldSetStore ?? goldSetStore).reset();
        await (this.deps.sourceScoreStore ?? sourceScoreStore).reset();
    }

    private async persistLearningSignals(record: DualRunRecord): Promise<void> {
        const successfulRuns = record.iterations.filter((run) => run.status === 'SUCCESS' && run.result);

        if (record.goldLabel?.trim() && successfulRuns.length) {
            const bestRun = [...successfulRuns].sort((left, right) => right.confidence - left.confidence)[0];
            await (this.deps.goldSetStore ?? goldSetStore).add({
                exampleId: randomUUID(),
                evaluationId: record.evaluationId,
                reviewAction: 'approve',
                expectedProduct: record.goldLabel.trim(),
                category: bestRun.result?.selectedProduct?.category,
                taskInput: record.input,
                candidateNames: bestRun.topCandidates,
                evidenceSources: bestRun.evidenceSources,
                confidence: bestRun.confidence,
                legacyMatched: bestRun.legacyMatched,
                createdAt: new Date().toISOString(),
            });
        }

        for (const run of successfulRuns) {
            const matched = run.top1MatchedGold === undefined ? 0.5 : run.top1MatchedGold ? 1 : 0;
            await (this.deps.sourceScoreStore ?? sourceScoreStore).applyOutcome(run.evidenceSources, matched);
        }
    }
}

export const dualRunService = new DualRunService();
