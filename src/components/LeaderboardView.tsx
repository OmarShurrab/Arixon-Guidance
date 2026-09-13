import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchLeaderboard } from '../lib/firebase';
import type { LeaderboardEntry } from '../types';
import { Trophy, Medal, Award, Flame, Sparkles, Loader2 } from 'lucide-react';

export const LeaderboardView: React.FC = () => {
  const { profile, user } = useAuth();
  const [period, setPeriod] = useState<'all' | 'weekly' | 'monthly'>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    async function loadLeaderboard() {
      setIsLoading(true);
      try {
        const data = await fetchLeaderboard(period);
        if (isMounted) {
          // Flag current user
          const mapped = data.map((entry) => ({
            ...entry,
            isCurrentUser: user ? entry.uid === user.uid : false,
          }));
          setEntries(mapped);
        }
      } catch (err) {
        console.error('Leaderboard query error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadLeaderboard();
    return () => {
      isMounted = false;
    };
  }, [period, user]);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            لوحة الصدارة والتصنيف
          </h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
            جيل 2009
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          تنافس بنزاهة مع نخبة طلبة التوجيهي واصعد نحو القمة
        </p>
      </div>

      {/* Tabs: الترتيب العام / الأسبوعي / الشهري */}
      <div className="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-800 max-w-md">
        {[
          { id: 'all' as const, label: 'الترتيب العام' },
          { id: 'weekly' as const, label: 'الأسبوعي' },
          { id: 'monthly' as const, label: 'الشهري' },
        ].map((tab) => {
          const isActive = period === tab.id;
          return (
            <button
              key={tab.id}
              id={`leaderboard-tab-${tab.id}`}
              onClick={() => setPeriod(tab.id)}
              className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
          <span className="text-xs">جارٍ جلب الترتيب المباشر من قاعدة البيانات...</span>
        </div>
      )}

      {/* Empty State when no real scores exist yet */}
      {!isLoading && entries.length === 0 && (
        <div
          id="leaderboard-empty-state"
          className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] p-8 sm:p-12 text-center shadow-xs max-w-xl mx-auto my-4"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center text-amber-500">
            <Flame className="w-8 h-8 animate-pulse" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
            لسه ما في ترتيب، كن أول من يبدأ 🔥
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            لم يحصل أي طالب على نقاط في هذا التصنيف بعد. عند إكمال امتحانات الفيزياء وحل الاختبارات التنافسية، ستظهر أسماء المتصدرين الحقيقيين هنا تلقائياً!
          </p>

          {/* Current User Card indicator */}
          {profile && (
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-right">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={profile.photoURL || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Arixon1'}
                    alt={profile.username}
                    className="w-10 h-10 rounded-xl bg-white object-cover"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {profile.displayName}
                    </h4>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono" dir="ltr">
                      @{profile.username}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-xs text-slate-400 block">نقاطك الحالية</span>
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    {profile.totalPoints} نقطة
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Real Leaderboard List */}
      {!isLoading && entries.length > 0 && (
        <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#111625] overflow-hidden shadow-xs">
          {/* Table Header */}
          <div className="grid grid-cols-12 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-400">
            <div className="col-span-2 sm:col-span-1 text-center">المركز</div>
            <div className="col-span-7 sm:col-span-8">اسم المستخدم</div>
            <div className="col-span-3 text-left">النقاط</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {entries.map((entry) => {
              const isFirst = entry.rank === 1;
              const isSecond = entry.rank === 2;
              const isThird = entry.rank === 3;

              return (
                <div
                  key={entry.uid}
                  id={`leaderboard-row-${entry.uid}`}
                  className={`grid grid-cols-12 items-center px-4 sm:px-6 py-3.5 transition-colors ${
                    entry.isCurrentUser
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 border-r-4 border-r-blue-600'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  {/* Rank Column */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-center">
                    {isFirst ? (
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-sm">
                        1
                      </span>
                    ) : isSecond ? (
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-800 font-black text-xs">
                        2
                      </span>
                    ) : isThird ? (
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white font-black text-xs">
                        3
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        #{entry.rank}
                      </span>
                    )}
                  </div>

                  {/* Username & Avatar */}
                  <div className="col-span-7 sm:col-span-8 flex items-center gap-3">
                    <img
                      src={entry.photoURL || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Arixon1'}
                      alt={entry.username}
                      className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {entry.displayName || entry.username}
                        </span>
                        {entry.isCurrentUser && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white flex-shrink-0">
                            أنت
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-mono" dir="ltr">
                        @{entry.username}
                      </span>
                    </div>
                  </div>

                  {/* Points */}
                  <div className="col-span-3 text-left">
                    <span className="font-black text-sm sm:text-base font-['Plus_Jakarta_Sans',sans-serif] text-slate-900 dark:text-white">
                      {entry.points.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block">نقطة</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
