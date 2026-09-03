import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { DemoBanner } from './demo/DemoBanner';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { EmployeeMasterView } from './components/employees/EmployeeMasterView';
import { EmployeeProfileLedgerView } from './components/employees/EmployeeProfileLedgerView';
import { ProjectMasterView } from './components/projects/ProjectMasterView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { TimesheetView } from './components/timesheets/TimesheetView';
import { CifUploadView } from './components/cif/CifUploadView';
import { PayrollView } from './components/payroll/PayrollView';
import { SalaryPaymentsView } from './components/payments/SalaryPaymentsView';
import { PaymentPlanningView } from './components/payments/PaymentPlanningView';
import { WPSRecoveryView } from './components/wps/WPSRecoveryView';
import { LoanManagementView } from './components/loans/LoanManagementView';
import { ReportsView } from './components/reports/ReportsView';
import { SalaryPayrollReportView } from './components/reports/SalaryPayrollReportView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { UserManagementView } from './components/users/UserManagementView';
import { ComplianceDashboardView } from './components/compliance/ComplianceDashboardView';
import { DocumentRepositoryView } from './components/documents/DocumentRepositoryView';
import { useIdleTimer, IDLE_TIMEOUT_MS, WARNING_DURATION_MS } from './hooks/useIdleTimer';
import { IdleTimeoutModal } from './components/common/IdleTimeoutModal';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading, isDemoMode, logout } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [viewParams, setViewParams] = useState<Record<string, any>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 15-minute idle timeout for security compliance with 60-second warning countdown
  const { isWarningOpen, remainingSeconds, resetTimer } = useIdleTimer({
    timeoutMs: IDLE_TIMEOUT_MS, // 15 minutes = 900,000 ms
    warningMs: WARNING_DURATION_MS, // 60 seconds warning modal
    onTimeout: logout,
    enabled: isAuthenticated,
  });

  const handleNavigate = (view: string, params?: Record<string, any>) => {
    setViewParams(params || {});
    setCurrentView(view);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-400">Initializing Secure Cloud Payroll System...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={handleNavigate} />;
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
      case 'projects':
        return <ProjectMasterView />;
      case 'attendance':
        return <AttendanceView initialMonth={viewParams.month} />;
      case 'timesheets':
        return <TimesheetView />;
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
        return <LoanManagementView />;
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
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans antialiased text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={(view) => handleNavigate(view)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {isDemoMode && <DemoBanner />}
        <Header
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNavigate={handleNavigate}
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
