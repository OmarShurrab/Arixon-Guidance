import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { WelcomeAuth } from './components/WelcomeAuth';
import { OnboardingModal } from './components/OnboardingModal';
import { Header } from './components/Header';
import { BottomNavigation } from './components/Navigation';
import { HomeDashboard } from './components/HomeDashboard';
import { ExamsView } from './components/ExamsView';
import { LeaderboardView } from './components/LeaderboardView';
import { ProfileView } from './components/ProfileView';
import { SettingsModal } from './components/SettingsModal';
import { AdminPanel } from './components/admin/AdminPanel';
import { Logo } from './components/Logo';
import { Loader2, AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { seedFirstExamIfMissing } from './lib/examService';
import type { NavigationTab, ExamAttempt } from './types';

function MainAppShell() {
  const { status, error, refreshProfile } = useAuth();
  const { isAdmin, isCheckingAdmin } = useAdmin();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminModeActive, setIsAdminModeActive] = useState<boolean>(() => {
    return window.location.hash === '#admin' || window.location.search.includes('admin=true');
  });

  // Cross-tab exam viewing state
  const [examInitialAttempt, setExamInitialAttempt] = useState<ExamAttempt | null>(null);
  const [examInitialViewMode, setExamInitialViewMode] = useState<'list' | 'results' | 'review'>('list');

  // URL hash sync for admin navigation
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setIsAdminModeActive(true);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Seed default Tawjihi 2009 Physics Exam into Firestore once user profile is ready
  useEffect(() => {
    if (status === 'authenticated') {
      seedFirstExamIfMissing().catch(err => {
        console.warn('Initial exam seeding notice:', err);
      });
    }
  }, [status]);

  const handleViewAttemptFromProfile = (attempt: ExamAttempt) => {
    setExamInitialAttempt(attempt);
    setExamInitialViewMode('results');
    setCurrentTab('exams');
  };

  const handleOpenAdmin = () => {
    window.location.hash = '#admin';
    setIsAdminModeActive(true);
  };

  const handleExitAdmin = () => {
    if (window.location.hash === '#admin') {
      history.replaceState(null, '', window.location.pathname);
    }
    setIsAdminModeActive(false);
  };

  // 1. Initializing / Loading Auth
  if (status === 'initializing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#090d16] text-slate-900 dark:text-slate-100 p-4 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Logo size="lg" showTagline />
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mt-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جارٍ التحقق من جلسة المصادقة والمزامنة...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated -> First visit welcome screen
  if (status === 'unauthenticated') {
    return <WelcomeAuth />;
  }

  // 3. Authenticated but first time (needs onboarding)
  if (status === 'needs_profile_setup') {
    return <OnboardingModal />;
  }

  // 4. Critical Error State
  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#090d16] text-slate-900 dark:text-slate-100 p-4 text-center transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-[#111625] p-8 rounded-3xl border border-red-200 dark:border-red-900/50 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold mb-2">تعذر تحميل بيانات الحساب</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            {error || 'حدث خطأ أثناء الاتصال بخدمة Firebase. يرجى إعادة المحاولة.'}
          </p>
          <button
            onClick={() => refreshProfile()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. Admin Panel Mode (Strict Authorization Check)
  if (isAdminModeActive) {
    if (isCheckingAdmin) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070a12] text-slate-900 dark:text-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جارٍ التحقق من الصلاحيات الإدارية...</span>
          </div>
        </div>
      );
    }

    if (!isAdmin) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#070a12] p-4 text-center">
          <div className="max-w-md w-full bg-white dark:bg-[#0c101c] p-8 rounded-3xl border border-red-200 dark:border-red-900/50 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              منطقة إدارية مقيدة
            </h2>
            <p className="text-xs text-slate-500">
              عذراً، هذا القسم مخصص حصرياً للمشرفين المعتمدين والموثقين بصلاحيات Firebase Custom Claims.
            </p>
            <button
              onClick={handleExitAdmin}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              العودة لواجهة الطالب
            </button>
          </div>
        </div>
      );
    }

    return <AdminPanel onExitAdmin={handleExitAdmin} />;
  }

  // 6. Authenticated with full student profile loaded
  return (
    <div className="min-h-screen bg-white dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-600 selection:text-white flex flex-col">
      {/* Top Header */}
      <Header 
        currentTab={currentTab} 
        onTabChange={(tab) => {
          if (tab !== 'exams') {
            setExamInitialAttempt(null);
            setExamInitialViewMode('list');
          }
          setCurrentTab(tab);
        }} 
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdmin={handleOpenAdmin}
      />

      {/* Main Tab View Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12">
        {currentTab === 'home' && <HomeDashboard onNavigate={setCurrentTab} />}
        {currentTab === 'exams' && (
          <ExamsView 
            initialAttempt={examInitialAttempt}
            initialViewMode={examInitialViewMode}
            onResetView={() => {
              setExamInitialAttempt(null);
              setExamInitialViewMode('list');
            }}
          />
        )}
        {currentTab === 'leaderboard' && <LeaderboardView />}
        {currentTab === 'profile' && (
          <ProfileView 
            onOpenSettings={() => setIsSettingsOpen(true)} 
            onViewAttempt={handleViewAttemptFromProfile}
            onOpenAdmin={handleOpenAdmin}
          />
        )}
      </main>

      {/* Bottom Navigation for Mobile */}
      <BottomNavigation 
        currentTab={currentTab} 
        onTabChange={(tab) => {
          if (tab !== 'exams') {
            setExamInitialAttempt(null);
            setExamInitialViewMode('list');
          }
          setCurrentTab(tab);
        }} 
      />

      {/* Global Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          onOpenAdmin={handleOpenAdmin}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AdminProvider>
          <MainAppShell />
        </AdminProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
