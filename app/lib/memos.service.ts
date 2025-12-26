import { supabase } from './supabase';

const DEFAULT_MEMOS_HOST = 'https://memos.911250.xyz';

interface ExternalAccount {
  access_token: string | null;
  config: Record<string, unknown> | null;
}

export interface MemosCredentials {
  host: string;
  token: string | null;
}

const sanitizeHost = (host?: string) => {
  if (!host) return DEFAULT_MEMOS_HOST;
  return host.endsWith('/') ? host.slice(0, -1) : host;
};

export async function getMemosCredentials(
  userId: string
): Promise<MemosCredentials> {
  const { data, error } = await supabase
    .from('external_accounts')
    .select('access_token, config')
    .eq('user_id', userId)
    .eq('provider', 'memos')
    .maybeSingle<ExternalAccount>();

  if (error && error.code !== 'PGRST116') {
    console.error('Error loading memos credentials:', error);
    throw error;
  }

  const host =
    (data?.config && typeof data.config === 'object'
      ? (data.config as { host?: string }).host
      : undefined) || DEFAULT_MEMOS_HOST;

  return {
    host: sanitizeHost(host),
    token: data?.access_token || null,
  };
}

export async function saveMemosCredentials(
  userId: string,
  token: string,
  host?: string
): Promise<void> {
  const payload = {
    user_id: userId,
    provider: 'memos' as const,
    access_token: token,
    config: { host: sanitizeHost(host) },
  };

  const { error } = await supabase
    .from('external_accounts')
    .upsert(payload, { onConflict: 'user_id,provider' });

  if (error) {
    console.error('Error saving memos credentials:', error);
    throw error;
  }
}

export async function postMemoContent(
  userId: string,
  content: string
): Promise<void> {
  const { host, token } = await getMemosCredentials(userId);

  if (!token) {
    throw new Error('尚未设置 Memos Token');
  }

  const endpoint = `${sanitizeHost(host)}/api/v1/memos`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Memos 同步失败 (${response.status}): ${text || response.statusText}`
    );
  }
}

export { DEFAULT_MEMOS_HOST };
