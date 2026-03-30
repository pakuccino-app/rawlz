// app/profile.tsx
// Optional User Profile with 3 tiers, Skip buttons, Trust bonus preview
// All fields voluntary with GDPR notice

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';

import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser } from '../lib/supabase';
import hapticPatterns from '../lib/haptics';

// Field definitions with trust bonuses
const TIER_1_FIELDS = [
  { key: 'age_group', label: 'Altersgruppe', bonus: 1, options: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] },
  { key: 'geo_city_size', label: 'Wohnortgröße', bonus: 1, options: ['<5.000', '5.000-20.000', '20.000-100.000', '100.000-500.000', '>500.000'] },
  { key: 'geo_type', label: 'Wohnumgebung', bonus: 1, options: ['Stadt', 'Vorstadt', 'Land'] },
];

const TIER_2_FIELDS = [
  { key: 'gender', label: 'Geschlecht', bonus: 2, options: ['Männlich', 'Weiblich', 'Divers', 'Keine Angabe'] },
  { key: 'education_level', label: 'Bildungsabschluss', bonus: 2, options: ['Hauptschule', 'Realschule', 'Abitur', 'Ausbildung', 'Bachelor', 'Master', 'Promotion'] },
  { key: 'political_lean', label: 'Politische Tendenz', bonus: 2, type: 'slider', min: 1, max: 5, labels: ['Links', 'Mitte', 'Rechts'] },
  { key: 'political_interest', label: 'Politisches Interesse', bonus: 2, options: ['Sehr gering', 'Gering', 'Mittel', 'Hoch', 'Sehr hoch'] },
];

const TIER_3_FIELDS = [
  { key: 'employment_status', label: 'Beschäftigungsstatus', bonus: 3, options: ['Angestellt', 'Selbständig', 'Beamte/r', 'Student/in', 'Rentner/in', 'Arbeitssuchend', 'Sonstiges'] },
  { key: 'employment_sector', label: 'Branche', bonus: 3, options: ['IT', 'Gesundheit', 'Bildung', 'Handel', 'Industrie', 'Öffentlicher Dienst', 'Sonstiges'] },
  { key: 'income_bracket', label: 'Einkommen (€/Monat)', bonus: 3, options: ['<1.500', '1.500-3.000', '3.000-5.000', '5.000-10.000', '>10.000'] },
  { key: 'voted_last_election', label: 'Letzte Wahl gewählt?', bonus: 3, options: ['Ja', 'Nein', 'Nicht wahlberechtigt'] },
  { key: 'is_org_member', label: 'Mitglied in Organisation?', bonus: 3, options: ['Ja', 'Nein'] },
];

const SUPPORTER_FIELDS = [
  { key: 'media_primary', label: 'Hauptmedienquelle', bonus: 2, options: ['TV', 'Zeitung', 'Social Media', 'Podcasts', 'Radio', 'Sonstiges'] },
  { key: 'smartphone_daily_h', label: 'Smartphone-Nutzung (Std/Tag)', bonus: 2, options: ['<1', '1-3', '3-5', '5-8', '>8'] },
  { key: 'uses_ai_tools', label: 'Nutzt KI-Tools?', bonus: 2, options: ['Ja, regelmäßig', 'Ja, gelegentlich', 'Nein'] },
  { key: 'housing_status', label: 'Wohnsituation', bonus: 2, options: ['Eigentum', 'Miete', 'WG', 'Bei Eltern', 'Sonstiges'] },
  { key: 'household_size', label: 'Haushaltsgröße', bonus: 2, options: ['1', '2', '3', '4', '5+'] },
  { key: 'has_children', label: 'Kinder?', bonus: 2, options: ['Ja', 'Nein'] },
];

