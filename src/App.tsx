import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { EmployeeMasterView } from './components/employees/EmployeeMasterView';
import { ProjectMasterView } from './components/projects/ProjectMasterView';
import { AttendanceView } from './components/attendance/AttendanceView';
import { PayrollView } from './components/payroll/PayrollView';
import { SalaryPaymentsView } from './components/payments/SalaryPaymentsView';
import { PaymentPlanningView } from './components/payments/PaymentPlanningView';
import { WPSRecoveryView } from './components/wps/WPSRecoveryView';
import { LoanManagementView } from './components/loans/LoanManagementView';
import { ReportsView } from './components/reports/ReportsView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { UserManagementView } from './components/users/UserManagementView';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        return <DashboardView onNavigate={(view) => setCurrentView(view)} />;
      case 'employees':
        return <EmployeeMasterView />;
      case 'projects':
        return <ProjectMasterView />;
      case 'attendance':
        return <AttendanceView />;
      case 'payroll':
        return <PayrollView />;
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
      case 'audit':
        return <AuditLogsView />;
      case 'users':
        return <UserManagementView />;
      default:
        return <DashboardView onNavigate={(view) => setCurrentView(view)} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row font-sans antialiased text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        <Header
          currentView={currentView}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <main className="flex-1 overflow-y-auto px-[2%] py-6 print:p-0">
          {renderView()}
        </main>
      </div>
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
