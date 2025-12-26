import { supabase } from './supabase';
import type { Database } from './database.types';

export type Holiday = Database['public']['Tables']['holidays']['Row'];

/**
 * Fetch holidays for a locale plus optional user-specific overrides.
 */
export async function getHolidays(
  locale = 'CN',
  userId?: string
): Promise<Holiday[]> {
  let query = supabase
    .from('holidays')
    .select('*')
    .eq('locale', locale);

  if (userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  } else {
    query = query.is('user_id', null);
  }

  const { data, error } = await query.order('holiday_date', {
    ascending: true,
  });

  if (error) {
    console.error('Error fetching holidays:', error);
    throw error;
  }

  return data ?? [];
}
