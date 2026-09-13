import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Award,
  Phone,
  Mail,
  MapPin,
  Clock,
  BookOpen,
  PlusCircle,
  MinusCircle,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchAllStudents,
  toggleStudentDisabledState,
  adjustStudentPointsWithReason,
} from '../../lib/adminService';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { UserProfile, ExamAttempt } from '../../types';

export const AdminStudentsView: React.FC = () => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Selected Student Modal & Actions
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [studentAttempts, setStudentAttempts] = useState<ExamAttempt[]>([]);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);

  // Adjust Points Dialog State
  const [isAdjustPointsOpen, setIsAdjustPointsOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState<number>(10);
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Disable Student Dialog State
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [disableReason, setDisableReason] = useState<string>('');
  const [isTogglingDisable, setIsTogglingDisable] = useState(false);

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const list = await fetchAllStudents();
      setStudents(list);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const openStudentDetails = async (student: UserProfile) => {
    setSelectedStudent(student);
    setIsLoadingAttempts(true);
    try {
      const q = query(
        collection(db, 'attempts'),
        where('userId', '==', student.uid),
        orderBy('startedAt', 'desc')
      );
      const snap = await getDocs(q);
      const list: ExamAttempt[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<ExamAttempt, 'id'>) }));
      setStudentAttempts(list);
    } catch (err) {
      console.warn('Could not load student attempts:', err);
      setStudentAttempts([]);
    } finally {
      setIsLoadingAttempts(false);
    }
  };

  const handleAdjustPointsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!adjustReason.trim()) {
      alert('يرجى كتابة سبب تعديل النقاط بدقة للتوثيق والرقابة.');
      return;
    }
    if (adjustAmount === 0) {
      alert('مبلغ تعديل النقاط لا يمكن أن يكون صفراً.');
      return;
    }

    setIsAdjusting(true);
    try {
      const res = await adjustStudentPointsWithReason({
        studentId: selectedStudent.uid,
        studentName: selectedStudent.displayName || selectedStudent.username,
        amount: Number(adjustAmount),
        reason: adjustReason.trim(),
      });

      // Update local state
      setSelectedStudent({
        ...selectedStudent,
        totalPoints: res.newBalance,
      });
      await loadStudents();
      setIsAdjustPointsOpen(false);
      setAdjustReason('');
      alert(`تم تعديل نقاط الطالب بنجاح! الرصيد الجديد: ${res.newBalance} نقطة.`);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تعديل النقاط.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleToggleDisable = async () => {
    if (!selectedStudent) return;
    const isCurrentlyDisabled = (selectedStudent as any).accountDisabled;
    const willDisable = !isCurrentlyDisabled;

    if (willDisable && !disableReason.trim()) {
      alert('يرجى تحديد سبب تجميد أو تعطيل الحساب للرقابة الإدارية.');
      return;
    }

    setIsTogglingDisable(true);
    try {
      await toggleStudentDisabledState(
        selectedStudent.uid,
        selectedStudent.displayName || selectedStudent.username,
        willDisable,
        disableReason.trim() || 'إعادة تفعيل الحساب'
      );

      setSelectedStudent({
        ...selectedStudent,
        accountDisabled: willDisable,
      } as any);

      await loadStudents();
      setIsDisableOpen(false);
      setDisableReason('');
      alert(`تم ${willDisable ? 'تعطيل' : 'إعادة تفعيل'} الحساب بنجاح.`);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تغيير حالة الحساب.');
    } finally {
      setIsTogglingDisable(false);
    }
  };

  // Filter logic
  const filteredStudents = students.filter((s) => {
    if (selectedBranch !== 'all' && s.branch !== selectedBranch) return false;
    if (selectedCity !== 'all' && s.city !== selectedCity) return false;
    const isDisabled = (s as any).accountDisabled;
    if (selectedStatus === 'active' && isDisabled) return false;
    if (selectedStatus === 'disabled' && !isDisabled) return false;

    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase().trim();
      const matchName = s.displayName?.toLowerCase().includes(term);
      const matchUser = s.username?.toLowerCase().includes(term);
      const matchEmail = s.email?.toLowerCase().includes(term);
      const matchPhone = s.phone?.includes(term);
      const matchCity = s.city?.toLowerCase().includes(term);
      if (!matchName && !matchUser && !matchEmail && !matchPhone && !matchCity) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0c101c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>إدارة حسابات وبيانات الطلاب</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            متابعة نشاط الطلاب، أداء الامتحانات، الأرصدة والنقاط، والتحكم بالحسابات
          </p>
        </div>

        <div className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          إجمالي الطلاب: {students.length}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#0c101c] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، المعرف، الهاتف أو البريد..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs"
        >
          <option value="all">جميع الفروع الأكاديمية</option>
          <option value="scientific">الفرع العلمي</option>
          <option value="literary">الفرع الأدبي</option>
          <option value="industrial">الفرع الصناعي</option>
          <option value="entrepreneurship">فرع الريادة والأعمال</option>
        </select>

        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs"
        >
          <option value="all">جميع المحافظات الفلسطينية</option>
          <option value="غزة">غزة</option>
          <option value="خان يونس">خان يونس</option>
          <option value="رفح">رفح</option>
          <option value="شمال غزة">شمال غزة</option>
          <option value="دير البلح">دير البلح</option>
          <option value="القدس">القدس الشريف</option>
          <option value="رام الله والبيرة">رام الله والبيرة</option>
          <option value="نابلس">نابلس</option>
          <option value="الخليل">الخليل</option>
          <option value="جنين">جنين</option>
          <option value="طولكرم">طولكرم</option>
          <option value="قلقيلية">قلقيلية</option>
          <option value="بيت لحم">بيت لحم</option>
          <option value="أريحا">أريحا</option>
          <option value="سلفيت">سلفيت</option>
          <option value="طوباس">طوباس</option>
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs"
        >
          <option value="all">جميع الحالات</option>
          <option value="active">الحسابات النشطة</option>
          <option value="disabled">الحسابات المجمدة</option>
        </select>
      </div>

      {/* Students Table */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          جارٍ تحميل سجلات الطلاب من قاعدة البيانات...
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#0c101c] rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-8 space-y-2">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            لم يتم العثور على أي طلاب مطابقين
          </h3>
          <p className="text-xs text-slate-400">
            جرب تعديل مصطلح البحث أو إزالة الفلاتر المطبقة.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0c101c] rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-[#111625] text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-4">الطالب</th>
                  <th className="p-4">المحافظة والفرع</th>
                  <th className="p-4">الامتحانات المنجزة</th>
                  <th className="p-4">إجمالي النقاط</th>
                  <th className="p-4">حالة الحساب</th>
                  <th className="p-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredStudents.map((s) => {
                  const isDisabled = (s as any).accountDisabled;
                  return (
                    <tr
                      key={s.uid}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {s.displayName ? s.displayName.charAt(0) : 'S'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate">
                              {s.displayName || s.username}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {s.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="text-slate-700 dark:text-slate-300">
                          {s.city || 'فلسطين'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.branch || 'توجيهي'}
                        </div>
                      </td>

                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                        {s.examsCompleted || 0}
                      </td>

                      <td className="p-4">
                        <span className="font-black text-amber-600 dark:text-amber-400">
                          {s.totalPoints || 0}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400">نقطة</span>
                      </td>

                      <td className="p-4">
                        {isDisabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
                            مجمد
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                            نشط
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-left">
                        <button
                          onClick={() => openStudentDetails(s)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer"
                        >
                          عرض الملف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Details Inspection Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-[#0c101c] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-bold flex items-center justify-center text-base">
                  {selectedStudent.displayName ? selectedStudent.displayName.charAt(0) : 'S'}
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    {selectedStudent.displayName || selectedStudent.username}
                  </h2>
                  <p className="text-xs text-slate-400">UID: {selectedStudent.uid}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Profile details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#13192a] border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[10px] text-slate-400">رصيد النقاط</div>
                  <div className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                    {selectedStudent.totalPoints || 0}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#13192a] border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[10px] text-slate-400">الامتحانات</div>
                  <div className="text-base font-black text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedStudent.examsCompleted || 0}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#13192a] border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[10px] text-slate-400">المحافظة</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedStudent.city || 'غير محدد'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#13192a] border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[10px] text-slate-400">الفرع</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedStudent.branch || 'علمي'}
                  </div>
                </div>
              </div>

              {/* Administrative Action Bar */}
              <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-300">
                  إجراءات المشرف على حساب الطالب:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAdjustPointsOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>تعديل النقاط يدويًا</span>
                  </button>

                  <button
                    onClick={() => setIsDisableOpen(true)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                      (selectedStudent as any).accountDisabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>
                      {(selectedStudent as any).accountDisabled ? 'إعادة التفعيل' : 'تجميد الحساب'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Student Exam History */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>سجل محاولات الامتحانات للطالب</span>
                </h3>

                {isLoadingAttempts ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    جارٍ تحميل سجل محاولات الطالب...
                  </div>
                ) : studentAttempts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    لا توجد محاولات امتحانية مسجلة لهذا الطالب حتى الآن.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    {studentAttempts.map((att) => (
                      <div key={att.id} className="p-3 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {att.examTitle}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {att.submittedAt ? new Date(att.submittedAt).toLocaleString('ar-EG') : 'قيد التقدم'}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-black text-slate-900 dark:text-white">
                            {att.score || 0} / {att.totalPoints || 100}
                          </span>
                          <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {att.percentage || 0}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Dialog */}
      {isAdjustPointsOpen && selectedStudent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0c101c] w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>تعديل رصيد نقاط الطالب: {selectedStudent.displayName}</span>
            </h3>

            <form onSubmit={handleAdjustPointsSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  مقدار النقاط (يمكن إدخال قيمة موجبة للإضافة أو سالبة للخصم)
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  سبب التعديل (إلزامي للرقابة والتدقيق) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="مثال: مكافأة التميز في مسابقة الفيزياء الشهرية..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustPointsOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                >
                  {isAdjusting ? 'جارٍ الحفظ...' : 'تأكيد التعديل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disable / Freeze Account Dialog */}
      {isDisableOpen && selectedStudent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0c101c] w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-red-600 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              <span>
                {(selectedStudent as any).accountDisabled ? 'إعادة تفعيل الحساب' : 'تأكيد تجميد حساب الطالب'}
              </span>
            </h3>

            <p className="text-xs text-slate-500">
              {(selectedStudent as any).accountDisabled
                ? 'سيتمكن الطالب من الدخول مجدداً وتقديم الامتحانات.'
                : 'عند تجميد الحساب، لن يتمكن الطالب من تقديم الامتحانات أو استخدام ميزات المنصة.'}
            </p>

            {!(selectedStudent as any).accountDisabled && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  سبب التجميد الإداري *
                </label>
                <textarea
                  rows={2}
                  required
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  placeholder="اكتب سبب التجميد للتوثيق..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#13192a] text-xs"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDisableOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isTogglingDisable}
                onClick={handleToggleDisable}
                className={`px-4 py-1.5 rounded-xl text-white text-xs font-bold ${
                  (selectedStudent as any).accountDisabled ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              >
                {isTogglingDisable ? 'جارٍ التنفيذ...' : 'تأكيد الإجراء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
