// app/suggest.tsx
// Question suggestion screen with complete autocomplete

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Switch } from 'react-native';

import { COLORS, WORD_REGEX, WORD_MAX_LENGTH } from '../lib/constants';
import { supabase, getCurrentUser } from '../lib/supabase';
import hapticPatterns from '../lib/haptics';

interface AutocompleteItem {
  id: string;
  word: string;
  status: 'active' | 'pending';
  submission_count: number;
  relevance_threshold: number;
}

type GeoScope = 'global' | 'country' | 'region';

export default function SuggestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const [wordInput, setWordInput] = useState('#');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteItem[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedWord, setSelectedWord] = useState<AutocompleteItem | null>(null);
  const [geoScope, setGeoScope] = useState<GeoScope>('global');
  const [notifyOnActivate, setNotifyOnActivate] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLanguage, setUserLanguage] = useState('de');
  const [userGeoCountry, setUserGeoCountry] = useState<string | null>(null);
  const [userGeoRegion, setUserGeoRegion] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  
  // Submission result state
  const [showResult, setShowResult] = useState(false);
  const [resultQuestion, setResultQuestion] = useState<any>(null);

  const autocompleteDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    const user = await getCurrentUser();
    if (user) {
      setUserId(user.id);
      
      const { data } = await supabase
        .from('users')
        .select('language_code, geo_country, geo_region, is_verified')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setUserLanguage(data.language_code);
        setUserGeoCountry(data.geo_country);
        setUserGeoRegion(data.geo_region);
        setIsVerified(data.is_verified);
      }
    }
  }

  // Handle word input change with autocomplete
  function handleWordChange(text: string) {
    // Ensure # is always at the start and can't be removed
    if (!text.startsWith('#')) {
      text = '#' + text.replace(/#/g, '');
    }
    
    // Limit to max 28 chars (# + 27)
    if (text.length > WORD_MAX_LENGTH) {
      text = text.slice(0, WORD_MAX_LENGTH);
    }
    
    // Remove invalid characters
    const cleanText = '#' + text.slice(1).replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '');
    setWordInput(cleanText);
    setSelectedWord(null);
    
    // Debounce autocomplete (200ms)
    if (autocompleteDebounceRef.current) {
      clearTimeout(autocompleteDebounceRef.current);
    }
    
    if (cleanText.length > 1) {
      autocompleteDebounceRef.current = setTimeout(() => {
        fetchAutocomplete(cleanText);
      }, 200);
    } else {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
    }
  }

  async function fetchAutocomplete(query: string) {
    setIsLoading(true);
    try {
      // Server-side query on active+pending only (INV-20)
      const { data } = await supabase
        .from('questions')
        .select('id, word, status, submission_count, relevance_threshold')
        .in('status', ['active', 'pending'])
        .ilike('word', `${query}%`)
        .eq('language_code', userLanguage)
        .order('status', { ascending: true }) // active first
        .order('submission_count', { ascending: false })
        .limit(8);

      setAutocompleteResults(data || []);
      setShowAutocomplete((data || []).length > 0);
    } catch (error) {
      console.error('Autocomplete error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function selectAutocompleteItem(item: AutocompleteItem) {
    hapticPatterns.tap();
    setWordInput(item.word);
    setSelectedWord(item);
    setShowAutocomplete(false);
    Keyboard.dismiss();
  }

  async function handleSubmit() {
    if (!userId || wordInput.length < 2) return;
    
    // Validate word format
    if (!WORD_REGEX.test(wordInput)) {
      hapticPatterns.error();
      return;
    }

    setIsSubmitting(true);
    try {
      await hapticPatterns.tap();

      // Check if it's an existing question
      const { data: existing } = await supabase
        .from('questions')
        .select('*')
        .eq('word', wordInput)
        .eq('language_code', userLanguage)
        .single();

      if (existing) {
        if (existing.status === 'active') {
          // Already live - show message
          setResultQuestion(existing);
          setShowResult(true);
          return;
        } else if (existing.status === 'pending') {
          // Increment submission count
          await supabase
            .from('questions')
            .update({ submission_count: existing.submission_count + 1 })
            .eq('id', existing.id);

          // Handle notification subscription
          if (notifyOnActivate) {
            await supabase.from('question_notification_requests').upsert({
              user_id: userId,
              question_id: existing.id,
            }, { onConflict: 'user_id,question_id' });
          }

          // Refresh question data
          const { data: updated } = await supabase
            .from('questions')
            .select('*')
            .eq('id', existing.id)
            .single();

          setResultQuestion(updated);
          setShowResult(true);
          await hapticPatterns.success();
          return;
        }
      }

      // Create new question
      const threshold = isVerified ? 30 : 50; // Supporters get lower threshold

      const { data: newQuestion, error } = await supabase
        .from('questions')
        .insert({
          word: wordInput,
          language_code: userLanguage,
          geo_scope: geoScope,
          geo_country: geoScope === 'country' ? userGeoCountry : null,
          geo_region: geoScope === 'region' ? userGeoRegion : null,
          status: 'pending',
          submission_count: 1,
          relevance_threshold: threshold,
          submitted_by: userId,
          submitted_by_verified: isVerified,
        })
        .select()
        .single();

      if (error) throw error;

      // Handle notification subscription
      if (notifyOnActivate && newQuestion) {
        await supabase.from('question_notification_requests').insert({
          user_id: userId,
          question_id: newQuestion.id,
        });
      }

      setResultQuestion(newQuestion);
      setShowResult(true);
      await hapticPatterns.success();

    } catch (error: any) {
      console.error('Submit error:', error);
      await hapticPatterns.error();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleVoteNow() {
    if (resultQuestion) {
      // Navigate to swipe screen with this question
      router.push({
        pathname: '/(tabs)',
        params: { questionId: resultQuestion.id },
      });
    }
  }

  function resetForm() {
    setWordInput('#');
    setSelectedWord(null);
    setShowResult(false);
    setResultQuestion(null);
    setNotifyOnActivate(false);
    inputRef.current?.focus();
  }

  // ========================
  // RENDER: Result Card
  // ========================
  if (showResult && resultQuestion) {
    const isActive = resultQuestion.status === 'active';
    const remaining = resultQuestion.relevance_threshold - resultQuestion.submission_count;
    const progressPct = Math.min(100, (resultQuestion.submission_count / resultQuestion.relevance_threshold) * 100);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.resultCard}>
            {isActive ? (
              <>
                <Text style={styles.resultIcon}>✅</Text>
                <Text style={styles.resultTitle}>{t('suggest.already_live')}</Text>
                <Text style={styles.resultWord}>{resultQuestion.word}</Text>
                <TouchableOpacity style={styles.voteNowButton} onPress={handleVoteNow}>
                  <Text style={styles.voteNowButtonText}>{t('suggest.vote_now')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.resultIcon}>✓</Text>
                <Text style={styles.resultTitle}>{t('suggest.success')}</Text>
                <Text style={styles.resultWord}>{resultQuestion.word}</Text>
                
                {/* Progress bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {resultQuestion.submission_count} / {resultQuestion.relevance_threshold}
                  </Text>
                </View>
                
                <Text style={styles.remainingText}>
                  {t('suggest.remaining', { count: Math.max(0, remaining) })}
                </Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.newSuggestionButton} onPress={resetForm}>
            <Text style={styles.newSuggestionButtonText}>
              {t('suggest.title')} →
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ========================
  // RENDER: Main Form
  // ========================
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('suggest.title')}</Text>

        {/* Word input */}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={wordInput}
            onChangeText={handleWordChange}
            placeholder={t('suggest.placeholder')}
            placeholderTextColor={COLORS.gray500}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={WORD_MAX_LENGTH}
          />
          {isLoading && (
            <ActivityIndicator style={styles.inputLoader} size="small" color={COLORS.gray500} />
          )}
        </View>

        {/* Character counter */}
        <Text style={styles.charCounter}>
          {wordInput.length - 1} / 27
        </Text>

        {/* Autocomplete dropdown */}
        {showAutocomplete && (
          <View style={styles.autocompleteContainer}>
            {autocompleteResults.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.autocompleteItem}
                onPress={() => selectAutocompleteItem(item)}
              >
                <Text style={styles.autocompleteWord}>{item.word}</Text>
                {item.status === 'active' ? (
                  <Text style={styles.autocompleteActive}>✅ {t('suggest.already_live').split('.')[0]}</Text>
                ) : (
                  <Text style={styles.autocompletePending}>
                    ⏳ {item.submission_count}/{item.relevance_threshold} — {t('suggest.remaining', { 
                      count: item.relevance_threshold - item.submission_count 
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Geo scope selector */}
        <Text style={styles.sectionTitle}>{t('suggest.geo_scope')}</Text>
        <View style={styles.geoOptions}>
          {(['global', 'country', 'region'] as GeoScope[]).map(scope => (
            <TouchableOpacity
              key={scope}
              style={[
                styles.geoOption,
                geoScope === scope && styles.geoOptionActive,
              ]}
              onPress={() => {
                hapticPatterns.tap();
                setGeoScope(scope);
              }}
            >
              <Text style={styles.geoOptionIcon}>
                {scope === 'global' && '🌍'}
                {scope === 'country' && '🏳️'}
                {scope === 'region' && '📍'}
              </Text>
              <Text style={[
                styles.geoOptionText,
                geoScope === scope && styles.geoOptionTextActive,
              ]}>
                {t(`feed_mode.${scope}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notification toggle - only for pending/new words */}
        {(!selectedWord || selectedWord.status === 'pending') && (
          <View style={styles.notifyContainer}>
            <View style={styles.notifyTextContainer}>
              <Text style={styles.notifyIcon}>🔔</Text>
              <Text style={styles.notifyText}>
                {t('suggest.notify_toggle', { word: wordInput })}
              </Text>
            </View>
            <Switch
              value={notifyOnActivate}
              onValueChange={(value) => {
                hapticPatterns.tap();
                setNotifyOnActivate(value);
              }}
              trackColor={{ false: COLORS.gray300, true: COLORS.black }}
            />
          </View>
        )}

        {/* Submit button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (wordInput.length < 2 || isSubmitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={wordInput.length < 2 || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.submitButtonText}>{t('suggest.submit')}</Text>
          )}
        </TouchableOpacity>
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
  },
  scrollContent: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gray300,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    height: 64,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
  },
  inputLoader: {
    marginLeft: 8,
  },
  charCounter: {
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 8,
    marginRight: 8,
  },
  autocompleteContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  autocompleteItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  autocompleteWord: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 4,
  },
  autocompleteActive: {
    fontSize: 12,
    color: COLORS.yes,
  },
  autocompletePending: {
    fontSize: 12,
    color: COLORS.gold,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 32,
    marginBottom: 16,
  },
  geoOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  geoOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.gray100,
  },
  geoOptionActive: {
    backgroundColor: COLORS.black,
  },
  geoOptionIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  geoOptionText: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '500',
  },
  geoOptionTextActive: {
    color: COLORS.white,
  },
  notifyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    padding: 16,
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
  },
  notifyTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  notifyIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  notifyText: {
    fontSize: 14,
    color: COLORS.gray700,
    flex: 1,
  },
  submitButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  // Result styles
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  resultCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  resultIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 8,
  },
  resultWord: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: COLORS.gray100,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: COLORS.gray700,
    fontWeight: '600',
    marginTop: 8,
  },
  remainingText: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 16,
    textAlign: 'center',
  },
  voteNowButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  voteNowButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  newSuggestionButton: {
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
  },
  newSuggestionButtonText: {
    fontSize: 16,
    color: COLORS.gray500,
  },
});
