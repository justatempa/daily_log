import { supabase } from './supabase';
import type { Database } from './database.types';
import { getEntryTags, type TimelineTag } from './tags.service';

type Entry = Database['public']['Tables']['entries']['Row'];
type EntryInsert = Database['public']['Tables']['entries']['Insert'];
type EntryUpdate = Database['public']['Tables']['entries']['Update'];

export interface TimelineEntry {
  id: string;
  message: string;
  timestamp: string;
  pinned?: boolean;
  source?: 'manual' | 'quick' | 'import' | 'api';
  tags: TimelineTag[];
  status?: 'pending' | 'failed' | 'saved';
  optimisticId?: string;
  errorMessage?: string;
}

/**
 * Get all entries for a specific date
 */
export async function getEntriesByDate(
  userId: string,
  date: string
): Promise<TimelineEntry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', date)
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('Error fetching entries:', error);
    throw error;
  }

  const entries = data || [];

  if (entries.length === 0) {
    return [];
  }

  const entryIds = entries.map((entry) => entry.id);
  const { data: tagRows, error: tagError } = await supabase
    .from('entry_tags')
    .select('entry_id, tag:tags(id,label,category,color)')
    .in('entry_id', entryIds);

  if (tagError) {
    console.error('Error fetching entry tags:', tagError);
  }

  const tagMap = new Map<string, TimelineTag[]>();
  tagRows?.forEach((row) => {
    if (!row.tag) return;
    if (!tagMap.has(row.entry_id)) {
      tagMap.set(row.entry_id, []);
    }
    tagMap.get(row.entry_id)!.push({
      id: row.tag.id,
      label: row.tag.label,
      category: row.tag.category,
      color: row.tag.color,
    });
  });

  return entries.map((entry) => ({
    id: entry.id,
    message: entry.content,
    timestamp: entry.recorded_at,
    pinned: entry.pinned,
    source: entry.source,
    tags: tagMap.get(entry.id) ?? [],
    status: 'saved',
  }));
}

/**
 * Get all dates that have entries for a user
 */
export async function getRecordDates(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('entry_date')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching record dates:', error);
    throw error;
  }

  // Get unique dates
  const uniqueDates = [...new Set(data?.map((entry) => entry.entry_date) || [])];
  return uniqueDates;
}

/**
 * Create a new entry
 */
export async function createEntry(
  userId: string,
  date: string,
  message: string,
  source: 'manual' | 'quick' | 'import' | 'api' = 'manual'
): Promise<TimelineEntry> {
  const newEntry: EntryInsert = {
    user_id: userId,
    entry_date: date,
    content: message,
    source,
    recorded_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('entries')
    .insert(newEntry)
    .select()
    .single();

  if (error) {
    console.error('Error creating entry:', error);
    throw error;
  }

  return {
    id: data.id,
    message: data.content,
    timestamp: data.recorded_at,
    pinned: data.pinned,
    source: data.source,
    tags: [],
    status: 'saved',
  };
}

/**
 * Update an existing entry
 */
export async function updateEntry(
  entryId: string,
  message: string
): Promise<TimelineEntry> {
  const update: EntryUpdate = {
    content: message,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('entries')
    .update(update)
    .eq('id', entryId)
    .select()
    .single();

  if (error) {
    console.error('Error updating entry:', error);
    throw error;
  }

  const tags = await getEntryTags(entryId);

  return {
    id: data.id,
    message: data.content,
    timestamp: data.recorded_at,
    pinned: data.pinned,
    source: data.source,
    tags,
    status: 'saved',
  };
}

/**
 * Delete an entry
 */
export async function deleteEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', entryId);

  if (error) {
    console.error('Error deleting entry:', error);
    throw error;
  }
}

/**
 * Get entries for a date range (for export)
 */
export async function getEntriesByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)
    .order('entry_date', { ascending: true })
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('Error fetching entries by date range:', error);
    throw error;
  }

  return data || [];
}

/**
 * Toggle pin status of an entry
 */
export async function togglePinEntry(
  entryId: string,
  pinned: boolean
): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (error) {
    console.error('Error toggling pin:', error);
    throw error;
  }
}
