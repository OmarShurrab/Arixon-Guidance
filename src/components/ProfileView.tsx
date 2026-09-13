import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getUserExamHistory } from '../lib/examService';
import { EditProfileModal } from './EditProfileModal';
import type { ExamAttempt } from '../types';
import { 
  Award, 
  BookOpen, 
  CheckCircle2, 
  Percent, 
  Settings, 
  Edit3, 
  Lock, 
  MapPin, 
  Calendar, 
  MessageCircle,
  Mail,
  UserCheck,
  Eye,
  Clock,
  Sparkles,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';

interface ProfileViewProps {
  onOpenSettings: () => void;
  onViewAttempt?: (attempt: ExamAttempt) => void;
  onOpenAdmin?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ 
  onOpenSettings,
  onViewAttempt,
  onOpenAdmin,
}) => {
  const { profile } = useAuth();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [examHistory, setExamHistory] = useState<ExamAttempt[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const totalPoints = profile?.totalPoints ?? 0;
  const examsCompleted = profile?.examsCompleted ?? 0;
  const correctAnswers = profile?.correctAnswers ?? 0;
  const wrongAnswers = profile?.wrongAnswers ?? 0;
  const totalQuestions = correctAnswers + wrongAnswers;
  const accuracyFormatted = totalQuestions > 0 
    ? `${Math.round((correctAnswers / totalQuestions) * 100)}%` 
    : '0%';

  // Load real exam history from Firestore
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      if (!profile?.uid) return;
      setIsLoadingHistory(true);
      try {
        const history = await getUserExamHistory(profile.uid);
        if (isMounted) {
          setExamHistory(history);
        }
      } catch (err) {
        console.error('Error loading user exam history:', err);
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    }
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [profile?.uid]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'مؤخراً';
    const d = new Date(isoString);
    return d.toLocaleDateString('ar-JO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6 pb-24 md:pb-8 animate-fadeIn">
      {/* Top Banner Card */}
      <div 
        id="profile-header-card"
        className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] p-6 sm:p-8 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-right">
          {/* Avatar */}
          <div className="relative">
            <img
              src={profile?.photoURL || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Arixon1'}
              alt={profile?.username || 'User avatar'}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover border-2 border-blue-500/30 p-1 bg-slate-50 dark:bg-slate-800 shadow-md"
            />
            <div className="absolute -bottom-1 -left-1 p-1.5 rounded-xl bg-blue-600 text-white shadow-sm">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>

          {/* User Identifiers */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {profile?.displayName}
                </h1>
                <p className="text-sm font-mono text-blue-600 dark:text-blue-400 font-semibold mt-0.5" dir="ltr">
                  @{profile?.username}
                </p>
                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  <span>طالب توجيهي 2009 موثّق</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {isAdmin && onOpenAdmin && (
                  <button
                    id="profile-open-admin-btn"
                    onClick={onOpenAdmin}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                    <span>لوحة الإدارة</span>
                  </button>
                )}

                <button
                  id="profile-edit-btn"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل الملف الشخصي</span>
                </button>

                <button
                  id="profile-settings-btn"
                  onClick={onOpenSettings}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                  aria-label="الإعدادات"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Statistics Section */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
          إحصائيات الأداء التنافسي
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold">مجموع النقاط</span>
              <Award className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 dark:text-white">
              {totalPoints.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-400">نقطة مسجلة</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold">الاختبارات</span>
              <BookOpen className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-black font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 dark:text-white">
              {examsCompleted}
            </div>
            <span className="text-[10px] text-slate-400">امتحان منجز</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold">الإجابات الصحيحة</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 dark:text-white">
              {correctAnswers}
            </div>
            <span className="text-[10px] text-slate-400">سؤال صحيح</span>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold">نسبة الدقة</span>
              <Percent className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 dark:text-white">
              {accuracyFormatted}
            </div>
            <span className="text-[10px] text-slate-400">معدل الإجابات الصحيحة</span>
          </div>
        </div>
      </div>

      {/* "My Exams" (امتحاناتي) Section */}
      <div 
        id="my-exams-section"
        className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              امتحاناتي المنجزة ({examHistory.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            سجل الاختبارات المحفوظة
          </span>
        </div>

        {/* Loading */}
        {isLoadingHistory && (
          <div className="p-8 text-center text-xs text-slate-400">
            جاري تحميل سجل امتحاناتك...
          </div>
        )}

        {/* Real Exam History List */}
        {!isLoadingHistory && examHistory.length > 0 && (
          <div className="space-y-3">
            {examHistory.map((att) => {
              const score = att.score ?? 0;
              const dateFormatted = formatDate(att.submittedAt);

              return (
                <div
                  key={att.id}
                  id={`history-attempt-${att.id}`}
                  onClick={() => onViewAttempt && onViewAttempt(att)}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                        {att.examSubject || 'فيزياء'}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {dateFormatted}
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>مكتمل</span>
                      </span>
                    </div>

                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {att.examTitle || 'امتحان أريكسون'}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>الإجابات الصحيحة: {att.correctAnswers}</span>
                      <span>•</span>
                      <span>النقاط المكتسبة: +{att.pointsEarned}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-700/60">
                    <div className="text-left sm:text-right">
                      <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                        {score}%
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {score} / 100
                      </span>
                    </div>

                    <button
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مراجعة الحل</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty History State */}
        {!isLoadingHistory && examHistory.length === 0 && (
          <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs sm:text-sm space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              لم تقدم أي امتحانات بعد
            </p>
            <p className="text-xs text-slate-400">
              ابدأ الآن بأول امتحان تنافسي في الفيزياء لقياس فهمك لمفهومي الزخم الخطي والدفع وتجميع أولى نقاطك!
            </p>
          </div>
        )}
      </div>

      {/* Private Details Section */}
      <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              البيانات الخاصة المحمية
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-0.5 rounded-full border border-amber-200/50 dark:border-amber-900/50">
            مرئية لك فقط
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          هذه المعلومات سرية تماماً ولا تظهر للعامة أو في لوحة المتصدرين للحفاظ على أمان وخصوصية الطلبة.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-[11px] text-slate-400 block">البريد الإلكتروني المسجل</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                {profile?.email}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <span className="text-[11px] text-slate-400 block">المحافظة / المدينة</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {profile?.city || 'غير محددة'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <span className="text-[11px] text-slate-400 block">العمر</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {profile?.age ? `${profile.age} سنة` : 'غير محدد'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <MessageCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-[11px] text-slate-400 block">مجموعة واتساب</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                {profile?.whatsappGroup || 'غير مسجلة'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && <EditProfileModal onClose={() => setIsEditing(false)} />}
    </div>
  );
};
