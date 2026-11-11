import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectCoactivity } from './coactivity';
import { detectCosharing } from './cosharing';
import { detectPairSignals } from './detectors';
import { detectTextSimilarity } from './text-similarity';
import type {
  CoactivityResult,
  CosharingResult,
  DetectionProfileConfig,
  DetectorMessage,
  TextSimilarityResult,
} from './types';

// Усі три детектори замінюються двійниками: тестується лише оркестрація в detectPairSignals
vi.mock('./text-similarity', () => ({ detectTextSimilarity: vi.fn() }));
vi.mock('./coactivity', () => ({ detectCoactivity: vi.fn() }));
vi.mock('./cosharing', () => ({ detectCosharing: vi.fn() }));

describe('detectPairSignals з тестовими двійниками', () => {
  const profile: DetectionProfileConfig = {
    syncGapSec: 60,
    minTextLength: 12,
    simThreshold: 0.6,
    // Поля, які детектори не повинні отримувати
    wText: 0.5,
    wCoactivity: 0.3,
    wCosharing: 0.2,
    edgeThreshold: 0.5,
  };

  // Dummy: повідомлення лише заповнюють параметри, їхній зміст не важливий
  const dummyMessagesA: DetectorMessage[] = [];
  const dummyMessagesB: DetectorMessage[] = [];

  // Stub-відповіді з наперед заданими значеннями
  const textStub: TextSimilarityResult = { signalKind: 'text', value: 0.4, evidence: [] };
  const coactivityStub: CoactivityResult = {
    signalKind: 'coactivity',
    value: 0.7,
    gridZeroJaccard: 0.7,
    gridShiftedJaccard: 0.2,
  };
  const cosharingStub: CosharingResult = {
    signalKind: 'cosharing',
    value: 0.1,
    sharedItemsA: ['a.com'],
    sharedItemsB: ['a.com', 'b.com'],
    intersection: ['a.com'],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(detectTextSimilarity).mockReturnValue(textStub);
    vi.mocked(detectCoactivity).mockReturnValue(coactivityStub);
    vi.mocked(detectCosharing).mockReturnValue(cosharingStub);
  });

  it('[stub] повертає результати детекторів без змін', () => {
    const result = detectPairSignals(dummyMessagesA, dummyMessagesB, profile);

    expect(result).toEqual({
      text: textStub,
      coactivity: coactivityStub,
      cosharing: cosharingStub,
    });
    expect(result.text).toBe(textStub);
    expect(result.coactivity.value).toBeCloseTo(0.7);
  });

  it('[mock] викликає кожен детектор рівно один раз з очікуваними аргументами', () => {
    detectPairSignals(dummyMessagesA, dummyMessagesB, profile);

    expect(detectTextSimilarity).toHaveBeenCalledTimes(1);
    expect(detectTextSimilarity).toHaveBeenCalledWith(dummyMessagesA, dummyMessagesB, {
      minTextLength: 12,
      simThreshold: 0.6,
    });
    expect(detectCoactivity).toHaveBeenCalledTimes(1);
    expect(detectCoactivity).toHaveBeenCalledWith(dummyMessagesA, dummyMessagesB, {
      syncGapSec: 60,
    });
    expect(detectCosharing).toHaveBeenCalledTimes(1);
    expect(detectCosharing).toHaveBeenCalledWith(dummyMessagesA, dummyMessagesB);
  });

  it('[spy] викликає детектори у порядку текст → співактивність → співпоширення', () => {
    detectPairSignals(dummyMessagesA, dummyMessagesB, profile);

    const [textOrder] = vi.mocked(detectTextSimilarity).mock.invocationCallOrder;
    const [coactivityOrder] = vi.mocked(detectCoactivity).mock.invocationCallOrder;
    const [cosharingOrder] = vi.mocked(detectCosharing).mock.invocationCallOrder;

    expect(textOrder).toBeLessThan(coactivityOrder);
    expect(coactivityOrder).toBeLessThan(cosharingOrder);
  });

  it('[stub з помилкою] пробрасує виняток детектора і не викликає наступні', () => {
    vi.mocked(detectCoactivity).mockImplementation(() => {
      throw new Error('coactivity failed');
    });

    expect(() => detectPairSignals(dummyMessagesA, dummyMessagesB, profile)).toThrow(
      'coactivity failed',
    );
    expect(detectTextSimilarity).toHaveBeenCalledTimes(1);
    expect(detectCosharing).not.toHaveBeenCalled();
  });
});
