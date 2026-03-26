// app/suggest.tsx
// Question suggestion screen with autocomplete
// # prefilled and not deletable, max 27 chars after #
// 200ms debounce, server-side search
// Dropdown: "✅ Bereits live" | "⏳ X/Y – Noch Z nötig"
// Confirmation card after submit
// 🔔 Toggle only for pending/new words

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser, getSession } from '../lib/supabase';
import hapticPatterns from '../lib/haptics';

interface AutocompleteResult {
  id: string;
  word: string;
  status: 'active' | 'pending' | 'blocked';
  submission_count: number;
  relevance_threshold: number;
}

interface User {
  id: string;
  membership_type: string;
  is_verified: boolean;
  geo_country?: string;
  geo_region?: string;
}

type GeoScope = 'global' | 'country' | 'region';

export default function SuggestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [word, setWord] = useState('#');
  const [geoScope, setGeoScope] = useState<GeoScope>('global');
  const [notifyOnActivate, setNotifyOnActivate] = useState(true);
  
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    alreadyActive?: boolean;
    question?: any;
    remainingCount?: number;
  } | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const authUser = await getCurrentUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('id, membership_type, is_verified, geo_country, geo_region')
        .eq('id', authUser.id)
        .single();
      setUser(data);
    }
  }

  // Word validation (INV-01)
  function isValidWord(w: string): boolean {
    const wordOnly = w.replace(/^#/, '');
    return /^[a-zA-Z0-9äöüÄÖÜß]{1,27}$/.test(wordOnly);
  }

  function handleWordChange(text: string) {
    // Ensure # is always at the start
    if (!text.startsWith('#')) {
      text = '#' + text.replace(/#/g, '');
    }

    // Limit to 28 chars total (# + 27)
    if (text.length > 28) {
      text = text.slice(0, 28);
    }

    setWord(text);
    setSubmitResult(null);

    // Debounced autocomplete search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const wordOnly = text.replace(/^#/, '');
    if (wordOnly.length >= 2) {
      debounceRef.current = setTimeout(() => {
        performAutocomplete(wordOnly);
      }, 200);
    } else {
      setAutocompleteResults([]);
      setShowDropdown(false);
    }
  }

  async function performAutocomplete(query: string) {
    setIsSearching(true);
    setShowDropdown(true);

    try {
      const { data, error } = await supabase
        .from('questions')
        .select('id, word, status, submission_count, relevance_threshold')
        .ilike('word', `#${query}%`)
        .in('status', ['active', 'pending'])
        .order('total_votes', { ascending: false })
        .limit(5);

      if (error) throw error;
      setAutocompleteResults(data || []);
    } catch (error) {
      console.error('Autocomplete error:', error);
      setAutocompleteResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function selectAutocompleteItem(item: AutocompleteResult) {
    setWord(item.word);
    setShowDropdown(false);
    Keyboard.dismiss();

    if (item.status === 'active') {
      // Show "already live" message
      setSubmitResult({
        success: true,
        alreadyActive: true,
        question: item,
      });
    }
  }

  async function handleSubmit() {
    if (!user) {
      Alert.alert('Fehler', 'Nicht angemeldet');
      return;
    }

    const wordOnly = word.replace(/^#/, '');
    if (!isValidWord(word)) {
      Alert.alert('Fehler', t('suggest.invalid_word'));
      return;
    }

    setIsSubmitting(true);
    await hapticPatterns.tap();

    try {
      const session = await getSession();
      if (!session) {
        throw new Error('Keine Session');
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-question`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            word: word,
            languageCode: 'de',
            geoScope,
            geoCountry: geoScope === 'country' ? user.geo_country : undefined,
            geoRegion: geoScope === 'region' ? user.geo_region : undefined,
            notifyOnActivate: notifyOnActivate && !submitResult?.alreadyActive,
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      await hapticPatterns.success();

      const question = result.question;
      const remaining = question.relevance_threshold - question.submission_count;

      setSubmitResult({
        success: true,
        alreadyActive: result.alreadyActive || question.status === 'active',
        question,
        remainingCount: Math.max(0, remaining),
      });

    } catch (error: any) {
      console.error('Submit error:', error);
      await hapticPatterns.error();
      Alert.alert('Fehler', error.message || t('suggest.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoToVote() {
    if (submitResult?.question?.id) {
      router.push(`/(tabs)?questionId=${submitResult.question.id}`);
    }
  }

  function handleNewSuggestion() {
    setWord('#');
    setSubmitResult(null);
    setAutocompleteResults([]);
    inputRef.current?.focus();
  }

  // Calculate threshold based on user membership
  const threshold = (user?.is_verified || ['supporter', 'expert', 'lobby'].includes(user?.membership_type || ''))
    ? 30
    : 50;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('suggest.title')}</Text>
        </View>

        {/* Result card (shown after submit) */}
        {submitResult ? (
          <View style={styles.resultCard}>
            {submitResult.alreadyActive ? (
              <>
                <Text style={styles.resultIcon}>✅</Text>
                <Text style={styles.resultTitle}>{t('suggest.already_live')}</Text>
                <Text style={styles.resultWord}>{submitResult.question?.word}</Text>
                <TouchableOpacity
                  style={styles.voteNowButton}
                  onPress={handleGoToVote}
                >
                  <Text style={styles.voteNowButtonText}>{t('suggest.vote_now')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.resultIcon}>🎉</Text>
                <Text style={styles.resultTitle}>{t('suggest.success')}</Text>
                <Text style={styles.resultWord}>{submitResult.question?.word}</Text>
                
                {/* Progress bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(100, (submitResult.question?.submission_count / submitResult.question?.relevance_threshold) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {submitResult.question?.submission_count} / {submitResult.question?.relevance_threshold}
                  </Text>
                </View>

                <Text style={styles.remainingText}>
                  {t('suggest.remaining', { count: submitResult.remainingCount })}
                </Text>

                {/* Notification status */}
                {notifyOnActivate && (
                  <View style={styles.notifyBadge}>
                    <Text style={styles.notifyBadgeText}>
                      🔔 Du wirst benachrichtigt
                    </Text>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.newSuggestionButton}
              onPress={handleNewSuggestion}
            >
              <Text style={styles.newSuggestionButtonText}>
                Neuen Vorschlag machen
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Input section */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>{t('suggest.placeholder')}</Text>
              
              <View style={styles.inputContainer}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={word}
                  onChangeText={handleWordChange}
                  placeholder="#Thema"
                  placeholderTextColor={COLORS.gray300}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={28}
                />
                <Text style={styles.charCount}>
                  {word.length - 1}/27
                </Text>
              </View>

              {/* Autocomplete dropdown */}
              {showDropdown && (
                <View style={styles.dropdown}>
                  {isSearching ? (
                    <View style={styles.dropdownLoading}>
                      <ActivityIndicator size="small" color={COLORS.black} />
                    </View>
                  ) : autocompleteResults.length > 0 ? (
                    autocompleteResults.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.dropdownItem}
                        onPress={() => selectAutocompleteItem(item)}
                      >
                        <Text style={styles.dropdownWord}>{item.word}</Text>
                        {item.status === 'active' ? (
                          <Text style={styles.dropdownStatusLive}>✅ Bereits live</Text>
                        ) : (
                          <Text style={styles.dropdownStatusPending}>
                            ⏳ {item.submission_count}/{item.relevance_threshold} – Noch {item.relevance_threshold - item.submission_count} nötig
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>
                        Keine Treffer – neu vorschlagen?
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Geo scope selection */}
            <View style={styles.geoSection}>
              <Text style={styles.sectionLabel}>{t('suggest.geo_scope')}</Text>
              <View style={styles.geoOptions}>
                {(['global', 'country', 'region'] as GeoScope[]).map(scope => (
                  <TouchableOpacity
                    key={scope}
                    style={[
                      styles.geoOption,
                      geoScope === scope && styles.geoOptionSelected,
                    ]}
                    onPress={() => setGeoScope(scope)}
                    disabled={scope === 'country' && !user?.geo_country}
                  >
                    <Text
                      style={[
                        styles.geoOptionText,
                        geoScope === scope && styles.geoOptionTextSelected,
                        scope === 'country' && !user?.geo_country && styles.geoOptionDisabled,
                      ]}
                    >
                      {scope === 'global' ? '🌍 Global' :
                       scope === 'country' ? '🏳️ Land' : '📍 Region'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notification toggle (only for pending/new) */}
            {word.length > 1 && (
              <TouchableOpacity
                style={styles.notifyToggle}
                onPress={() => setNotifyOnActivate(!notifyOnActivate)}
              >
                <View style={[
                  styles.checkbox,
                  notifyOnActivate && styles.checkboxChecked,
                ]}>
                  {notifyOnActivate && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.notifyText}>
                  {t('suggest.notify_toggle', { word: word })}
                </Text>
              </TouchableOpacity>
            )}

            {/* Threshold info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Schwelle: {threshold} Einreichungen zur Aktivierung
                {user?.is_verified && ' (Verifiziert: reduziert)'}
                {['supporter', 'expert', 'lobby'].includes(user?.membership_type || '') && ' (Mitgliedschaft: reduziert)'}
              </Text>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!isValidWord(word) || isSubmitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isValidWord(word) || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.submitButtonText}>{t('suggest.submit')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollView: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.black,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
  },
  inputSection: {
    marginBottom: 24,
    position: 'relative',
    zIndex: 10,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    paddingHorizontal: 20,
  },
  input: {
    flex: 1,
    height: 60,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  charCount: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginTop: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    maxHeight: 300,
    overflow: 'hidden',
  },
  dropdownLoading: {
    padding: 20,
    alignItems: 'center',
  },
  dropdownItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  dropdownWord: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 4,
  },
  dropdownStatusLive: {
    fontSize: 14,
    color: COLORS.yes,
  },
  dropdownStatusPending: {
    fontSize: 14,
    color: COLORS.gold,
  },
  dropdownEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  geoSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 12,
  },
  geoOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  geoOption: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
  },
  geoOptionSelected: {
    backgroundColor: COLORS.black,
  },
  geoOptionText: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  geoOptionTextSelected: {
    color: COLORS.white,
  },
  geoOptionDisabled: {
    color: COLORS.gray300,
  },
  notifyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  notifyText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray700,
  },
  infoBox: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.gray500,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: COLORS.black,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },

  // Result card styles
  resultCard: {
    backgroundColor: COLORS.gray100,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  resultIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 8,
  },
  resultWord: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.black,
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressBar: {
    height: 12,
    backgroundColor: COLORS.gray300,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  remainingText: {
    fontSize: 16,
    color: COLORS.gray700,
    marginBottom: 16,
  },
  notifyBadge: {
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  notifyBadgeText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  voteNowButton: {
    backgroundColor: COLORS.yes,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
  },
  voteNowButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  newSuggestionButton: {
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  newSuggestionButtonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '600',
  },
});
