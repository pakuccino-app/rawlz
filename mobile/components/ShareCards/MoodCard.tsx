// components/ShareCards/MoodCard.tsx
// Share card showing user's mood overview - 1080x1080px
// For sharing general engagement stats

import { View, Text, StyleSheet, Dimensions } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { forwardRef } from 'react';
import { COLORS } from '../../lib/constants';

const CARD_SIZE = 1080;

interface MoodCardProps {
  totalVotes: number;
  yesPct: number;
  noPct: number;
  streakDays: number;
  topQuestions: { word: string; vote: 'yes' | 'no' }[];
  dateString?: string;
}

const MoodCard = forwardRef<ViewShot, MoodCardProps>(
  ({ totalVotes, yesPct, noPct, streakDays, topQuestions, dateString }, ref) => {
    const date = dateString || new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return (
      <ViewShot
        ref={ref}
        options={{ format: 'jpg', quality: 0.9, width: CARD_SIZE, height: CARD_SIZE }}
        style={styles.container}
        // @ts-ignore
        collapsable={false}
      >
        {/* Background */}
        <View style={styles.background}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>#RAWLZ</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          {/* Main content */}
          <View style={styles.content}>
            <Text style={styles.title}>Meine Stimm-Stimmung</Text>
            
            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{totalVotes}</Text>
                <Text style={styles.statLabel}>Stimmen</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{streakDays}</Text>
                <Text style={styles.statLabel}>Tage-Streak 🔥</Text>
              </View>
            </View>

            {/* Yes/No breakdown */}
            <View style={styles.breakdownContainer}>
              <Text style={styles.breakdownTitle}>Mein Abstimmverhalten</Text>
              <View style={styles.breakdownBar}>
                <View style={[styles.breakdownYes, { width: `${yesPct}%` }]}>
                  <Text style={styles.breakdownText}>{yesPct}% JA</Text>
                </View>
                <View style={[styles.breakdownNo, { width: `${noPct}%` }]}>
                  <Text style={styles.breakdownText}>{noPct}% NEIN</Text>
                </View>
              </View>
            </View>

            {/* Recent questions */}
            {topQuestions.length > 0 && (
              <View style={styles.recentContainer}>
                <Text style={styles.recentTitle}>Letzte Abstimmungen</Text>
                {topQuestions.slice(0, 3).map((q, idx) => (
                  <View key={idx} style={styles.recentItem}>
                    <Text style={styles.recentWord}>{q.word}</Text>
                    <Text style={[
                      styles.recentVote,
                      q.vote === 'yes' ? styles.voteYes : styles.voteNo,
                    ]}>
                      {q.vote === 'yes' ? 'JA' : 'NEIN'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.watermark}>rawlz.app</Text>
            <Text style={styles.tagline}>Wischen, wählen, verstehen.</Text>
          </View>
        </View>
      </ViewShot>
    );
  }
);

MoodCard.displayName = 'MoodCard';

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
    marginBottom: 40,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.black,
  },
  dateText: {
    fontSize: 24,
    color: COLORS.gray500,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 56,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 60,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 60,
  },
  statBox: {
    backgroundColor: COLORS.gray100,
    paddingVertical: 40,
    paddingHorizontal: 60,
    borderRadius: 24,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 72,
    fontWeight: '900',
    color: COLORS.black,
  },
  statLabel: {
    fontSize: 24,
    color: COLORS.gray500,
    marginTop: 8,
  },
  breakdownContainer: {
    marginBottom: 60,
  },
  breakdownTitle: {
    fontSize: 24,
    color: COLORS.gray700,
    marginBottom: 16,
    textAlign: 'center',
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  breakdownYes: {
    backgroundColor: COLORS.yes,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownNo: {
    backgroundColor: COLORS.no,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '700',
  },
  recentContainer: {
    backgroundColor: COLORS.gray100,
    borderRadius: 24,
    padding: 32,
  },
  recentTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 20,
  },
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray300,
  },
  recentWord: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.black,
  },
  recentVote: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  voteYes: {
    backgroundColor: COLORS.yesLight,
    color: COLORS.yes,
  },
  voteNo: {
    backgroundColor: COLORS.noLight,
    color: COLORS.no,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  watermark: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  tagline: {
    fontSize: 20,
    color: COLORS.gray300,
    marginTop: 8,
  },
});

export default MoodCard;
