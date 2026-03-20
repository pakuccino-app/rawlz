// components/WirksamkeitOverlay.tsx
// Wirksamkeits-Anzeige overlay shown after 100 votes
// Shows user's effectiveness in influencing question outcomes

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WirksamkeitData {
  totalVotes: number;
  effectiveVotes: number;
  effectivenessPct: number;
}

interface WirksamkeitOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  data: WirksamkeitData | null;
}

export default function WirksamkeitOverlay({
  visible,
  onDismiss,
  data,
}: WirksamkeitOverlayProps) {
  const { t } = useTranslation();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible]);

  async function handleDismiss() {
    // Mark as shown in DB
    const user = await getCurrentUser();
    if (user) {
      await supabase
        .from('users')
        .update({ wirksamkeit_shown: true })
        .eq('id', user.id);
    }
    
    onDismiss();
  }

  if (!data) return null;

  const effectivePercentage = Math.round(
    (data.effectiveVotes / Math.max(1, data.totalVotes)) * 100
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.card,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Celebration icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🎯</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{t('wirksamkeit.title')}</Text>

          {/* Main stat */}
          <View style={styles.mainStat}>
            <Text style={styles.statNumber}>{data.effectiveVotes}</Text>
            <Text style={styles.statLabel}>wirksame Stimmen</Text>
          </View>

          {/* Explanation */}
          <Text style={styles.message}>
            {t('wirksamkeit.message', { count: data.effectiveVotes })}
          </Text>

          {/* Progress ring visual */}
          <View style={styles.ringContainer}>
            <View style={styles.ringOuter}>
              <View style={[
                styles.ringInner,
                { 
                  width: `${effectivePercentage}%`,
                  backgroundColor: effectivePercentage >= 50 ? COLORS.yes : COLORS.gold,
                },
              ]} />
            </View>
            <Text style={styles.ringText}>{effectivePercentage}%</Text>
            <Text style={styles.ringSubtext}>
              deiner {data.totalVotes} Stimmen
            </Text>
          </View>

          {/* What this means */}
          <View style={styles.explainerBox}>
            <Text style={styles.explainerTitle}>Was bedeutet "wirksam"?</Text>
            <Text style={styles.explainerText}>
              Deine Stimme gilt als wirksam, wenn du früh bei einer Frage 
              abgestimmt hast – bevor sie die Schwelle + 50 Stimmen erreicht hat.
              Je früher du abstimmst, desto mehr Gewicht hat deine Meinung!
            </Text>
          </View>

          {/* Dismiss button */}
          <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
            <Text style={styles.dismissButtonText}>{t('wirksamkeit.dismiss')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 32,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.goldLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 24,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: COLORS.gold,
  },
  statLabel: {
    fontSize: 16,
    color: COLORS.gray500,
    marginTop: 4,
  },
  message: {
    fontSize: 16,
    color: COLORS.gray700,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  ringContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ringOuter: {
    width: 200,
    height: 12,
    backgroundColor: COLORS.gray100,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  ringInner: {
    height: '100%',
    borderRadius: 6,
  },
  ringText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  ringSubtext: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 4,
  },
  explainerBox: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  explainerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  explainerText: {
    fontSize: 13,
    color: COLORS.gray500,
    lineHeight: 20,
  },
  dismissButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
  },
  dismissButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
