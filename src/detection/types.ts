export interface DetectorMessage {
  id?: number | string;
  participantId?: number | string;
  sentAt: Date | number;
  text: string;
  normalizedText?: string;
}

export interface DetectionProfileConfig {
  syncGapSec: number;
  windowMinutes?: number;
  windowMaxMessages?: number;
  minTextLength: number;
  simThreshold: number;
  wText?: number;
  wCoactivity?: number;
  wCosharing?: number;
  edgeThreshold?: number;
  keepThreshold?: number;
}

export interface TextEvidence<TMessage extends DetectorMessage = DetectorMessage> {
  messageA: TMessage;
  messageB: TMessage;
  similarity: number;
}

export interface TextSimilarityResult<TMessage extends DetectorMessage = DetectorMessage> {
  signalKind: 'text';
  value: number;
  evidence: TextEvidence<TMessage>[];
}

export interface CoactivityResult {
  signalKind: 'coactivity';
  value: number;
  gridZeroJaccard: number;
  gridShiftedJaccard: number;
}

export interface CosharingResult {
  signalKind: 'cosharing';
  value: number;
  sharedItemsA: string[];
  sharedItemsB: string[];
  intersection: string[];
}

export interface PairSignalsResult<TMessage extends DetectorMessage = DetectorMessage> {
  text: TextSimilarityResult<TMessage>;
  coactivity: CoactivityResult;
  cosharing: CosharingResult;
}
