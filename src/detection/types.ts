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

export type ParticipantId = number | string;

export interface ScoreWeightsProfile {
  wText: number;
  wCoactivity: number;
  wCosharing: number;
}

export interface GraphThresholdProfile extends ScoreWeightsProfile {
  edgeThreshold: number;
  keepThreshold?: number;
}

export interface ScoredPair<TMessage extends DetectorMessage = DetectorMessage> {
  participantAId: ParticipantId;
  participantBId: ParticipantId;
  score: number;
  signals: PairSignalsResult<TMessage>;
}

export type CoordinatedEdge<TMessage extends DetectorMessage = DetectorMessage> =
  ScoredPair<TMessage>;

export interface CoordinatedGroup<TMessage extends DetectorMessage = DetectorMessage> {
  groupKey: string;
  participantIds: ParticipantId[];
  score: number;
  edges: CoordinatedEdge<TMessage>[];
}

export interface ParticipantMessages<TMessage extends DetectorMessage = DetectorMessage> {
  participantId: ParticipantId;
  messages: TMessage[];
}

export interface CoordinationAnalysisResult<TMessage extends DetectorMessage = DetectorMessage> {
  groups: CoordinatedGroup<TMessage>[];
  edges: CoordinatedEdge<TMessage>[];
  retainedPairs: ScoredPair<TMessage>[];
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
