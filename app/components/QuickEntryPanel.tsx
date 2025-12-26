'use client';

import { useState } from 'react';

interface QuickEntryPanelProps {
  onSend: (message: string) => Promise<void> | void;
}

export default function QuickEntryPanel({ onSend }: QuickEntryPanelProps) {
  const [selectedWeather, setSelectedWeather] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<string[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<string[]>([]);
  const [selectedVitamin, setSelectedVitamin] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  const weatherOptions = ['晴', '阴', '雨', '雪', '雾', '风'];
  const moodOptions = ['开心', '平静', '焦虑', '烦躁', '难过', '兴奋'];
  const taskOptions = ['简单', '普通', '困难', '紧急', '繁杂', '重要'];
  const activityOptions = ['运动', '学习', '阅读', '会议', '休息', '娱乐', '通勤', '摄影', '开会'];
  const vitaminOptions = ['是', '否'];

  const toggleOption = (
    option: string,
    selected: string[],
    setSelected: (value: string[]) => void
  ) => {
    if (selected.includes(option)) {
      setSelected(selected.filter((item) => item !== option));
    } else {
      setSelected([...selected, option]);
    }
  };

  const hasSelection = () => {
    return (
      selectedWeather.length > 0 ||
      selectedMood.length > 0 ||
      selectedTask.length > 0 ||
      selectedActivity.length > 0 ||
      selectedVitamin.length > 0
    );
  };

  const handleSend = async () => {
    if (isSending || !hasSelection()) return;

    let message = '';
    if (selectedWeather.length > 0) {
      message += `天气##${selectedWeather.join(', ')}`;
    }
    if (selectedMood.length > 0) {
      message += (message ? '\n' : '') + `心情##${selectedMood.join(', ')}`;
    }
    if (selectedTask.length > 0) {
      message += (message ? '\n' : '') + `任务##${selectedTask.join(', ')}`;
    }
    if (selectedActivity.length > 0) {
      message += (message ? '\n' : '') + `活动##${selectedActivity.join(', ')}`;
    }
    if (selectedVitamin.length > 0) {
      message += (message ? '\n' : '') + `维生素##${selectedVitamin.join(', ')}`;
    }

    if (!message) return;

    // Reset selections immediately for a responsive experience
    setSelectedWeather([]);
    setSelectedMood([]);
    setSelectedTask([]);
    setSelectedActivity([]);
    setSelectedVitamin([]);

    try {
      setIsSending(true);
      await Promise.resolve(onSend(message));
    } finally {
      setIsSending(false);
    }
  };

  const renderOptions = (
    label: string,
    options: string[],
    selected: string[],
    setSelected: (value: string[]) => void
  ) => (
    <div className="flex items-center gap-1">
      <label className="text-[0.6rem] font-medium text-gray-700 w-8 flex-shrink-0">
        {label}
      </label>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggleOption(option, selected, setSelected)}
            className={`px-1 py-0.5 text-[0.6rem] rounded border transition-colors ${
              selected.includes(option)
                ? 'bg-[#4F46E5]/20 border-[#4F46E5]'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-1.5 flex-shrink-0" style={{ width: '220px' }}>
      <h3 className="text-[0.6rem] font-semibold text-[#1E293B] mb-1.5 flex items-center gap-1">
        <i className="fa fa-bolt text-[#4F46E5] text-xs"></i>
        快速输入
      </h3>

      <div className="space-y-1">
        {renderOptions('天气', weatherOptions, selectedWeather, setSelectedWeather)}
        {renderOptions('心情', moodOptions, selectedMood, setSelectedMood)}
        {renderOptions('任务', taskOptions, selectedTask, setSelectedTask)}
        {renderOptions('活动', activityOptions, selectedActivity, setSelectedActivity)}
        {renderOptions('维C', vitaminOptions, selectedVitamin, setSelectedVitamin)}

        <button
          onClick={handleSend}
          disabled={!hasSelection() || isSending}
          className="w-full bg-[#4F46E5] text-white px-2 py-1 rounded-md hover:bg-[#4F46E5]/90 transition-colors shadow-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed text-[0.6rem] mt-1.5"
        >
          <i className={`fa ${isSending ? 'fa-spinner fa-spin text-[0.5rem]' : 'fa-paper-plane text-[0.5rem]'}`}></i>
          <span>{isSending ? '发送中...' : '发送'}</span>
        </button>
      </div>
    </div>
  );
}
