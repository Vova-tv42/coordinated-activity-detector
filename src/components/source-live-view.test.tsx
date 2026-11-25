import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceLiveView } from '@/components/source-live-view';
import type { SourceLiveData } from '@/db/snapshots';

const sourceWithGroup: SourceLiveData = {
  source: { id: 4, title: 'Тестова група', kind: 'upload', isActive: true },
  thresholds: { keepThreshold: 0.2, edgeThreshold: 0.5 },
  snapshot: { id: 1, computedAt: '2026-11-25T12:15:00.000Z' },
  groups: [{ id: 1, score: 0.8, memberIds: [1, 2], memberNames: ['Олександр', 'Олександр'] }],
  pairs: [
    {
      key: '1:2',
      participantAId: 1,
      participantBId: 2,
      participantAName: 'Олександр',
      participantBName: 'Олександр',
      signals: { text: 1, coactivity: 1, cosharing: 0 },
      score: 0.8,
    },
  ],
  recentMessages: [],
};

describe('SourceLiveView', () => {
  it('рендериться на сервері разом з карткою графа, без доступу до window', () => {
    // Direct opening or reloading the page renders it on the server, where window does not exist
    const isServerEnvironment = typeof (globalThis as { window?: unknown }).window === 'undefined';

    const html = renderToString(<SourceLiveView initialData={sourceWithGroup} />);

    expect(isServerEnvironment).toBe(true);
    expect(html).toContain('Граф координації');
    expect(html).toContain('Завантаження графа...');
  });
});
