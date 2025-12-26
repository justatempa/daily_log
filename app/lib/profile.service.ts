import { supabase } from './supabase';
import type { Database } from './database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * Get user profile
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No profile found
      return null;
    }
    console.error('Error fetching profile:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new profile
 */
export async function createProfile(
  userId: string,
  displayName?: string
): Promise<Profile> {
  const newProfile: ProfileInsert = {
    id: userId,
    display_name: displayName || null,
    timezone: 'Asia/Shanghai',
    quick_templates: {},
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert(newProfile)
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    throw error;
  }

  return data;
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  updates: Partial<ProfileUpdate>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }

  return data;
}

/**
 * Get or create profile (helper function)
 */
export async function getOrCreateProfile(
  userId: string,
  displayName?: string
): Promise<Profile> {
  let profile = await getProfile(userId);

  if (!profile) {
    profile = await createProfile(userId, displayName);
  }

  return profile;
}
