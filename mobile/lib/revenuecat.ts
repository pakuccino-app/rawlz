// lib/revenuecat.ts
// RevenueCat integration for Supporter purchases
import Purchases, { 
  PurchasesPackage,
  CustomerInfo,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { Platform, Alert } from 'react-native';
import { supabase, getCurrentUser } from './supabase';

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_placeholder';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || 'goog_placeholder';
const SUPPORTER_PRODUCT_ID = 'rawlz_supporter_onetime';

// German error messages for RevenueCat errors
const ERROR_MESSAGES: { [key: number]: string | null } = {
  [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR]: null, // Silent
  [PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR]: 'Zahlung wird verarbeitet.',
  [PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR]: 'restore', // Trigger restore
  [PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR]: 'App Store Problem. Bitte später versuchen.',
  [PURCHASES_ERROR_CODE.NETWORK_ERROR]: 'Keine Verbindung. Bitte Kauf wiederherstellen.',
  [PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR]: 'Käufe sind auf diesem Gerät nicht erlaubt.',
  [PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR]: 'Ungültiger Kauf. Bitte erneut versuchen.',
  [PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR]: 'Dieser Kauf wurde bereits verwendet.',
  [PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR]: 'Authentifizierungsfehler.',
  [PURCHASES_ERROR_CODE.UNKNOWN_ERROR]: 'Ein unbekannter Fehler ist aufgetreten.',
};

let isInitialized = false;

/**
 * Initialize RevenueCat with device hash as app user ID
 * Call this in App.tsx on app start
 */
export async function initRevenueCat(deviceHash: string): Promise<void> {
  if (isInitialized) return;

  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
    
    Purchases.configure({
      apiKey,
      appUserID: deviceHash,
    });

    isInitialized = true;
    console.log('RevenueCat initialized with user:', deviceHash);
  } catch (error) {
    console.error('RevenueCat init error:', error);
  }
}

/**
 * Get available packages (offerings)
 */
export async function getOfferings(): Promise<PurchasesPackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    
    if (offerings.current) {
      // Find supporter package
      const supporterPackage = offerings.current.availablePackages.find(
        pkg => pkg.product.identifier === SUPPORTER_PRODUCT_ID
      );
      return supporterPackage || offerings.current.availablePackages[0] || null;
    }
    
    return null;
  } catch (error) {
    console.error('Get offerings error:', error);
    return null;
  }
}

/**
 * Purchase Supporter (€1 one-time)
 * Returns true if successful
 */
export async function purchaseSupporter(): Promise<{
  success: boolean;
  error?: string;
  shouldRestore?: boolean;
}> {
  try {
    const supporterPackage = await getOfferings();
    
    if (!supporterPackage) {
      return { success: false, error: 'Produkt nicht verfügbar.' };
    }

    const { customerInfo } = await Purchases.purchasePackage(supporterPackage);
    
    // Check if user now has supporter entitlement
    if (customerInfo.entitlements.active['supporter']) {
      // Update local user state
      await syncSupporterStatus(customerInfo);
      return { success: true };
    }

    return { success: false, error: 'Kauf konnte nicht abgeschlossen werden.' };
  } catch (error: any) {
    const purchaseError = error as PurchasesError;
    const errorCode = purchaseError.code;
    const message = ERROR_MESSAGES[errorCode];

    if (message === null) {
      // User cancelled - silent
      return { success: false };
    }

    if (message === 'restore') {
      // Product already purchased - trigger restore
      return { success: false, shouldRestore: true };
    }

    return { success: false, error: message || 'Kauf fehlgeschlagen.' };
  }
}

/**
 * Restore purchases (for "Already purchased? Restore")
 */
export async function restoreSupporter(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    
    if (customerInfo.entitlements.active['supporter']) {
      await syncSupporterStatus(customerInfo);
      return { success: true };
    }

    return { success: false, error: 'Keine früheren Käufe gefunden.' };
  } catch (error: any) {
    console.error('Restore error:', error);
    return { success: false, error: 'Wiederherstellung fehlgeschlagen.' };
  }
}

/**
 * Check current supporter status
 */
export async function checkSupporterStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active['supporter'];
  } catch (error) {
    console.error('Check status error:', error);
    return false;
  }
}

/**
 * Sync supporter status with Supabase
 */
async function syncSupporterStatus(customerInfo: CustomerInfo): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;

    const isSupporter = !!customerInfo.entitlements.active['supporter'];
    
    if (isSupporter) {
      // Check if trust bonus already granted
      const { data: historyCheck } = await supabase
        .from('trust_score_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('reason', 'supporter_purchase')
        .maybeSingle();

      // Update user
      const updates: any = {
        membership_type: 'supporter',
        is_verified: true,
        supporter_since: new Date().toISOString(),
      };

      if (!historyCheck) {
        // Grant trust bonus (idempotent)
        const { data: userData } = await supabase
          .from('users')
          .select('trust_score')
          .eq('id', user.id)
          .single();

        updates.trust_score = (userData?.trust_score || 100) + 10;

        // Record in history
        await supabase.from('trust_score_history').insert({
          user_id: user.id,
          change_amount: 10,
          reason: 'supporter_purchase',
          new_score: updates.trust_score,
        });
      }

      await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      // Update pending questions threshold
      await supabase
        .from('questions')
        .update({ relevance_threshold: 30 })
        .eq('submitted_by', user.id)
        .eq('status', 'pending');

      // Grant badge
      await supabase.from('badges').upsert(
        { user_id: user.id, badge_type: 'supporter' },
        { onConflict: 'user_id,badge_type' }
      );
    }
  } catch (error) {
    console.error('Sync supporter error:', error);
  }
}

/**
 * Get customer info
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('Get customer info error:', error);
    return null;
  }
}