const EXPERT_FIELDS = [
  { key: 'expert_field', label: 'Fachgebiet', bonus: 3, options: ['Wissenschaft', 'Medizin', 'Recht', 'Wirtschaft', 'Technik', 'Journalismus', 'Politik', 'Sonstiges'] },
  { key: 'expert_role', label: 'Position', bonus: 3, options: ['Junior', 'Senior', 'Lead', 'Manager', 'Direktor', 'Professor', 'Selbständig'] },
  { key: 'academic_degree', label: 'Akademischer Grad', bonus: 3, options: ['Keiner', 'Bachelor', 'Master', 'Diplom', 'Dr.', 'Prof. Dr.', 'Habil.'] },
];

const LOBBY_FIELDS = [
  { key: 'org_type', label: 'Organisationstyp', bonus: 3, options: ['Unternehmen', 'NGO', 'Verband', 'Behörde', 'Stiftung', 'Sonstiges'] },
  { key: 'org_sector', label: 'Sektor', bonus: 3, options: ['Wirtschaft', 'Politik', 'Soziales', 'Umwelt', 'Bildung', 'Gesundheit', 'Kultur'] },
  { key: 'org_size', label: 'Organisationsgröße', bonus: 3, options: ['1-10', '11-50', '51-200', '201-1000', '>1000'] },
  { key: 'org_geo_focus', label: 'Geografischer Fokus', bonus: 3, options: ['Lokal', 'Regional', 'National', 'EU', 'International'] },
  { key: 'org_use_case', label: 'RAWLZ Nutzung für', bonus: 3, options: ['Marktforschung', 'Stimmungsanalyse', 'Kampagnen', 'PR', 'Sonstiges'] },
];

