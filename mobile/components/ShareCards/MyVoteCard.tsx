// components/ShareCards/MyVoteCard.tsx
// Share card showing single vote result - 1080x1080px
// For sharing a specific vote with result

import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { forwardRef } from 'react';
import { COLORS, getWordFontSize } from '../../lib/constants';

const CARD_SIZE = 1080;

interface MyVoteCardProps {
  word: string;
  myVote: 'yes' | 'no';
  yesPct: number;
  noPct: number;
  totalVotes: number;
  showResult: boolean;
  dateString?: string;
}

const MyVoteCard = forwardRef<ViewShot, MyVoteCardProps>(
  ({ word, myVote, yesPct, noPct, totalVotes, showResult, dateString }, ref) => {
    const date = dateString || new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const wordLength = word.length - 1; // Exclude #
    // Scale font size for share card
    const fontSize = Math.min(getWordFontSize(wordLength) * 1.5, 120);

    const isWithMajority = (myVote === 'yes' && yesPct > 50) || 
                           (myVote === 'no' && noPct > 50);

    return (
      <ViewShot
        ref={ref}
        options={{ format: 'jpg', quality: 0.9, width: CARD_SIZE, height: CARD_SIZE }}
        style={styles.container}
        // @ts-ignore
        collapsable={false}
      >
        {/* Background with vote color */}
        <View style={[
          styles.background,
          myVote === 'yes' ? styles.bgYes : styles.bgNo,
        ]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>#RAWLZ</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          {/* Main content */}
          <View style={styles.content}>
            {/* Vote indicator */}
            <View style={[
              styles.voteBadge,
              myVote === 'yes' ? styles.badgeYes : styles.badgeNo,
            ]}>
              <Text style={styles.voteBadgeText}>
                {myVote === 'yes' ? 'JA' : 'NEIN'}
              </Text>
            </View>

            {/* Word */}
            <Text style={[styles.wordText, { fontSize }]}>{word}</Text>

            {/* Result (if visible) */}
            {showResult ? (
              <View style={styles.resultContainer}>
                <View style={styles.resultBar}>
                  <View style={[styles.resultYes, { width: `${yesPct}%` }]} />
                  <View style={[styles.resultNo, { width: `${noPct}%` }]} />
                </View>
                <View style={styles.resultLabels}>
                  <Text style={styles.resultLabel}>{yesPct}% JA</Text>
                  <Text style={styles.resultLabel}>{noPct}% NEIN</Text>
                </View>
                <Text style={styles.totalVotes}>
                  {totalVotes.toLocaleString()} Stimmen
                </Text>
                
                {/* Majority indicator */}
                <Text style={styles.majorityText}>
                  {isWithMajority 
                    ? '✓ Ich stimme mit der Mehrheit'
                    : '✗ Ich stimme gegen die Mehrheit'}
                </Text>
              </View>
            ) : (
              <View style={styles.pendingContainer}>
                <Text style={styles.pendingText}>
                  Ergebnis wird noch ermittelt...
                </Text>
                <Text style={styles.pendingSubtext}>
                  {totalVotes.toLocaleString()} Stimmen bisher
                </Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.watermark}>rawlz.app</Text>
          </View>
        </View>
      </ViewShot>
    );
  }
);

MyVoteCard.displayName = 'MyVoteCard';

const styles = StyleSheet.create({
  container: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  background: {
    flex: 1,
    padding: 60,
  },
  bgYes: {
    backgroundColor: COLORS.yesLight,
  },
  bgNo: {
    backgroundColor: COLORS.noLight,
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
    alignItems: 'center',
  },
  voteBadge: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 40,
  },
  badgeYes: {
    backgroundColor: COLORS.yes,
  },
  badgeNo: {
    backgroundColor: COLORS.no,
  },
  voteBadgeText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 4,
  },
  wordText: {
    fontWeight: '900',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: 60,
  },
  resultContainer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 32,
    padding: 40,
  },
  resultBar: {
    width: '100%',
    height: 40,
    flexDirection: 'row',
    borderRadius: 20,
    overflow: 'hidden',
  },
  resultYes: {
    backgroundColor: COLORS.yes,
    height: '100%',
  },
  resultNo: {
    backgroundColor: COLORS.no,
    height: '100%',
  },
  resultLabels: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  resultLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  totalVotes: {
    fontSize: 24,
    color: COLORS.gray500,
    marginTop: 16,
  },
  majorityText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray700,
    marginTop: 24,
  },
  pendingContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 32,
    padding: 40,
  },
  pendingText: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  pendingSubtext: {
    fontSize: 24,
    color: COLORS.gray500,
    marginTop: 12,
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
});

export default MyVoteCard;
