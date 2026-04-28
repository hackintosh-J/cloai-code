import React from 'react';
import emptyStateIcon from '@/assets/scheduled/empty-state.svg';
import filterIcon from '@/assets/scheduled/filter.svg';
import infoIcon from '@/assets/scheduled/info.svg';
import keepAwakeIcon from '@/assets/scheduled/keep-awake.svg';
import keepAwakeToggleIcon from '@/assets/scheduled/keep-awake-toggle.svg';
import searchIcon from '@/assets/scheduled/search.svg';

interface ScheduledPageProps {
  onNewTask: () => void;
}

const ScheduledPage: React.FC<ScheduledPageProps> = ({ onNewTask }) => {
  const handleSearch = () => {
    window.dispatchEvent(new CustomEvent('openSidebarSearch'));
  };

  return (
    <div className="scheduled-page flex-1 h-full overflow-y-auto">
      <div className="scheduled-shell">
        <div className="scheduled-header">
          <div className="scheduled-heading">
            <h1 className="scheduled-title">Scheduled tasks</h1>
            <p className="scheduled-subtitle">
              Run tasks on a schedule or whenever you need them. Type /schedule in any existing
              task to set one up.
            </p>
          </div>

          <div className="scheduled-toolbar" aria-label="Scheduled task controls">
            <button
              type="button"
              className="scheduled-icon-button"
              aria-label="Filter scheduled tasks"
            >
              <img src={filterIcon} alt="" width={19} height={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="scheduled-icon-button"
              aria-label="Search scheduled tasks"
              onClick={handleSearch}
            >
              <img src={searchIcon} alt="" width={23} height={23} aria-hidden="true" />
            </button>
            <button type="button" className="scheduled-new-task-button" onClick={onNewTask}>
              New task
            </button>
          </div>
        </div>

        <div className="scheduled-notice-card">
          <div className="scheduled-notice-copy">
            <img src={infoIcon} alt="" width={22} height={21} aria-hidden="true" />
            <span>Scheduled tasks only run while your computer is awake.</span>
          </div>

          <div className="scheduled-notice-actions">
            <img src={keepAwakeIcon} alt="" width={23} height={23} aria-hidden="true" />
            <span>Keep awake</span>
            <img src={keepAwakeToggleIcon} alt="" width={41} height={25} aria-hidden="true" />
          </div>
        </div>

        <div className="scheduled-empty-state">
          <img
            src={emptyStateIcon}
            alt=""
            width={102}
            height={117}
            className="scheduled-empty-icon"
            aria-hidden="true"
          />
          <p className="scheduled-empty-copy">No scheduled tasks yet.</p>
        </div>
      </div>
    </div>
  );
};

export default ScheduledPage;
