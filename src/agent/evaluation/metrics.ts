import { DualRunIterationResult, DualRunMetrics } from './types';

function normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

function average(values: number[]): number {
    if (!values.length) {
        return 0;
    }

    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function calculateJaccard(left: string[], right: string[]): number {
    const leftSet = new Set(left.map(normalizeName).filter(Boolean));
    const rightSet = new Set(right.map(normalizeName).filter(Boolean));

    const union = new Set([...leftSet, ...rightSet]);
    if (union.size === 0) {
        return 1;
    }

    let intersectionCount = 0;
    union.forEach((value) => {
        if (leftSet.has(value) && rightSet.has(value)) {
            intersectionCount += 1;
        }
    });

    return intersectionCount / union.size;
}

export function matchesGold(candidateNames: string[], goldLabel?: string, topK = 3): boolean | undefined {
    if (!goldLabel?.trim()) {
        return undefined;
    }

    const normalizedGold = normalizeName(goldLabel);
    return candidateNames
        .slice(0, topK)
        .map(normalizeName)
        .some((candidate) => candidate && (
            candidate.includes(normalizedGold) ||
            normalizedGold.includes(candidate)
        ));
}

export function calculateDualRunMetrics(runs: DualRunIterationResult[], goldLabel?: string): DualRunMetrics {
    const successfulRuns = runs.filter((run) => run.status === 'SUCCESS');
    const failedRuns = runs.filter((run) => run.status === 'FAILED');
    const top1Matches = successfulRuns
        .map((run) => matchesGold(run.topCandidates, goldLabel, 1))
        .filter((value): value is boolean => value !== undefined);
    const top3Matches = successfulRuns
        .map((run) => matchesGold(run.topCandidates, goldLabel, 3))
        .filter((value): value is boolean => value !== undefined);

    const consistencyScores: number[] = [];
    for (let index = 0; index < successfulRuns.length; index++) {
        for (let compareIndex = index + 1; compareIndex < successfulRuns.length; compareIndex++) {
            consistencyScores.push(
                calculateJaccard(successfulRuns[index].topCandidates.slice(0, 3), successfulRuns[compareIndex].topCandidates.slice(0, 3)),
            );
        }
    }

    const calibrationScores = successfulRuns
        .map((run) => {
            const matched = matchesGold(run.topCandidates, goldLabel, 1);
            if (matched === undefined) {
                return undefined;
            }

            const actual = matched ? 1 : 0;
            return Math.pow(run.confidence - actual, 2);
        })
        .filter((value): value is number => typeof value === 'number');

    return {
        iterations: runs.length,
        taskSuccessRate: average([successfulRuns.length / (runs.length || 1)]),
        failureRate: average([failedRuns.length / (runs.length || 1)]),
        top1MatchRate: top1Matches.length ? average([top1Matches.filter(Boolean).length / top1Matches.length]) : undefined,
        top3MatchRate: top3Matches.length ? average([top3Matches.filter(Boolean).length / top3Matches.length]) : undefined,
        evidenceCoverageScore: average(successfulRuns.map((run) => run.evidenceSources.length / 4)),
        consistencyScore: consistencyScores.length ? average(consistencyScores) : 1,
        confidenceCalibration: calibrationScores.length ? average(calibrationScores) : undefined,
        avgLatencyMs: average(successfulRuns.map((run) => run.latencyMs)),
        avgConfidence: average(successfulRuns.map((run) => run.confidence)),
    };
}

export function calculateAggregateRate(values: Array<number | undefined>): number | undefined {
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    if (!numericValues.length) {
        return undefined;
    }

    return average(numericValues);
}
