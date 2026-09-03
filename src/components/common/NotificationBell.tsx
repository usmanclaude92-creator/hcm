import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  RefreshCw,
  AlertTriangle,
  AlertOctagon,
  Clock,
  DollarSign,
  CalendarCheck,
  ChevronRight,
  CheckCircle2,
  FileWarning,
  Building2,
  User,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { SystemNotification, NotificationSummary } from '../../types/index';

interface NotificationBellProps {
  onNavigate?: (view: string, params?: Record<string, any>) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    total: 0,
    visaAlertsCount: 0,
    payrollApprovalsCount: 0,
    urgentCount: 0,
  });
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const storageKey = `hcms_read_notifications_${user?.id || 'guest'}`;
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [activeFilter, setActiveFilter] = useState<'all' | 'visa' | 'payroll'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Persist read IDs
  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        const storageKey = `hcms_read_notifications_${user?.id || 'guest'}`;
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error('Failed to persist read notifications', e);
      }
      return next;
    });
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    const next = new Set(allIds);
    setReadIds(next);
    try {
      const storageKey = `hcms_read_notifications_${user?.id || 'guest'}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.error('Failed to persist read notifications', e);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/notifications');
      if (res && res.notifications) {
        setNotifications(res.notifications);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Periodic polling every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;
  const unreadUrgentCount = notifications.filter(
    (n) => !readIds.has(n.id) && n.severity === 'urgent'
  ).length;

  const filteredNotifications = notifications.filter((item) => {
    if (activeFilter === 'visa' && item.category !== 'visa') return false;
    if (activeFilter === 'payroll' && item.category !== 'payroll' && item.category !== 'attendance') return false;
    if (unreadOnly && readIds.has(item.id)) return false;
    return true;
  });

  const handleNotificationClick = (item: SystemNotification) => {
    markAsRead(item.id);
    setIsOpen(false);
    if (onNavigate && item.action) {
      onNavigate(item.action.view, item.action.params);
    }
  };

  const getItemIcon = (item: SystemNotification) => {
    if (item.category === 'visa') {
      if (item.type === 'visa_expired' || item.severity === 'urgent') {
        return (
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-4 h-4" />
          </div>
        );
      }
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
      );
    }

    if (item.category === 'payroll') {
      if (item.type === 'payroll_revision') {
        return (
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
        );
      }
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <DollarSign className="w-4 h-4" />
        </div>
      );
    }

    // Attendance
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
        <CalendarCheck className="w-4 h-4" />
      </div>
    );
  };

  const getStatusBadge = (item: SystemNotification) => {
    if (item.type === 'visa_expired') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          Expired
        </span>
      );
    }
    if (item.type === 'visa_expiring') {
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
          item.severity === 'urgent'
            ? 'bg-rose-50 text-rose-700 border border-rose-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}>
          {item.daysRemaining !== undefined ? `${item.daysRemaining}d left` : 'Expiring Soon'}
        </span>
      );
    }
    if (item.type === 'payroll_draft') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Draft (Pending Approval)
        </span>
      );
    }
    if (item.type === 'payroll_revision') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          In Revision
        </span>
      );
    }
    if (item.type === 'attendance_approval') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          Submitted
        </span>
      );
    }
    return null;
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        id="notification-bell-btn"
        onClick={() => {
          const nextState = !isOpen;
          setIsOpen(nextState);
          if (nextState) {
            fetchNotifications();
          }
        }}
        className={`relative p-2 rounded-xl transition-all duration-150 border ${
          isOpen
            ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-inner'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
        }`}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        title="Notifications: Expiring Visas & Pending Payroll Approvals"
      >
        <Bell className="w-5 h-5" />

        {/* Unread Badge Counter */}
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full shadow-xs ${
              unreadUrgentCount > 0
                ? 'bg-rose-600 text-white ring-2 ring-white animate-pulse'
                : 'bg-amber-500 text-white ring-2 ring-white'
            }`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          id="notification-panel"
          className="absolute right-0 mt-2.5 w-84 sm:w-96 md:w-[420px] rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ maxHeight: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">Notifications & Alerts</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Expiring visas & pending payroll approvals
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchNotifications();
                }}
                className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
                  loading ? 'animate-spin text-amber-400' : ''
                }`}
                title="Refresh alerts"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mark Read</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{notifications.length} Total Alerts</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {unreadCount} Unread
                </span>
              )}
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 text-[11px]">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
              />
              <span>Unread only</span>
            </label>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex border-b border-slate-200 bg-white px-2 pt-1.5 gap-1">
            <button
              onClick={() => setActiveFilter('all')}
              className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-t-lg transition-colors flex items-center justify-center gap-1.5 border-b-2 ${
                activeFilter === 'all'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>All</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/80 text-slate-700 font-semibold">
                {notifications.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('visa')}
              className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-t-lg transition-colors flex items-center justify-center gap-1.5 border-b-2 ${
                activeFilter === 'visa'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Visas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                summary.visaAlertsCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary.visaAlertsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('payroll')}
              className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-t-lg transition-colors flex items-center justify-center gap-1.5 border-b-2 ${
                activeFilter === 'payroll'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>Payroll</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                summary.payrollApprovalsCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {summary.payrollApprovalsCount}
              </span>
            </button>
          </div>

          {/* List Area */}
          <div className="overflow-y-auto max-h-[380px] divide-y divide-slate-100 bg-slate-50/30">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center bg-white flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">All Caught Up!</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
                  {unreadOnly
                    ? 'No unread notifications matching this filter.'
                    : 'There are no expiring visas or pending payroll approvals at this time.'}
                </p>
                {unreadOnly && (
                  <button
                    onClick={() => setUnreadOnly(false)}
                    className="mt-3 text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    Show all notifications
                  </button>
                )}
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isRead = readIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 transition-all duration-150 cursor-pointer flex gap-3 group relative ${
                      isRead
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-amber-50/30 hover:bg-amber-50/70 border-l-3 border-amber-500'
                    }`}
                  >
                    {/* Visual Icon */}
                    {getItemIcon(item)}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-xs font-semibold leading-snug truncate ${
                          isRead ? 'text-slate-800' : 'text-slate-900 font-bold'
                        }`}>
                          {item.title}
                        </h4>
                        {getStatusBadge(item)}
                      </div>

                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>

                      {/* Metadata Chips */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        {item.metadata.employeeId && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                            <User className="w-3 h-3 text-slate-400" />
                            {item.metadata.employeeId}
                          </span>
                        )}
                        {item.metadata.company && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {item.metadata.company}
                          </span>
                        )}
                        {item.metadata.totalNetSalary !== undefined && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold font-mono">
                            OMR {Number(item.metadata.totalNetSalary).toFixed(3)}
                          </span>
                        )}
                        {item.metadata.totalEmployees !== undefined && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {item.metadata.totalEmployees} employees
                          </span>
                        )}
                      </div>

                      {/* Action trigger */}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1">
                          <span>{item.action?.label || 'View Details'}</span>
                          <ArrowRight className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform" />
                        </span>

                        {!isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(item.id);
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200/60 transition-colors"
                            title="Mark as read"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Footer Links */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px]">
            <button
              onClick={() => {
                setIsOpen(false);
                if (onNavigate) onNavigate('compliance', { tab: 'alerts' });
              }}
              className="text-slate-600 hover:text-indigo-600 font-medium px-2 py-1 rounded hover:bg-slate-200/50 transition-colors flex items-center gap-1"
            >
              <span>Compliance Center</span>
              <ChevronRight className="w-3 h-3" />
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                if (onNavigate) onNavigate('payroll');
              }}
              className="text-slate-600 hover:text-indigo-600 font-medium px-2 py-1 rounded hover:bg-slate-200/50 transition-colors flex items-center gap-1"
            >
              <span>Payroll Master</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
