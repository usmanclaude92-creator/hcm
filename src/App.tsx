import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { ForcePasswordChangeView } from './components/auth/ForcePasswordChangeView';
import { DemoBanner } from './demo/DemoBanner';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { EmployeeMasterView } from './components/employees/EmployeeMasterView';
import { EmployeeProfileLedgerView } from './components/employees/EmployeeProfileLedgerView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { CifUploadView } from './components/cif/CifUploadView';
import { PayrollView } from './components/payroll/PayrollView';
import { SalaryPaymentsView } from './components/payments/SalaryPaymentsView';
import { PaymentPlanningView } from './components/payments/PaymentPlanningView';
import { WPSRecoveryView } from './components/wps/WPSRecoveryView';
import { LoanManagementView } from './components/loans/LoanManagementView';
import { LeaveManagementView } from './components/leave/LeaveManagementView';
import { EndOfServiceView } from './components/gratuity/EndOfServiceView';
import { MasterDataContainer } from './components/masters/MasterDataContainer';
import { ReportsView } from './components/reports/ReportsView';
import { SalaryPayrollReportView } from './components/reports/SalaryPayrollReportView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { UserManagementView } from './components/users/UserManagementView';
import { ComplianceDashboardView } from './components/compliance/ComplianceDashboardView';
import { DocumentRepositoryView } from './components/documents/DocumentRepositoryView';
import { WorkforceDeploymentView } from './components/workforce/WorkforceDeploymentView';
import { useIdleTimer, IDLE_TIMEOUT_MS, WARNING_DURATION_MS } from './hooks/useIdleTimer';
import { IdleTimeoutModal } from './components/common/IdleTimeoutModal';
import { useTheme } from './hooks/useTheme';

// Keeps the current screen (and its params) alive across a browser refresh -- navigation
// here is in-memory React state with no URL routing, so without this a refresh always
// dropped the user back to the dashboard regardless of what they were looking at.
// sessionStorage (not localStorage) so it doesn't leak into a different tab/session, and
// it's read defensively since private-browsing or a disabled-storage setting can throw.
const NAV_STATE_KEY = 'hcms_nav_state';

function loadStoredNavState(): { view: string; params: Record<string, any> } {
  try {
    const raw = sessionStorage.getItem(NAV_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.view === 'string') {
        return { view: parsed.view, params: parsed.params || {} };
      }
    }
  } catch {
    // Storage unavailable or corrupted -- fall through to the default view.
  }
  return { view: 'dashboard', params: {} };
}

function storeNavState(view: string, params: Record<string, any>) {
  try {
    sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify({ view, params }));
  } catch {
    // Best-effort only -- losing this just means a refresh falls back to the dashboard.
  }
}

function clearStoredNavState() {
  try {
    sessionStorage.removeItem(NAV_STATE_KEY);
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, isDemoMode, mustChangePassword, logout } = useAuth();
  const initialNavState = React.useMemo(loadStoredNavState, []);
  const [currentView, setCurrentView] = useState(initialNavState.view);
  const [viewParams, setViewParams] = useState<Record<string, any>>(initialNavState.params);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Single source of truth for the theme, applied here -- above every early return -- so
  // the .dark class is set on the very first render no matter which screen shows first
  // (loading spinner, login, forced password change, or the authenticated app). Header
  // and LoginView receive it as props instead of each running their own useTheme()
  // instance, which would fight over document.documentElement's class on re-render.
  const { isDark, toggleTheme } = useTheme();

  // 15-minute idle timeout for security compliance with 60-second warning countdown
  const { isWarningOpen, remainingSeconds, resetTimer } = useIdleTimer({
    timeoutMs: IDLE_TIMEOUT_MS, // 15 minutes = 900,000 ms
    warningMs: WARNING_DURATION_MS, // 60 seconds warning modal
    onTimeout: logout,
    enabled: isAuthenticated,
  });

  const handleNavigate = (view: string, params?: Record<string, any>) => {
    const nextParams = params || {};
    setViewParams(nextParams);
    setCurrentView(view);
    storeNavState(view, nextParams);
  };

  // Wipe the remembered screen on logout -- otherwise the next login (possibly a
  // different user, on a shared machine) would land straight back on whatever screen
  // the previous session was viewing instead of the dashboard.
  React.useEffect(() => {
    if (!isAuthenticated) {
      clearStoredNavState();
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Initializing Secure Cloud Payroll System...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView isDark={isDark} toggleTheme={toggleTheme} />;
  }

  // The API refuses every endpoint except change-password for a restricted session, so
  // rendering the application here would only produce a wall of 403s.
  if (mustChangePassword) {
    return <ForcePasswordChangeView />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={handleNavigate} initialTab={viewParams?.tab} />;
      case 'employees':
        return (
          <EmployeeMasterView
            initialFilters={viewParams}
            onClearInitialFilters={() => setViewParams({})}
          />
        );
      case 'compliance':
        return (
          <ComplianceDashboardView
            initialTab={viewParams.tab}
            initialSearch={viewParams.search}
          />
        );
      case 'documents':
      case 'document-repository':
        return (
          <DocumentRepositoryView
            onNavigateToEmployee={(empId) => handleNavigate('employees', { search: empId })}
          />
        );
      case 'workforce':
        return <WorkforceDeploymentView />;
      case 'attendance':
        return <AttendanceView initialMonth={viewParams.month} />;
      case 'cif':
        return <CifUploadView />;
      case 'employee-ledger':
        return (
          <EmployeeProfileLedgerView
            initialEmployeeId={viewParams.employeeId || viewParams.search}
            onBack={() => handleNavigate('dashboard')}
          />
        );
      case 'payroll':
        return <PayrollView initialMonth={viewParams.month} />;
      case 'payments':
        return <SalaryPaymentsView />;
      case 'payment-planning':
        return <PaymentPlanningView />;
      case 'wps':
        return <WPSRecoveryView />;
      case 'loans':
        return <LoanManagementView initialOpenNewLoan={viewParams?.openNewLoan || viewParams?.initialOpenNewLoan} />;
      case 'leave':
        return (
          <LeaveManagementView
            initialTab={viewParams?.tab || viewParams?.initialTab}
            initialOpenModal={viewParams?.openModal || viewParams?.initialOpenModal}
          />
        );
      case 'gratuity':
        return <EndOfServiceView />;
      case 'master-data':
        return (
          <MasterDataContainer
            initialTab={viewParams?.tab}
            openCreateModal={viewParams?.openCreateModal}
          />
        );
      case 'reports':
        return <ReportsView />;
      case 'salary-payroll-report':
        return <SalaryPayrollReportView />;
      case 'audit':
        return <AuditLogsView />;
      case 'users':
        return <UserManagementView />;
      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col lg:flex-row font-sans antialiased text-slate-800 dark:text-slate-200 transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        currentViewParams={viewParams}
        onSelectView={(view, params) => handleNavigate(view, params)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {isDemoMode && <DemoBanner />}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNavigate={handleNavigate}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />
        <main className="flex-1 overflow-y-auto px-[2%] py-6 print:p-0">
          {renderView()}
        </main>
      </div>

      {/* 15-Minute Idle Inactivity Timeout Modal */}
      <IdleTimeoutModal
        isOpen={isWarningOpen}
        remainingSeconds={remainingSeconds}
        totalWarningSeconds={Math.round(WARNING_DURATION_MS / 1000)}
        onStayLoggedIn={resetTimer}
        onLogoutNow={logout}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