interface UserProfile {
  [key: string]: any;
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [user, setUser] = useState<{ id: string; membership_type: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedTier, setExpandedTier] = useState<number | null>(1);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setIsLoading(true);
    try {
      const authUser = await getCurrentUser();
      if (!authUser) return;

      const { data } = await supabase
        .from('users')
        .select('id, membership_type, profile_data')
        .eq('id', authUser.id)
        .single();

      if (data) {
        setUser({ id: data.id, membership_type: data.membership_type });
        setProfile(data.profile_data || {});
      }
    } catch (error) {
      console.error('Load profile error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveField(key: string, value: any, bonus: number) {
    if (!user) return;

    setIsSaving(true);
    await hapticPatterns.tap();

    try {
      const newProfile = { ...profile, [key]: value };

      // Check if this field was previously empty (for trust bonus)
      const wasEmpty = !profile[key];

      await supabase
        .from('users')
        .update({ profile_data: newProfile })
        .eq('id', user.id);

      // Grant trust bonus if first time filling this field
      if (wasEmpty && value) {
        const { data: userData } = await supabase
          .from('users')
          .select('trust_score')
          .eq('id', user.id)
          .single();

        const newScore = (userData?.trust_score || 100) + bonus;

        await supabase
          .from('users')
          .update({ trust_score: newScore })
          .eq('id', user.id);

        await supabase.from('trust_score_history').insert({
          user_id: user.id,
          change_amount: bonus,
          reason: `profile_field_${key}`,
          new_score: newScore,
        });
      }

      setProfile(newProfile);
      await hapticPatterns.success();
    } catch (error) {
      console.error('Save field error:', error);
      await hapticPatterns.error();
    } finally {
      setIsSaving(false);
    }
  }

  function renderField(field: any) {
    const currentValue = profile[field.key];
    const isEmpty = !currentValue;

    if (field.type === 'slider') {
      return (
        <View key={field.key} style={styles.fieldContainer}>
          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            {isEmpty && <Text style={styles.bonusPreview}>+{field.bonus} Trust</Text>}
          </View>
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>{field.labels[0]}</Text>
            <Slider
              style={styles.slider}
              minimumValue={field.min}
              maximumValue={field.max}
              step={1}
              value={currentValue || 3}
              onSlidingComplete={(value: number) => saveField(field.key, value, field.bonus)}
              minimumTrackTintColor={COLORS.gold}
              maximumTrackTintColor={COLORS.gray200}
              thumbTintColor={COLORS.gold}
            />
            <Text style={styles.sliderLabel}>{field.labels[2]}</Text>
          </View>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => saveField(field.key, null, 0)}
          >
            <Text style={styles.skipButtonText}>{t('profile.skip')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View key={field.key} style={styles.fieldContainer}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          {isEmpty && <Text style={styles.bonusPreview}>+{field.bonus} Trust</Text>}
        </View>
        <View style={styles.optionsContainer}>
          {field.options.map((option: string) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                currentValue === option && styles.optionButtonSelected,
              ]}
              onPress={() => saveField(field.key, option, field.bonus)}
            >
              <Text style={[
                styles.optionButtonText,
                currentValue === option && styles.optionButtonTextSelected,
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => saveField(field.key, null, 0)}
        >
          <Text style={styles.skipButtonText}>{t('profile.skip')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderTier(tierNum: number, fields: any[], title: string, bonusPerField: number) {
    const isExpanded = expandedTier === tierNum;
    const filledCount = fields.filter(f => profile[f.key]).length;
    const totalBonus = filledCount * bonusPerField;

    return (
      <View style={styles.tierContainer}>
        <TouchableOpacity
          style={styles.tierHeader}
          onPress={() => setExpandedTier(isExpanded ? null : tierNum)}
        >
          <View>
            <Text style={styles.tierTitle}>{title}</Text>
            <Text style={styles.tierProgress}>
              {filledCount}/{fields.length} ausgefüllt (+{totalBonus} Trust)
            </Text>
          </View>
          <Text style={styles.tierArrow}>{isExpanded ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.tierContent}>
            {fields.map(renderField)}
          </View>
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.black} />
        </View>
      </SafeAreaView>
    );
  }

  const membershipType = user?.membership_type || 'basis';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('profile.title')}</Text>
        </View>

        {/* Privacy notice */}
        <View style={styles.privacyNotice}>
          <Text style={styles.privacyText}>
            {t('profile.privacy_notice')}
          </Text>
        </View>

        {/* Tier 1 - All users */}
        {renderTier(1, TIER_1_FIELDS, 'Stufe 1 - Grunddaten', 1)}

        {/* Tier 2 - All users */}
        {renderTier(2, TIER_2_FIELDS, 'Stufe 2 - Erweitert', 2)}

        {/* Tier 3 - All users */}
        {renderTier(3, TIER_3_FIELDS, 'Stufe 3 - Detailliert', 3)}

        {/* Supporter+ fields */}
        {['supporter', 'expert', 'lobby'].includes(membershipType) && (
          renderTier(4, SUPPORTER_FIELDS, 'Supporter+', 2)
        )}

        {/* Expert+ fields */}
        {['expert', 'lobby'].includes(membershipType) && (
          renderTier(5, EXPERT_FIELDS, 'Experte+', 3)
        )}

        {/* Lobby fields */}
        {membershipType === 'lobby' && (
          renderTier(6, LOBBY_FIELDS, 'Lobby', 3)
        )}

        {/* Saving indicator */}
        {isSaving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={COLORS.gold} />
            <Text style={styles.savingText}>Wird gespeichert...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  privacyNotice: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  privacyText: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  tierContainer: {
    marginBottom: 16,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    overflow: 'hidden',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tierProgress: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  tierArrow: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  tierContent: {
    padding: 20,
    paddingTop: 0,
  },
  fieldContainer: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.white,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bonusPreview: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '600',
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  optionButtonSelected: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  optionButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  optionButtonTextSelected: {
    color: COLORS.white,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    width: 50,
    textAlign: 'center',
  },
  skipButton: {
    marginTop: 12,
  },
  skipButtonText: {
    fontSize: 13,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 24,
  },
  savingText: {
    fontSize: 14,
    color: COLORS.gold,
    marginLeft: 8,
  },
});
