import { eq } from 'drizzle-orm';
import { saveUploadedChatLog } from '@/db/ingest';
import { findingMembers, findings, participants } from '@/db/schema';
import { createTestDatabase } from '@/db/test-database';
import { analyzeSourceTimeline } from '@/db/timeline';
import { createGroupKey } from '@/detection/detectors';
import { type GoldenDatasetEntry, loadGoldenDataset } from '@/golden-dataset/golden-dataset';

export const MIN_F1_SCORE = 0.8;

const DEFAULT_PROFILE_ID = 1;

export type PairCounts = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
};

// null means the metric is undefined, for example precision when nothing was predicted
export type PairMetrics = PairCounts & {
  precision: number | null;
  recall: number | null;
  f1: number | null;
};

export type GoldenDatasetEntryMetrics = PairMetrics & { fileName: string };

export type GoldenDatasetEvaluation = {
  entries: GoldenDatasetEntryMetrics[];
  total: PairMetrics;
};

export function toParticipantPairs(groups: string[][]) {
  const pairKeys = new Set<string>();
  for (const group of groups) {
    group.forEach((participantA, index) => {
      for (const participantB of group.slice(index + 1)) {
        pairKeys.add(createGroupKey([participantA, participantB]));
      }
    });
  }
  return pairKeys;
}

export function countPairs(expectedPairs: Set<string>, predictedPairs: Set<string>): PairCounts {
  const truePositives = [...predictedPairs].filter((pair) => expectedPairs.has(pair)).length;
  return {
    truePositives,
    falsePositives: predictedPairs.size - truePositives,
    falseNegatives: expectedPairs.size - truePositives,
  };
}

function divide(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function calculatePairMetrics(counts: PairCounts): PairMetrics {
  const precision = divide(counts.truePositives, counts.truePositives + counts.falsePositives);
  const recall = divide(counts.truePositives, counts.truePositives + counts.falseNegatives);
  const hasBothMetrics = precision !== null && recall !== null;
  const f1 = hasBothMetrics ? (divide(2 * precision * recall, precision + recall) ?? 0) : null;

  return { ...counts, precision, recall, f1 };
}

// Runs the log through the same path as a real upload: saving, sliding window analysis, findings
export function findPredictedGroups(entry: GoldenDatasetEntry) {
  const database = createTestDatabase();
  try {
    const sourceId = saveUploadedChatLog(database, entry.chatLog, DEFAULT_PROFILE_ID);
    analyzeSourceTimeline(database, sourceId);

    const memberRows = database
      .select({ findingId: findingMembers.findingId, author: participants.externalId })
      .from(findingMembers)
      .innerJoin(findings, eq(findings.id, findingMembers.findingId))
      .innerJoin(participants, eq(participants.id, findingMembers.participantId))
      .where(eq(findings.sourceId, sourceId))
      .all();

    const authorsByFinding = Map.groupBy(memberRows, (row) => row.findingId);
    return [...authorsByFinding.values()].map((rows) => rows.map((row) => row.author));
  } finally {
    database.$client.close();
  }
}

export function evaluateGoldenDataset(
  entries: GoldenDatasetEntry[] = loadGoldenDataset(),
): GoldenDatasetEvaluation {
  const entryMetrics = entries.map((entry) => {
    const counts = countPairs(
      toParticipantPairs(entry.groundTruth),
      toParticipantPairs(findPredictedGroups(entry)),
    );
    return { fileName: entry.fileName, ...calculatePairMetrics(counts) };
  });

  const totalCounts = entryMetrics.reduce<PairCounts>(
    (sum, metrics) => ({
      truePositives: sum.truePositives + metrics.truePositives,
      falsePositives: sum.falsePositives + metrics.falsePositives,
      falseNegatives: sum.falseNegatives + metrics.falseNegatives,
    }),
    { truePositives: 0, falsePositives: 0, falseNegatives: 0 },
  );

  return { entries: entryMetrics, total: calculatePairMetrics(totalCounts) };
}
