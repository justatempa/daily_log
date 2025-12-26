'use client';

import { useMemo, useState } from 'react';

interface HeaderProps {
  currentDate: Date;
  onSetToken?: () => void;
  onSaveToMemos?: () => void;
  onBackupConfig?: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
  onExport?: () => void;
  onSignOut?: () => void;
  isSavingToMemos?: boolean;
  isExporting?: boolean;
}

export default function Header({
  currentDate,
  onSetToken,
  onSaveToMemos,
  onBackupConfig,
  onBackup,
  onRestore,
  onExport,
  onSignOut,
  isSavingToMemos,
  isExporting,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const actions = useMemo<
    {
      label: string;
      icon: string;
      handler?: () => void;
      variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
      loading?: boolean;
    }[]
  >(
    () =>
      [
        {
          label: '配置 Token',
          icon: 'fa-key',
          handler: onSetToken,
          variant: 'neutral' as const,
        },
        {
          label: '同步 Memos',
          icon: 'fa-cloud-upload-alt',
          handler: onSaveToMemos,
          variant: 'success' as const,
          loading: isSavingToMemos,
        },
        {
          label: '导出记录',
          icon: 'fa-file-export',
          handler: onExport,
          variant: 'primary' as const,
          loading: isExporting,
        },
        {
          label: '备份配置',
          icon: 'fa-tools',
          handler: onBackupConfig,
          variant: 'neutral' as const,
        },
        {
          label: '立即备份',
          icon: 'fa-save',
          handler: onBackup,
          variant: 'warning' as const,
        },
        {
          label: '恢复数据',
          icon: 'fa-undo-alt',
          handler: onRestore,
          variant: 'warning' as const,
        },
        {
          label: '退出登录',
          icon: 'fa-sign-out-alt',
          handler: onSignOut,
          variant: 'danger' as const,
        },
      ].filter((action) => Boolean(action.handler)),
    [
      onSetToken,
      onSaveToMemos,
      onExport,
      onBackupConfig,
      onBackup,
      onRestore,
      onSignOut,
      isSavingToMemos,
      isExporting,
    ]
  );

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.getDay()];
    return { year, month, day, weekday };
  };

  const { year, month, day, weekday } = formatDate(currentDate);

  return (
    <div className="card-elevated p-6 animate-fade-in">
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
              <i className="fas fa-calendar-alt text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-dark">日志记录</h1>
              <p className="text-sm text-neutral-500">记录每一天的精彩时刻</p>
            </div>
          </div>

          <div className="flex items-baseline gap-3 mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-primary-600">{day}</span>
              <span className="text-lg text-neutral-500">
                {year}.{month}
              </span>
            </div>
            <div className="px-3 py-1 rounded-lg bg-primary-50 text-primary-600 text-sm font-medium">
              {weekday}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-10 h-10 rounded-xl bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
            aria-label="功能菜单"
          >
            <i className={`fas ${menuOpen ? 'fa-times' : 'fa-ellipsis-v'} text-neutral-700`}></i>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 w-48 card-elevated p-2 z-50 animate-scale-in">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={action.loading}
                  onClick={() => {
                    if (action.loading) return;
                    action.handler?.();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i
                    className={`fas ${
                      action.loading ? 'fa-spinner fa-spin' : action.icon
                    } text-neutral-500 w-4`}
                  ></i>
                  <span className="text-sm text-neutral-700">{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
