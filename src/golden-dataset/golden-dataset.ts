import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { type ChatLog, parseChatLog } from '@/upload/chat-log';

const GOLDEN_DATASET_DIRECTORY = new URL('./', import.meta.url);
const MIN_GROUP_SIZE = 2;

// Ground Truth lists coordinated groups by message author; extra keys are ignored on upload
const groundTruthSchema = z.object({
  groundTruth: z.array(z.array(z.string().trim().min(1)).min(MIN_GROUP_SIZE)),
});

export type GoldenDatasetEntry = {
  fileName: string;
  chatLog: ChatLog;
  groundTruth: string[][];
};

export function loadGoldenDatasetEntry(fileName: string): GoldenDatasetEntry {
  const fileContent = readFileSync(new URL(fileName, GOLDEN_DATASET_DIRECTORY), 'utf8');

  const parsedChatLog = parseChatLog(fileContent);
  if (!parsedChatLog.success) {
    throw new Error(`${fileName}: ${parsedChatLog.errors.join(' ')}`);
  }

  const { groundTruth } = groundTruthSchema.parse(JSON.parse(fileContent));

  return { fileName, chatLog: parsedChatLog.chatLog, groundTruth };
}

export function loadGoldenDataset(): GoldenDatasetEntry[] {
  return readdirSync(GOLDEN_DATASET_DIRECTORY)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map(loadGoldenDatasetEntry);
}
