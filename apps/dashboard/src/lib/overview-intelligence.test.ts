import { describe, expect, it } from 'vitest';
import { getOverviewPanelData } from './overview-intelligence';

describe('getOverviewPanelData', () => {
  it('returns a stable fallback mission when no intelligence is provided', () => {
    const panel = getOverviewPanelData();

    expect(panel.mission.title).toContain('Turn the latest signal');
    expect(panel.opportunities).toEqual([]);
    expect(panel.risks).toEqual([]);
  });

  it('limits output and sorts risks by severity', () => {
    const panel = getOverviewPanelData({
      mission: {
        title: 'Primary mission',
        detail: 'Mission detail',
        actionLabel: 'Open',
        actionPath: '/dashboard',
      },
      opportunities: [
        { title: 'One', detail: 'A' },
        { title: 'Two', detail: 'B' },
        { title: 'Three', detail: 'C' },
        { title: 'Four', detail: 'D' },
      ],
      risks: [
        { title: 'Info risk', detail: 'later', severity: 'info' },
        { title: 'Critical risk', detail: 'now', severity: 'critical' },
        { title: 'Warning risk', detail: 'soon', severity: 'warning' },
      ],
      highlights: [
        { label: 'A', value: '1' },
        { label: 'B', value: '2' },
        { label: 'C', value: '3' },
        { label: 'D', value: '4' },
        { label: 'E', value: '5' },
      ],
    });

    expect(panel.opportunities).toHaveLength(3);
    expect(panel.highlights).toHaveLength(4);
    expect(panel.risks[0]?.title).toBe('Critical risk');
    expect(panel.risks[1]?.title).toBe('Warning risk');
    expect(panel.risks[2]?.title).toBe('Info risk');
  });
});