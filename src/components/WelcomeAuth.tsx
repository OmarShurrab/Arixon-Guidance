import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Logo } from './Logo';
import { Sun, Moon, Sparkles, Trophy, Target, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

export const WelcomeAuth: React.FC = () => {
  const { signIn, error, clearError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      clearError();
      await signIn();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-white dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-600 selection:text-white">
      {/* Top Bar with Brand & Theme Toggle */}
      <header className="w-full max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <Logo size="md" />
        
        <button
          id="theme-toggle-welcome-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182032] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
        </button>
      </header>

      {/* Main Hero & Authentication Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md mx-auto">
          {/* Main Card */}
          <div 
            id="welcome-auth-card"
            className="rounded-3xl border border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-[#111625] shadow-xl shadow-slate-200/50 dark:shadow-black/60 p-6 sm:p-8 text-center"
          >
            {/* Tawjihi 2009 Tag */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>منصة التحدي التعليمي لجيل 2009</span>
            </div>

            {/* Wordmark & Tagline */}
            <h1 className="text-3xl sm:text-4xl font-black font-['Plus_Jakarta_Sans',sans-serif] tracking-tight text-slate-900 dark:text-white mb-1">
              ARIXON
            </h1>
            <p className="text-sm sm:text-base font-medium text-blue-600 dark:text-blue-400 font-['Plus_Jakarta_Sans',sans-serif] tracking-wider mb-2">
              Learn. Compete. Improve.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              سجّل دخولك وابدأ رحلتك نحو التفوّق في التوجيهي
            </p>

            {/* Error Message if Any */}
            {error && (
              <div 
                id="auth-error-alert" 
                className="mb-5 p-3.5 rounded-xl text-xs sm:text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-right"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Google Authentication Button */}
            <button
              id="google-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base shadow-lg shadow-blue-600/25 dark:shadow-blue-500/20 transition-all transform active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer mb-5"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جارٍ الاتصال بحساب Google...</span>
                </>
              ) : (
                <>
                  {/* Google G Logo SVG */}
                  <svg className="w-5 h-5 bg-white rounded-full p-0.5 flex-shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>تسجيل الدخول باستخدام Google</span>
                </>
              )}
            </button>

            {/* Feature Badges for First Glance */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs text-slate-600 dark:text-slate-400">
              <div className="flex flex-col items-center gap-1">
                <Target className="w-4 h-4 text-blue-500" />
                <span>امتحانات ذكية</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>تصنيف تنافسي</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>بيانات آمنة</span>
              </div>
            </div>
          </div>

          {/* Privacy Footnote */}
          <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-5">
            باستخدام المنصة، فإنك توافق على تجربة بيئة التنافس التعليمية في Arixon.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200/50 dark:border-slate-900">
        منصة Arixon التعليمية التنافسية © 2026 — مصممة لطلبة التوجيهي
      </footer>
    </div>
  );
};
