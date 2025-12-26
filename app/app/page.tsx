'use client';

import { useState, useEffect, FormEvent } from 'react';
import Header from '@/components/Header';
import CalendarPanel from '@/components/CalendarPanel';
import TimelineList from '@/components/TimelineList';
import TimelineSkeleton from '@/components/TimelineSkeleton';
import QuickEntryPanel from '@/components/QuickEntryPanel';
import BottomComposer from '@/components/BottomComposer';
import AuthForm from '@/components/AuthForm';
import { useToast } from '@/components/ToastProvider';
import { useAuth } from '@/components/AuthProvider';
import {
  getEntriesByDate,
  getRecordDates,
  createEntry,
  updateEntry,
  deleteEntry,
  type TimelineEntry,
} from '@/lib/entries.service';
import { getHolidays, type Holiday } from '@/lib/holidays.service';
import {
  addTagToEntry,
  getUserTags,
  type TimelineTag,
} from '@/lib/tags.service';
import {
  DEFAULT_MEMOS_HOST,
  getMemosCredentials,
  postMemoContent,
  saveMemosCredentials,
} from '@/lib/memos.service';
import Modal from '@/components/Modal';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentEntries, setCurrentEntries] = useState<TimelineEntry[]>([]);
  const [recordDates, setRecordDates] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [memosHost, setMemosHost] = useState<string>(DEFAULT_MEMOS_HOST);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({ token: '', host: DEFAULT_MEMOS_HOST });
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tagModal, setTagModal] = useState<{ open: boolean; entryId: string | null }>({
    open: false,
    entryId: null,
  });
  const [tagLabel, setTagLabel] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const [availableTags, setAvailableTags] = useState<TimelineTag[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingMemos, setSyncingMemos] = useState(false);
  const [exportingRecords, setExportingRecords] = useState(false);
  const { showToast } = useToast();
  const { userId, isLoading: authLoading } = useAuth();

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Load entries when date changes or user logs in
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadEntries = async () => {
      try {
        setIsLoading(true);
        const dateString = formatDate(selectedDate);
        const entries = await getEntriesByDate(userId, dateString);
        setCurrentEntries(entries);
      } catch (error) {
        console.error('Error loading entries:', error);
        showToast('加载记录失败', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadEntries();
  }, [selectedDate, userId, showToast]);

  // Load record dates and tags when user logs in
  useEffect(() => {
    if (!userId) {
      setAvailableTags([]);
      return;
    }

    const loadRecordDates = async () => {
      try {
        const dates = await getRecordDates(userId);
        setRecordDates(dates);
      } catch (error) {
        console.error('Error loading record dates:', error);
      }
    };

    const loadTags = async () => {
      try {
        const tags = await getUserTags(userId);
        setAvailableTags(tags);
      } catch (error) {
        console.error('Error loading tags:', error);
      }
    };

    loadRecordDates();
    loadTags();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setMemosHost(DEFAULT_MEMOS_HOST);
      return;
    }

    const loadMemosSettings = async () => {
      try {
        const creds = await getMemosCredentials(userId);
        setMemosHost(creds.host);
      } catch (error) {
        console.error('Error loading memos settings:', error);
      }
    };

    loadMemosSettings();
  }, [userId]);

  // Load holidays (global + user specific)
  useEffect(() => {
    if (!userId) {
      setHolidays([]);
      return;
    }

    const loadHolidays = async () => {
      try {
        const data = await getHolidays('CN', userId);
        setHolidays(data);
      } catch (error) {
        console.error('Error loading holidays:', error);
      }
    };

    loadHolidays();
  }, [userId]);

  const addRecord = async (
    rawMessage: string,
    source: 'manual' | 'quick' = 'manual'
  ) => {
    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }

    const message = rawMessage.trim();
    if (!message) {
      showToast('内容不能为空', 'warning');
      return;
    }

    const optimisticId = `optimistic-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    const optimisticEntry: TimelineEntry = {
      id: optimisticId,
      optimisticId,
      message,
      timestamp: new Date().toISOString(),
      pinned: false,
      source,
      tags: [],
      status: 'pending',
    };

    setCurrentEntries((prev) => [...prev, optimisticEntry]);
    const dateString = formatDate(selectedDate);

    try {
      const savedEntry = await createEntry(userId, dateString, message, source);
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === optimisticId ? { ...savedEntry, status: 'saved' } : entry
        )
      );

      setRecordDates((prev) =>
        prev.includes(dateString) ? prev : [...prev, dateString]
      );
      showToast('记录已添加', 'success');
    } catch (error) {
      console.error('Error adding record:', error);
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === optimisticId
            ? {
                ...entry,
                status: 'failed',
                errorMessage: '发送失败，点击重试',
              }
            : entry
        )
      );
      showToast('添加记录失败', 'error');
    }
  };

  const refreshAvailableTags = async () => {
    if (!userId) return;
    try {
      const tags = await getUserTags(userId);
      setAvailableTags(tags);
    } catch (error) {
      console.error('Error refreshing tags:', error);
    }
  };

  const TAG_PREVIEW_COUNT = 12;
  const displayedTags = showAllTags
    ? availableTags
    : availableTags.slice(0, TAG_PREVIEW_COUNT);
  const canToggleTags = availableTags.length > TAG_PREVIEW_COUNT;

  const handleInlineEdit = async (id: string, message: string) => {
    const normalized = message.trim();
    if (!normalized) {
      showToast('内容不能为空', 'warning');
      throw new Error('Message cannot be empty');
    }

    try {
      const updatedEntry = await updateEntry(id, normalized);
      setCurrentEntries((prev) =>
        prev.map((entry) => (entry.id === id ? updatedEntry : entry))
      );
      showToast('记录已更新', 'success');
    } catch (error) {
      console.error('Error updating entry:', error);
      showToast('更新记录失败', 'error');
      throw error;
    }
  };

  const handleRetryEntry = async (id: string) => {
    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }

    const targetEntry = currentEntries.find((entry) => entry.id === id);
    if (!targetEntry) {
      return;
    }

    const normalized = targetEntry.message.trim();
    if (!normalized) {
      showToast('内容不能为空', 'warning');
      return;
    }

    setCurrentEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, status: 'pending', errorMessage: undefined }
          : entry
      )
    );

    const dateString = formatDate(selectedDate);

    try {
      const savedEntry = await createEntry(
        userId,
        dateString,
        normalized,
        targetEntry.source ?? 'manual'
      );
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...savedEntry, status: 'saved' } : entry
        )
      );
      setRecordDates((prev) =>
        prev.includes(dateString) ? prev : [...prev, dateString]
      );
      showToast('已重新发送', 'success');
    } catch (error) {
      console.error('Error retrying entry:', error);
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: 'failed',
                errorMessage: '重试失败，请稍后再试',
              }
            : entry
        )
      );
      showToast('重试失败', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这条记录吗？')) {
      try {
        await deleteEntry(id);
        setCurrentEntries((prev) => prev.filter((entry) => entry.id !== id));
        showToast('记录已删除', 'success');

        // Reload record dates to update calendar
        if (userId) {
          const dates = await getRecordDates(userId);
          setRecordDates(dates);
        }
      } catch (error) {
        console.error('Error deleting entry:', error);
        showToast('删除记录失败', 'error');
      }
    }
  };

  const openTagModal = (entryId: string) => {
    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }
    setTagModal({ open: true, entryId });
    setTagLabel('');
    setShowAllTags(false);
  };

  const handleTagSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || !tagModal.entryId) {
      showToast('请先登录', 'error');
      return;
    }

    const normalized = tagLabel.trim();
    if (!normalized) {
      showToast('标签不能为空', 'warning');
      return;
    }

    setTagSaving(true);
    try {
      const updatedTags = await addTagToEntry(userId, tagModal.entryId, normalized);
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === tagModal.entryId ? { ...entry, tags: updatedTags } : entry
        )
      );
      setTagModal({ open: false, entryId: null });
      setTagLabel('');
      showToast('标签已更新', 'success');
      await refreshAvailableTags();
    } catch (error) {
      console.error('Error adding tag:', error);
      showToast('添加标签失败', 'error');
    } finally {
      setTagSaving(false);
    }
  };

  const handleExistingTagClick = async (tag: TimelineTag) => {
    if (!userId || !tagModal.entryId) {
      showToast('请先登录', 'error');
      return;
    }

    setTagSaving(true);
    try {
      const updatedTags = await addTagToEntry(userId, tagModal.entryId, tag.label);
      setCurrentEntries((prev) =>
        prev.map((entry) =>
          entry.id === tagModal.entryId ? { ...entry, tags: updatedTags } : entry
        )
      );
      showToast(`已添加标签 #${tag.label}`, 'success');
      await refreshAvailableTags();
    } catch (error) {
      console.error('Error adding existing tag:', error);
      showToast('添加标签失败', 'error');
    } finally {
      setTagSaving(false);
    }
  };

  const handleExport = async () => {
    if (exportingRecords) return;

    if (currentEntries.length === 0) {
      showToast('今天没有记录可导出', 'warning');
      return;
    }

    setExportingRecords(true);

    let textToCopy = '';
    currentEntries.forEach((record) => {
      const formattedTime = new Date(record.timestamp).toLocaleString('zh-CN');
      textToCopy += `${formattedTime}: ${record.message}\n`;
    });

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('记录已复制到剪贴板', 'success');
    } catch (error) {
      console.error('Error copying entries:', error);
      showToast('复制失败，请重试', 'error');
    } finally {
      setExportingRecords(false);
    }
  };

  const handleSetMemosToken = () => {
    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }
    setTokenForm({
      token: '',
      host: memosHost || DEFAULT_MEMOS_HOST,
    });
    setTokenModalOpen(true);
  };

  const handleTokenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }

    const trimmedToken = tokenForm.token.trim();
    if (!trimmedToken) {
      showToast('Token 不能为空', 'warning');
      return;
    }

    const normalizedHost =
      tokenForm.host?.trim() || memosHost || DEFAULT_MEMOS_HOST;

    setTokenSaving(true);
    try {
      await saveMemosCredentials(userId, trimmedToken, normalizedHost);
      setMemosHost(normalizedHost);
      setTokenModalOpen(false);
      showToast('Memos Token 已保存', 'success');
    } catch (error) {
      console.error('Error saving Memos token:', error);
      showToast('保存 Token 失败', 'error');
    } finally {
      setTokenSaving(false);
    }
  };

  const closeTokenModal = () => {
    if (tokenSaving) return;
    setTokenModalOpen(false);
  };

  const closeTagModal = () => {
    if (tagSaving) return;
    setTagModal({ open: false, entryId: null });
    setTagLabel('');
  };

  const handleSaveToMemos = async () => {
    if (syncingMemos) return;

    if (!userId) {
      showToast('请先登录', 'error');
      return;
    }

    if (currentEntries.length === 0) {
      showToast('今天没有记录可同步', 'warning');
      return;
    }

    setSyncingMemos(true);

    const dateString = formatDate(selectedDate);
    const contentLines = currentEntries.map((entry, idx) => {
      const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const tagText =
        entry.tags && entry.tags.length
          ? ` ${entry.tags.map((tag) => `#${tag.label}`).join(' ')}`
          : '';
      return `${idx + 1}. [${time}] ${entry.message}${tagText}`;
    });
    const payload = `## ${dateString}\n\n${contentLines.join('\n')}`;

    try {
      await postMemoContent(userId, payload);
      showToast('已同步到 Memos', 'success');
    } catch (error) {
      console.error('Error posting to Memos:', error);
      showToast(
        error instanceof Error ? error.message : '同步到 Memos 失败',
        'error'
      );
    } finally {
      setSyncingMemos(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      showToast('已退出登录', 'success');
    } catch (error) {
      console.error('Error signing out:', error);
      showToast('退出登录失败', 'error');
    }
  };

  const handleComposerSend = (message: string) => addRecord(message, 'manual');
  const handleQuickSend = (message: string) => addRecord(message, 'quick');

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4F46E5] mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not logged in
  if (!userId) {
    return <AuthForm />;
  }

  return (
    <>
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <main className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 mb-28">
            {/* 左列：Header + Timeline */}
            <div className="flex flex-col gap-6">
              <Header
                currentDate={selectedDate}
                onSetToken={handleSetMemosToken}
                onSaveToMemos={handleSaveToMemos}
                onBackupConfig={() => showToast('备份配置功能待实现', 'info')}
                onBackup={() => showToast('备份功能待实现', 'info')}
                onRestore={() => showToast('恢复功能待实现', 'info')}
                onExport={handleExport}
                onSignOut={handleSignOut}
                isSavingToMemos={syncingMemos}
                isExporting={exportingRecords}
              />
              <section className="card-elevated p-6 overflow-hidden">
                <div
                  id="timeline"
                  className="max-h-[calc(100vh-400px)] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar"
                >
                  {isLoading ? (
                    <TimelineSkeleton />
                  ) : (
                    <TimelineList
                      entries={currentEntries}
                      onEdit={handleInlineEdit}
                      onDelete={handleDelete}
                      onAddTag={openTagModal}
                      onRetry={handleRetryEntry}
                    />
                  )}
                </div>
              </section>
            </div>

            {/* 右列：Calendar + QuickEntry */}
            <aside className="flex flex-col gap-6">
              <CalendarPanel
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                recordDates={recordDates}
                holidays={holidays}
              />
              <div className="card-elevated p-4">
                <QuickEntryPanel onSend={handleQuickSend} />
              </div>
            </aside>
          </main>
        </div>
      </div>

      <BottomComposer onSend={handleComposerSend} />

      <Modal
        open={tokenModalOpen}
        title="配置 Memos"
        description="保存 API Token 和 Memos 服务地址以便快速同步。"
        onClose={closeTokenModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeTokenModal}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              form="memos-token-form"
              disabled={tokenSaving}
              className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {tokenSaving ? '保存中...' : '保存设置'}
            </button>
          </>
        }
      >
        <form
          id="memos-token-form"
          onSubmit={handleTokenSubmit}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-dark">
              Memos Token
            </label>
            <input
              type="password"
              placeholder="请输入 API Token"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={tokenForm.token}
              onChange={(event) =>
                setTokenForm((prev) => ({ ...prev, token: event.target.value }))
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              你可以在 Memos 设置 -&gt; Preferences -&gt; Token 中创建。
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-dark">
              服务地址
            </label>
            <input
              type="text"
              placeholder={DEFAULT_MEMOS_HOST}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={tokenForm.host}
              onChange={(event) =>
                setTokenForm((prev) => ({ ...prev, host: event.target.value }))
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              例如：https://memos.xxx.com，默认为 {DEFAULT_MEMOS_HOST}
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        open={tagModal.open}
        title="添加标签"
        description="为当前记录补充一个标签，方便检索和聚合。"
        onClose={closeTagModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeTagModal}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              form="entry-tag-form"
              disabled={tagSaving}
              className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {tagSaving ? '保存中...' : '添加标签'}
            </button>
          </>
        }
      >
        {availableTags.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">点击选择已有标签：</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
              {displayedTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  disabled={tagSaving}
                  onClick={() => handleExistingTagClick(tag)}
                  className="px-2 py-1 text-xs rounded-full border border-secondary/50 text-primary hover:bg-primary/10"
                >
                  #{tag.label}
                </button>
              ))}
            </div>
            {canToggleTags && (
              <button
                type="button"
                onClick={() => setShowAllTags((prev) => !prev)}
                className="text-xs text-primary hover:text-primary/80"
              >
                {showAllTags ? '收起标签' : `展开全部 (${availableTags.length})`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            你还没有标签，先在下方创建一个吧。
          </p>
        )}

        <form
          id="entry-tag-form"
          onSubmit={handleTagSubmit}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-dark">
              标签名称
            </label>
            <input
              type="text"
              placeholder="例如：晨跑 / 阅读 / 心情"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={tagLabel}
              autoFocus
              onChange={(event) => setTagLabel(event.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              标签会自动保存并可在其它记录复用。
            </p>
          </div>
        </form>
      </Modal>
    </>
  );
}
