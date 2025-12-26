import { supabase } from './supabase';
import type { Database } from './database.types';

type TagTable = Database['public']['Tables']['tags']['Row'];

export interface TimelineTag {
  id: string;
  label: string;
  category: TagTable['category'];
  color?: string | null;
}

export async function getEntryTags(entryId: string): Promise<TimelineTag[]> {
  const { data, error } = await supabase
    .from('entry_tags')
    .select('tag:tags(id,label,category,color)')
    .eq('entry_id', entryId);

  if (error) {
    console.error('Error fetching tags for entry:', error);
    throw error;
  }

  return (
    data
      ?.map((row) => {
        if (!row.tag) return null;
        return {
          id: row.tag.id,
          label: row.tag.label,
          category: row.tag.category,
          color: row.tag.color,
        };
      })
      .filter((tag): tag is TimelineTag => Boolean(tag)) ?? []
  );
}

export async function addTagToEntry(
  userId: string,
  entryId: string,
  label: string
): Promise<TimelineTag[]> {
  const normalized = label.trim();
  if (!normalized) {
    throw new Error('标签不能为空');
  }

  const { data: existingTag, error: findError } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .ilike('label', normalized)
    .maybeSingle();

  if (findError && findError.code !== 'PGRST116') {
    console.error('Error finding existing tag:', findError);
    throw findError;
  }

  let tagId = existingTag?.id;

  if (!tagId) {
    const { data: insertedTag, error: insertError } = await supabase
      .from('tags')
      .insert({
        user_id: userId,
        label: normalized,
        category: 'custom',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating tag:', insertError);
      throw insertError;
    }

    tagId = insertedTag.id;
  }

  const { error: linkError } = await supabase
    .from('entry_tags')
    .upsert(
      { entry_id: entryId, tag_id: tagId },
      { onConflict: 'entry_id,tag_id' }
    );

  if (linkError) {
    console.error('Error linking tag to entry:', linkError);
    throw linkError;
  }

  return getEntryTags(entryId);
}

export async function getUserTags(userId: string): Promise<TimelineTag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id,label,category,color')
    .eq('user_id', userId)
    .order('label', { ascending: true });

  if (error) {
    console.error('Error fetching user tags:', error);
    throw error;
  }

  return data ?? [];
}
