import { BellRing } from 'lucide-react';
import type { Announcement } from '../types';

const AnnouncementModal = ({
  activeAnnouncement,
  unreadCount,
  isMarkingAnnouncementRead,
  onAnnouncementRead,
}: {
  activeAnnouncement: Announcement;
  unreadCount: number;
  isMarkingAnnouncementRead: boolean;
  onAnnouncementRead: () => void;
}) => {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1F1F1F] shadow-2xl border border-black/5 dark:border-white/10">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-white/10">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300 flex items-center justify-center shrink-0">
            <BellRing size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[18px] font-semibold text-gray-900 dark:text-white break-words">{activeAnnouncement.title}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              系统公告 · {activeAnnouncement.created_at?.slice(0, 16).replace('T', ' ') || ''}
            </p>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-700 dark:text-gray-200">
            {activeAnnouncement.content}
          </div>
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            点击右下角“已读”后，后续将不再重复弹出这条公告。
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-white/10">
          <div className="text-xs text-gray-400 dark:text-gray-500">
            {unreadCount > 1 ? `还有 ${unreadCount - 1} 条未读公告` : '暂无其他未读公告'}
          </div>
          <button
            onClick={onAnnouncementRead}
            disabled={isMarkingAnnouncementRead}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMarkingAnnouncementRead ? '处理中...' : '已读'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
