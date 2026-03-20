// components/AbuseReportSheet.tsx
// Bottom sheet for reporting abuse on a question

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser, getSession } from '../lib/supabase';
import { queueAbuseReport } from '../lib/offlineQueue';
import hapticPatterns from '../lib/haptics';
import NetInfo from '@react-native-community/netinfo';

interface AbuseReportSheetProps {
  visible: boolean;
  onClose: () => void;
  questionId: string;
  questionWord: string;
}

export default function AbuseReportSheet({
  visible,
  onClose,
  questionId,
  questionWord,
}: AbuseReportSheetProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleReport() {
    setIsSubmitting(true);
    await hapticPatterns.tap();

    try {
      const netState = await NetInfo.fetch();
      
      if (!netState.isConnected) {
        // Queue for offline
        await queueAbuseReport(questionId);
        await hapticPatterns.success();
        setSubmitted(true);
        
        setTimeout(() => {
          setSubmitted(false);
          onClose();
        }, 2000);
        return;
      }

      const user = await getCurrentUser();
      const session = await getSession();
      
      if (!user || !session) {
        Alert.alert('Fehler', 'Nicht angemeldet');
        return;
      }

      // Call Edge Function
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/report-abuse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ questionId }),
        }
      );

      const result = await response.json();

      if (result.alreadyReported) {
        Alert.alert('Info', 'Du hast diese Frage bereits gemeldet.');
        onClose();
        return;
      }

      if (result.rateLimited) {
        Alert.alert('Info', 'Du hast zu viele Meldungen in kurzer Zeit gesendet. Bitte warte eine Stunde.');
        onClose();
        return;
      }

      if (result.error) {
        throw new Error(result.error);
      }

      await hapticPatterns.success();
      setSubmitted(true);

      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Abuse report error:', error);
      await hapticPatterns.error();
      Alert.alert('Fehler', error.message || 'Meldung konnte nicht gesendet werden.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {submitted ? (
            <View style={styles.successContainer}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successText}>Meldung gesendet</Text>
              <Text style={styles.successSubtext}>
                Wir prüfen deine Meldung so schnell wie möglich.
              </Text>
            </View>
          ) : (
            <>
              {/* Title */}
              <Text style={styles.title}>Frage melden</Text>
              
              {/* Question word */}
              <View style={styles.questionBox}>
                <Text style={styles.questionWord}>{questionWord}</Text>
              </View>

              {/* Explanation */}
              <Text style={styles.explanation}>
                Melde Fragen, die gegen unsere Nutzungsbedingungen verstoßen:
              </Text>

              <View style={styles.rulesList}>
                <Text style={styles.ruleItem}>• Hassrede oder Diskriminierung</Text>
                <Text style={styles.ruleItem}>• Gewaltverherrlichung</Text>
                <Text style={styles.ruleItem}>• Persönliche Angriffe</Text>
                <Text style={styles.ruleItem}>• Spam oder Werbung</Text>
                <Text style={styles.ruleItem}>• Illegale Inhalte</Text>
              </View>

              {/* Warning */}
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Missbrauch der Meldefunktion kann zu Trust-Score-Abzügen führen.
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={handleReport}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.reportButtonText}>Melden</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.gray300,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 20,
  },
  questionBox: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  questionWord: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
  },
  explanation: {
    fontSize: 14,
    color: COLORS.gray700,
    marginBottom: 12,
  },
  rulesList: {
    marginBottom: 20,
  },
  ruleItem: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 6,
    paddingLeft: 8,
  },
  warningBox: {
    backgroundColor: COLORS.noLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  warningText: {
    fontSize: 13,
    color: COLORS.no,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  reportButton: {
    flex: 1,
    backgroundColor: COLORS.no,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    fontSize: 48,
    color: COLORS.yes,
    marginBottom: 16,
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
  },
});
