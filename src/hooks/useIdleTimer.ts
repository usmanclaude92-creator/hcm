import { useEffect, useRef, useState, useCallback } from 'react';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const WARNING_DURATION_MS = 60 * 1000; // 60 seconds warning dialog before logout
export const STORAGE_KEY_LAST_ACTIVITY = 'hcms_last_activity_timestamp';
export const STORAGE_KEY_LOGOUT_REASON = 'hcms_idle_logout_reason';

interface UseIdleTimerOptions {
  timeoutMs?: number;
  warningMs?: number;
  onTimeout: () => void;
  enabled?: boolean;
}

export interface UseIdleTimerReturn {
  isWarningOpen: boolean;
  remainingSeconds: number;
  resetTimer: () => void;
  extendSession: () => void;
}

export function useIdleTimer({
  timeoutMs = IDLE_TIMEOUT_MS,
  warningMs = WARNING_DURATION_MS,
  onTimeout,
  enabled = true,
}: UseIdleTimerOptions): UseIdleTimerReturn {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(Math.ceil(warningMs / 1000));

  const lastActivityRef = useRef<number>(Date.now());
  const throttleThrottleRef = useRef<number>(0);
  const onTimeoutRef = useRef(onTimeout);

  // Keep latest onTimeout callback reference
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Read last activity timestamp from local storage or memory
  const getLastActivity = useCallback((): number => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return Math.max(parsed, lastActivityRef.current);
        }
      }
    } catch {
      // Fall back to memory ref if storage unavailable
    }
    return lastActivityRef.current;
  }, []);

  // Update last activity in local storage & memory
  const recordActivity = useCallback((force = false) => {
    const now = Date.now();
    // Throttle high-frequency events (e.g. mouse movement) to once per 1.5 seconds
    if (!force && now - throttleThrottleRef.current < 1500) {
      return;
    }

    throttleThrottleRef.current = now;
    lastActivityRef.current = now;

    try {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, now.toString());
    } catch {
      // Ignore storage errors
    }

    // If warning was previously open and user performed user interaction, dismiss warning
    setIsWarningOpen(false);
  }, []);

  // Explicit user reset (e.g. clicking "Stay Logged In")
  const resetTimer = useCallback(() => {
    recordActivity(true);
    setIsWarningOpen(false);
    setRemainingSeconds(Math.ceil(warningMs / 1000));
  }, [recordActivity, warningMs]);

  useEffect(() => {
    if (!enabled) {
      setIsWarningOpen(false);
      return;
    }

    // Initialize activity timestamp on start
    recordActivity(true);

    // List of user interaction events to monitor
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'wheel',
      'click',
    ];

    const handleUserActivity = () => {
      // Only record activity if warning modal is not currently prompting user
      // (or let active interaction dismiss the warning)
      recordActivity(false);
    };

    // Attach passive event listeners to window
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    // Cross-tab synchronization: when user is active in another tab, update here
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_LAST_ACTIVITY && e.newValue) {
        const val = parseInt(e.newValue, 10);
        if (!isNaN(val)) {
          lastActivityRef.current = val;
          setIsWarningOpen(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Visibility change: check immediately when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const lastActive = getLastActivity();
        const elapsed = Date.now() - lastActive;
        if (elapsed >= timeoutMs) {
          try {
            sessionStorage.setItem(
              STORAGE_KEY_LOGOUT_REASON,
              'You were automatically logged out after 15 minutes of inactivity for enhanced security.'
            );
          } catch {
            // Ignore storage error
          }
          onTimeoutRef.current();
        } else if (elapsed >= timeoutMs - warningMs) {
          const rem = Math.max(1, Math.ceil((timeoutMs - elapsed) / 1000));
          setIsWarningOpen(true);
          setRemainingSeconds(rem);
        } else {
          // Tab became visible within active threshold, record user engagement
          recordActivity(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic heartbeat check every 1 second
    const intervalId = setInterval(() => {
      const lastActive = getLastActivity();
      const elapsed = Date.now() - lastActive;
      const remainingMs = timeoutMs - elapsed;

      if (remainingMs <= 0) {
        clearInterval(intervalId);
        setIsWarningOpen(false);
        try {
          sessionStorage.setItem(
            STORAGE_KEY_LOGOUT_REASON,
            'You were automatically logged out after 15 minutes of inactivity for enhanced security.'
          );
        } catch {
          // Ignore storage error
        }
        onTimeoutRef.current();
      } else if (remainingMs <= warningMs) {
        const secLeft = Math.max(1, Math.ceil(remainingMs / 1000));
        setIsWarningOpen(true);
        setRemainingSeconds(secLeft);
      } else {
        setIsWarningOpen(false);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [enabled, timeoutMs, warningMs, getLastActivity, recordActivity]);

  return {
    isWarningOpen,
    remainingSeconds,
    resetTimer,
    extendSession: resetTimer,
  };
}
