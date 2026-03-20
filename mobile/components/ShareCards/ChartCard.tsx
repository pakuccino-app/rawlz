// components/ShareCards/ChartCard.tsx
// Share card with comparison chart - 1080x1080px
// For sharing question comparisons with timeseries

import { View, Text, StyleSheet, Dimensions } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { forwardRef } from 'react';
import { COLORS } from '../../lib/constants';

const CARD_SIZE = 1080;
const CHART_COLORS = ['#16A34A', '#2563EB', '#D4AF37', '#DC2626', '#6B7280'];

interface QuestionData {
  word: string;
  yesPct: number;
  totalVotes: number;
  timeseriesData?: { day: string; yes_pct: number }[];
}

interface ChartCardProps {
  title?: string;
  questions: QuestionData[];
  dateString?: string;
}

const ChartCard = forwardRef<ViewShot, ChartCardProps>(
  ({ title = 'Vergleich', questions, dateString }, ref) => {
    const date = dateString || new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    // Find common days for chart
    const allDays = new Set<string>();
    questions.forEach(q => {
      (q.timeseriesData || []).forEach(p => allDays.add(p.day));
    });
    const sortedDays = Array.from(allDays).sort();
    const chartWidth = CARD_SIZE - 160;
    const chartHeight = 300;

    // Calculate chart paths
    const getChartPath = (data: { day: string; yes_pct: number }[]): string => {
      if (!data || data.length === 0) return '';
      
      const points = sortedDays.map((day, idx) => {
        const point = data.find(p => p.day === day);
        const x = (idx / Math.max(1, sortedDays.length - 1)) * chartWidth;
        const y = chartHeight - ((point?.yes_pct || 0) / 100) * chartHeight;
        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
      });
      
      return points.join(' ');
    };

    return (
      <ViewShot
        ref={ref}
        options={{ format: 'jpg', quality: 0.9, width: CARD_SIZE, height: CARD_SIZE }}
        style={styles.container}
        // @ts-ignore
        collapsable={false}
      >
        <View style={styles.background}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>#RAWLZ</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Chart area */}
          {sortedDays.length > 0 && (
            <View style={styles.chartContainer}>
              {/* SVG-like chart using Views */}
              <View style={[styles.chartArea, { height: chartHeight }]}>
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map(pct => (
                  <View
                    key={pct}
                    style={[
                      styles.gridLine,
                      { bottom: (pct / 100) * chartHeight },
                    ]}
                  />
                ))}
                
                {/* Y-axis labels */}
                <Text style={[styles.yLabel, { bottom: chartHeight - 10 }]}>100%</Text>
                <Text style={[styles.yLabel, { bottom: chartHeight * 0.5 - 10 }]}>50%</Text>
                <Text style={[styles.yLabel, { bottom: -10 }]}>0%</Text>
              </View>

              {/* Legend */}
              <View style={styles.legendContainer}>
                {questions.map((q, idx) => (
                  <View key={idx} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: CHART_COLORS[idx] }]} />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {q.word}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Totals */}
          <View style={styles.totalsContainer}>
            {questions.map((q, idx) => (
              <View key={idx} style={styles.totalRow}>
                <View style={[styles.totalDot, { backgroundColor: CHART_COLORS[idx] }]} />
                <Text style={styles.totalWord} numberOfLines={1}>{q.word}</Text>
                <View style={styles.totalBarContainer}>
                  <View style={[styles.totalBarYes, { width: `${q.yesPct}%` }]} />
                  <View style={[styles.totalBarNo, { width: `${100 - q.yesPct}%` }]} />
                </View>
                <Text style={styles.totalPct}>{q.yesPct}% JA</Text>
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.watermark}>rawlz.app · {date}</Text>
          </View>
        </View>
      </ViewShot>
    );
  }
);

ChartCard.displayName = 'ChartCard';

const styles = StyleSheet.create({
  container: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  background: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    fontSize: 40,
    fontWeight: '900',
    color: COLORS.gold,
  },
  dateText: {
    fontSize: 20,
    color: COLORS.gray500,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 40,
  },
  chartContainer: {
    marginBottom: 40,
  },
  chartArea: {
    width: '100%',
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.gray300,
  },
  yLabel: {
    position: 'absolute',
    left: -50,
    fontSize: 16,
    color: COLORS.gray500,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  legendText: {
    fontSize: 20,
    color: COLORS.gray700,
    maxWidth: 200,
  },
  totalsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  totalDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 16,
  },
  totalWord: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    width: 180,
  },
  totalBarContainer: {
    flex: 1,
    height: 24,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  totalBarYes: {
    backgroundColor: COLORS.yes,
    height: '100%',
  },
  totalBarNo: {
    backgroundColor: COLORS.no,
    height: '100%',
  },
  totalPct: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray700,
    width: 100,
    textAlign: 'right',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  watermark: {
    fontSize: 20,
    color: COLORS.gray500,
  },
});

export default ChartCard;
