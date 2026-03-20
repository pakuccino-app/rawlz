// components/DailyPulseCard.tsx
// Special card for Daily Pulse questions - highlighted with gold styling

import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { COLORS, getWordFontSize } from '../lib/constants';

interface DailyPulseCardProps {
  word: string;
  style?: any;
}

export default function DailyPulseCard({ word, style }: DailyPulseCardProps) {
  const glowOpacity = useSharedValue(0.3);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Glow animation
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500 }),
        withTiming(0.3, { duration: 1500 })
      ),
      -1,
      true
    );

    // Pulse animation
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2000 }),
        withTiming(1, { duration: 2000 })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const wordLength = word.length - 1;
  const fontSize = getWordFontSize(wordLength);

  return (
    <Animated.View style={[styles.container, cardStyle, style]}>
      {/* Glow effect */}
      <Animated.View style={[styles.glow, glowStyle]} />
      
      {/* Badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeIcon}>🔥</Text>
        <Text style={styles.badgeText}>TÄGLICHER PULS</Text>
      </View>

      {/* Word */}
      <Text style={[styles.wordText, { fontSize }]}>{word}</Text>

      {/* Hint */}
      <Text style={styles.hint}>Swipe jetzt!</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.gold,
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.goldLight,
  },
  badge: {
    position: 'absolute',
    top: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1,
  },
  wordText: {
    fontWeight: '900',
    color: COLORS.black,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  hint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: '600',
  },
});
