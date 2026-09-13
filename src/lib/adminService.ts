import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from 'firebase/firestore';
import { db, auth, sanitizeFirestoreData } from './firebase';
import type {
  AdminAuditLog,
  AdminAuditAction,
  QuestionBankItem,
  Announcement,
  Challenge,
  PointAdjustmentRecord,
  AdminSettings,
  Exam,
  Question,
  UserProfile,
  SubjectId,
  AiGeneratedQuestionDraft,
  AiGenerationJob,
  ExamTemplate,
  GenerationMode,
} from '../types';

export const PRIMARY_ADMIN_EMAIL = 'omarkingx99@gmail.com';

/**
 * Get current Firebase ID Token
 */
export async function getAuthToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
}

/**
 * Check if the current user has verified admin claims
 */
export async function checkUserAdminClaims(): Promise<{
  isAdmin: boolean;
  role: 'super_admin' | 'admin' | null;
  email: string | null;
  uid: string | null;
}> {
  const user = auth.currentUser;
  if (!user) {
    return { isAdmin: false, role: null, email: null, uid: null };
  }

  // Force token refresh to ensure custom claims are latest
  const tokenResult = await user.getIdTokenResult(false);
  const claims = tokenResult.claims;

  const isEmailPrimary = user.email?.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  const hasAdminClaim = claims.admin === true || claims.role === 'super_admin';

  if (hasAdminClaim || isEmailPrimary) {
    return {
      isAdmin: true,
      role: (claims.role as any) || (isEmailPrimary ? 'super_admin' : 'admin'),
      email: user.email,
      uid: user.uid,
    };
  }

  return {
    isAdmin: false,
    role: null,
    email: user.email,
    uid: user.uid,
  };
}

/**
 * Trigger backend bootstrap for Super Admin
 */
export async function bootstrapAdminBackend(): Promise<{ success: boolean; message?: string }> {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error('يرجى تسجيل الدخول أولاً.');

    const res = await fetch('/api/admin/bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'فشل الاتصال بالخادم لتهيئة صلاحيات الإدارة.');
    }

    // Force refresh client token to pick up new claims
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Admin Service] Bootstrap error:', err);
    throw err;
  }
}

/**
 * Record an Admin Audit Log entry (Tamper-proof, Append-Only)
 */
export async function recordAdminAuditLog(entry: {
  action: AdminAuditAction;
  targetType: 'exam' | 'question' | 'student' | 'announcement' | 'challenge' | 'settings' | 'security' | 'template';
  targetId: string;
  details: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const user = auth.currentUser;
  const adminId = user?.uid || 'system';
  const adminName = user?.displayName || 'Omar King X99';
  const adminEmail = user?.email || PRIMARY_ADMIN_EMAIL;

  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const rawLog: AdminAuditLog = {
    id: logId,
    adminId,
    adminName,
    adminEmail,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details,
    timestamp: now,
    metadata: entry.metadata || {},
  };

  const cleanLog = sanitizeFirestoreData(rawLog);

  try {
    // Write directly to Firestore adminAuditLogs collection
    const logDocRef = doc(db, 'adminAuditLogs', logId);
    await setDoc(logDocRef, cleanLog);
  } catch (err) {
    console.warn('[Audit Log] Failed to write audit log to Firestore:', err);
  }
}

/**
 * Fetch Recent Audit Logs
 */
export async function fetchAuditLogs(limitCount = 50): Promise<AdminAuditLog[]> {
  try {
    const logsRef = collection(db, 'adminAuditLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const logs: AdminAuditLog[] = [];
    snap.forEach((d) => logs.push(d.data() as AdminAuditLog));
    return logs;
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return [];
  }
}

// ==========================================
// 1. Exams Management
// ==========================================

export async function fetchAllAdminExams(): Promise<Exam[]> {
  try {
    const examsRef = collection(db, 'exams');
    const q = query(examsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const exams: Exam[] = [];
    snap.forEach((d) => exams.push({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }));
    return exams;
  } catch (err) {
    console.error('Error fetching admin exams:', err);
    return [];
  }
}

export async function saveExamWithValidation(
  examData: Omit<Exam, 'id'> & { id?: string },
  questions: Array<{
    id?: string;
    questionText: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
    difficulty: 'easy' | 'medium' | 'hard';
    source: string;
    points: number;
    order: number;
    questionType: 'multiple_choice' | 'true_false' | 'short_answer' | 'matching';
  }>
): Promise<string> {
  const isNew = !examData.id;
  const examId = examData.id || `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // If publishing, perform strict validation
  if (examData.published) {
    if (questions.length === 0) {
      throw new Error('لا يمكن نشر امتحان بدون إضافة أسئلة.');
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText || !q.questionText.trim()) {
        throw new Error(`السؤال رقم (${i + 1}) لا يحتوي على نص.`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`السؤال رقم (${i + 1}) يجب أن يحتوي على خيارين على الأقل.`);
      }
      if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) {
        throw new Error(`السؤال رقم (${i + 1}) لا يحتوي على إجابة نموذجية صحيحة محددة.`);
      }
      if (!q.explanation || !q.explanation.trim()) {
        throw new Error(`السؤال رقم (${i + 1}) يتطلب كتابة شرح تفصيلي لطريقة الحل.`);
      }
    }
    if ((examData.durationMinutes || 0) <= 0) {
      throw new Error('مدة الامتحان يجب أن تكون أكبر من صفر دقيقة.');
    }
    if ((examData.totalPoints || 0) <= 0) {
      throw new Error('مجموع علامات الامتحان يجب أن يكون أكبر من صفر.');
    }
  }

  // 1. Write exam document
  const examDocRef = doc(db, 'exams', examId);
  const cleanExam = sanitizeFirestoreData({
    ...examData,
    id: examId,
    questionCount: questions.length,
    updatedAt: now,
    createdAt: examData.createdAt || now,
    createdBy: examData.createdBy || auth.currentUser?.email || 'admin',
  });
  await setDoc(examDocRef, cleanExam, { merge: true });

  // 2. Write questions & protected answer keys subcollections
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qId = q.id || `q_${examId}_${i + 1}`;
    
    // Public question fields
    const publicQRef = doc(db, 'exams', examId, 'questions', qId);
    const publicData: Question = {
      id: qId,
      examId,
      order: i + 1,
      questionText: q.questionText,
      options: q.options,
      difficulty: q.difficulty,
      source: q.source || 'أريكسون 2009',
      points: q.points || 5,
      questionType: q.questionType || 'multiple_choice',
    };
    await setDoc(publicQRef, sanitizeFirestoreData(publicData));

    // Protected answer key (hidden from students)
    const keyRef = doc(db, 'exams', examId, 'answerKeys', qId);
    await setDoc(keyRef, {
      id: qId,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
    });
  }

  // 3. Record audit log
  await recordAdminAuditLog({
    action: isNew ? 'create_exam' : (examData.published ? 'publish_exam' : 'edit_exam'),
    targetType: 'exam',
    targetId: examId,
    details: `${isNew ? 'إنشاء' : 'تحديث'} امتحان: "${examData.title}" (${questions.length} أسئلة - ${examData.published ? 'منشور' : 'مسودة'})`,
  });

  return examId;
}

export async function setExamPublishStatus(examId: string, published: boolean, title: string): Promise<void> {
  const examDocRef = doc(db, 'exams', examId);
  const now = new Date().toISOString();
  await updateDoc(examDocRef, {
    published,
    status: published ? 'available' : 'coming_soon',
    updatedAt: now,
  });

  await recordAdminAuditLog({
    action: published ? 'publish_exam' : 'unpublish_exam',
    targetType: 'exam',
    targetId: examId,
    details: `${published ? 'نشر' : 'إلغاء نشر'} امتحان: "${title}"`,
  });
}

export async function archiveExam(examId: string, title: string): Promise<void> {
  const examDocRef = doc(db, 'exams', examId);
  const now = new Date().toISOString();
  await updateDoc(examDocRef, {
    published: false,
    status: 'closed',
    isArchived: true,
    updatedAt: now,
  });

  await recordAdminAuditLog({
    action: 'archive_exam',
    targetType: 'exam',
    targetId: examId,
    details: `أرشفة امتحان: "${title}"`,
  });
}

// ==========================================
// 2. Question Bank Management
// ==========================================

export async function fetchQuestionBank(filters?: {
  subject?: SubjectId;
  difficulty?: string;
  status?: string;
  search?: string;
}): Promise<QuestionBankItem[]> {
  try {
    const qCol = collection(db, 'questions');
    let q = query(qCol, orderBy('createdAt', 'desc'), limit(100));

    if (filters?.subject && filters.subject !== 'all') {
      q = query(qCol, where('subject', '==', filters.subject), limit(100));
    }

    const snap = await getDocs(q);
    const questions: QuestionBankItem[] = [];
    snap.forEach((d) => questions.push({ id: d.id, ...(d.data() as Omit<QuestionBankItem, 'id'>) }));

    let result = questions;
    if (filters?.difficulty && filters.difficulty !== 'all') {
      result = result.filter(q => q.difficulty === filters.difficulty);
    }
    if (filters?.status && filters.status !== 'all') {
      result = result.filter(q => q.status === filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.toLowerCase().trim();
      result = result.filter(q => 
        q.questionText.toLowerCase().includes(term) ||
        q.lesson?.toLowerCase().includes(term) ||
        q.topic?.toLowerCase().includes(term)
      );
    }

    return result;
  } catch (err) {
    console.error('Error fetching question bank:', err);
    return [];
  }
}

export async function saveQuestionBankItem(item: Omit<QuestionBankItem, 'id'> & { id?: string }): Promise<string> {
  const isNew = !item.id;
  const qId = item.id || `bank_q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const docRef = doc(db, 'questions', qId);
  const cleanData = sanitizeFirestoreData({
    ...item,
    id: qId,
    createdAt: item.createdAt || now,
    updatedAt: now,
    createdBy: item.createdBy || auth.currentUser?.email || 'admin',
    status: item.status || 'active',
  });

  await setDoc(docRef, cleanData, { merge: true });

  await recordAdminAuditLog({
    action: isNew ? 'add_question' : 'edit_question',
    targetType: 'question',
    targetId: qId,
    details: `${isNew ? 'إضافة سؤال لبنك الأسئلة' : 'تعديل سؤال في بنك الأسئلة'}: "${item.questionText.slice(0, 45)}..."`,
  });

  return qId;
}

export async function archiveQuestionBankItem(qId: string, questionText: string): Promise<void> {
  const docRef = doc(db, 'questions', qId);
  await updateDoc(docRef, {
    status: 'archived',
    updatedAt: new Date().toISOString(),
  });

  await recordAdminAuditLog({
    action: 'archive_question',
    targetType: 'question',
    targetId: qId,
    details: `أرشفة سؤال من بنك الأسئلة: "${questionText.slice(0, 40)}..."`,
  });
}

// ==========================================
// 3. Import Questions Pipeline
// ==========================================

export interface QuestionValidationRow {
  rowNumber: number;
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  subject: SubjectId;
  lesson: string;
  source: string;
  isValid: boolean;
  errors: string[];
}

export function validateQuestionImportRows(rows: any[]): {
  total: number;
  validCount: number;
  invalidCount: number;
  results: QuestionValidationRow[];
} {
  const results: QuestionValidationRow[] = [];

  rows.forEach((row, idx) => {
    const errors: string[] = [];
    const rowNumber = idx + 1;

    const questionText = (row.questionText || row.text || row['نص السؤال'] || '').trim();
    if (!questionText) errors.push('نص السؤال مفقود');

    let options: string[] = [];
    if (Array.isArray(row.options)) {
      options = row.options.map((o: any) => String(o).trim()).filter(Boolean);
    } else if (row.optionA || row['الخيار أ']) {
      options = [
        row.optionA || row['الخيار أ'],
        row.optionB || row['الخيار ب'],
        row.optionC || row['الخيار ج'],
        row.optionD || row['الخيار د'],
      ].filter(Boolean).map(s => String(s).trim());
    }

    if (options.length < 2) errors.push('الخيارات غير كافية (مطلوب خياران على الأقل)');

    let correctAnswer = 0;
    const rawAnswer = row.correctAnswer ?? row.correctOption ?? row['الإجابة الصحيحة'] ?? row.answer;
    if (typeof rawAnswer === 'number') {
      correctAnswer = rawAnswer;
    } else if (typeof rawAnswer === 'string') {
      const lower = rawAnswer.toLowerCase().trim();
      if (lower === 'a' || lower === 'أ') correctAnswer = 0;
      else if (lower === 'b' || lower === 'ب') correctAnswer = 1;
      else if (lower === 'c' || lower === 'ج') correctAnswer = 2;
      else if (lower === 'd' || lower === 'د') correctAnswer = 3;
      else if (!isNaN(Number(rawAnswer))) correctAnswer = Number(rawAnswer);
    }

    if (correctAnswer < 0 || correctAnswer >= options.length) {
      errors.push(`رقم الإجابة الصحيحة (${correctAnswer}) غير متطابق مع الخيارات المتاحة`);
    }

    const explanation = (row.explanation || row['التفسير'] || row['الشرح'] || 'شرح الإجابة النموذجية').trim();
    const difficulty: 'easy' | 'medium' | 'hard' = ['easy', 'medium', 'hard'].includes(row.difficulty) 
      ? row.difficulty 
      : 'medium';
    const points = Number(row.points) > 0 ? Number(row.points) : 5;
    const subject: SubjectId = row.subject || 'physics';
    const lesson = (row.lesson || row['الدرس'] || 'المنهاج العام').trim();
    const source = (row.source || row['المصدر'] || 'استيراد بنك الأسئلة').trim();

    const isValid = errors.length === 0;

    results.push({
      rowNumber,
      questionText,
      options,
      correctAnswer,
      explanation,
      difficulty,
      points,
      subject,
      lesson,
      source,
      isValid,
      errors,
    });
  });

  const validCount = results.filter(r => r.isValid).length;
  return {
    total: results.length,
    validCount,
    invalidCount: results.length - validCount,
    results,
  };
}

export async function batchImportValidQuestions(validRows: QuestionValidationRow[]): Promise<number> {
  let imported = 0;
  const now = new Date().toISOString();
  const adminEmail = auth.currentUser?.email || 'admin';

  for (const row of validRows) {
    if (!row.isValid) continue;

    const qId = `bank_import_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const item: QuestionBankItem = {
      id: qId,
      questionText: row.questionText,
      options: row.options,
      correctAnswer: row.correctAnswer,
      explanation: row.explanation,
      difficulty: row.difficulty,
      points: row.points,
      subject: row.subject,
      subjectNameAr: getSubjectNameAr(row.subject),
      lesson: row.lesson,
      source: row.source,
      questionType: 'multiple_choice',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: adminEmail,
    };

    const docRef = doc(db, 'questions', qId);
    await setDoc(docRef, sanitizeFirestoreData(item));
    imported++;
  }

  await recordAdminAuditLog({
    action: 'import_questions',
    targetType: 'question',
    targetId: `batch_${Date.now()}`,
    details: `استيراد دفعة أسئلة بنجاح: تم إضافة (${imported}) سؤالاً صالحاً إلى بنك الأسئلة.`,
  });

  return imported;
}

function getSubjectNameAr(sub: SubjectId): string {
  const map: Record<SubjectId, string> = {
    all: 'الكل',
    physics: 'الفيزياء',
    math: 'الرياضيات',
    arabic: 'اللغة العربية',
    chemistry: 'الكيمياء',
    biology: 'العلوم الحياتية',
    english: 'اللغة الإنجليزية',
    islamic: 'التربية الإسلامية',
    other: 'مبحث آخر',
  };
  return map[sub] || 'مبحث عام';
}

// ==========================================
// 4. Students Management & Point Adjustments
// ==========================================

export async function fetchAllStudents(limitCount = 100): Promise<UserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    const students: UserProfile[] = [];
    snap.forEach((d) => students.push(d.data() as UserProfile));
    return students;
  } catch (err) {
    console.error('Error fetching students:', err);
    return [];
  }
}

export async function toggleStudentDisabledState(
  studentUid: string,
  studentName: string,
  disabled: boolean,
  reason: string
): Promise<void> {
  const docRef = doc(db, 'users', studentUid);
  const now = new Date().toISOString();

  await updateDoc(docRef, {
    accountDisabled: disabled,
    disabledReason: disabled ? reason : null,
    disabledAt: disabled ? now : null,
    updatedAt: now,
  });

  await recordAdminAuditLog({
    action: disabled ? 'disable_student' : 'enable_student',
    targetType: 'student',
    targetId: studentUid,
    details: `${disabled ? 'تعطيل' : 'إعادة تفعيل'} حساب الطالب "${studentName}" - السبب: ${reason}`,
  });
}

export async function adjustStudentPointsWithReason(params: {
  studentId: string;
  studentName: string;
  amount: number;
  reason: string;
}): Promise<{ previousBalance: number; newBalance: number }> {
  const user = auth.currentUser;
  const adminId = user?.uid || 'admin';
  const adminName = user?.displayName || 'Omar King X99';
  const userDocRef = doc(db, 'users', params.studentId);

  let prev = 0;
  let next = 0;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userDocRef);
    if (!snap.exists()) {
      throw new Error('حساب الطالب غير موجود.');
    }

    const userData = snap.data() as UserProfile;
    prev = userData.totalPoints || 0;
    next = Math.max(0, prev + params.amount);

    transaction.update(userDocRef, {
      totalPoints: next,
      weeklyPoints: Math.max(0, (userData.weeklyPoints || 0) + params.amount),
      monthlyPoints: Math.max(0, (userData.monthlyPoints || 0) + params.amount),
      updatedAt: new Date().toISOString(),
    });
  });

  // Record pointAdjustment document
  const adjId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const adjRecord: PointAdjustmentRecord = {
    id: adjId,
    studentId: params.studentId,
    studentName: params.studentName,
    amount: params.amount,
    reason: params.reason,
    adminId,
    adminName,
    previousBalance: prev,
    newBalance: next,
    createdAt: now,
  };

  await setDoc(doc(db, 'pointAdjustments', adjId), adjRecord);

  await recordAdminAuditLog({
    action: 'point_adjustment',
    targetType: 'student',
    targetId: params.studentId,
    details: `تعديل نقاط الطالب "${params.studentName}": (${params.amount > 0 ? '+' : ''}${params.amount} نقطة) - الرصيد السابق: ${prev} -> الرصيد الجديد: ${next} - السبب: ${params.reason}`,
  });

  return { previousBalance: prev, newBalance: next };
}

// ==========================================
// 5. Announcements
// ==========================================

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const colRef = collection(db, 'announcements');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const list: Announcement[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }));
    return list;
  } catch (err) {
    console.error('Error fetching announcements:', err);
    return [];
  }
}

export async function saveAnnouncement(ann: Omit<Announcement, 'id'> & { id?: string }): Promise<string> {
  const isNew = !ann.id;
  const id = ann.id || `ann_${Date.now()}`;
  const now = new Date().toISOString();

  const docRef = doc(db, 'announcements', id);
  const cleanData = sanitizeFirestoreData({
    ...ann,
    id,
    createdAt: ann.createdAt || now,
    updatedAt: now,
    publishedAt: ann.published ? (ann.publishedAt || now) : null,
    createdBy: ann.createdBy || auth.currentUser?.email || 'admin',
  });

  await setDoc(docRef, cleanData, { merge: true });

  await recordAdminAuditLog({
    action: isNew ? 'publish_announcement' : 'unpublish_announcement',
    targetType: 'announcement',
    targetId: id,
    details: `${isNew ? 'نشر' : 'تحديث'} إعلان: "${ann.title}" (${ann.published ? 'منشور' : 'مسودة'})`,
  });

  return id;
}

// ==========================================
// 6. Challenges
// ==========================================

export async function fetchChallenges(): Promise<Challenge[]> {
  try {
    const colRef = collection(db, 'challenges');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const list: Challenge[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Challenge, 'id'>) }));
    return list;
  } catch (err) {
    console.error('Error fetching challenges:', err);
    return [];
  }
}

export async function saveChallenge(challenge: Omit<Challenge, 'id'> & { id?: string }): Promise<string> {
  const isNew = !challenge.id;
  const id = challenge.id || `ch_${Date.now()}`;
  const now = new Date().toISOString();

  const docRef = doc(db, 'challenges', id);
  const cleanData = sanitizeFirestoreData({
    ...challenge,
    id,
    createdAt: challenge.createdAt || now,
    createdBy: challenge.createdBy || auth.currentUser?.email || 'admin',
  });

  await setDoc(docRef, cleanData, { merge: true });

  await recordAdminAuditLog({
    action: isNew ? 'publish_challenge' : 'edit_challenge',
    targetType: 'challenge',
    targetId: id,
    details: `${isNew ? 'إنشاء' : 'تعديل'} تحدٍّ تنافسي: "${challenge.title}" (${challenge.points} نقطة - ${challenge.status})`,
  });

  return id;
}

// ==========================================
// 7. Global Settings
// ==========================================

const SETTINGS_DOC_ID = 'global';

export async function fetchAdminSettings(): Promise<AdminSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC_ID));
    if (snap.exists()) {
      return snap.data() as AdminSettings;
    }
  } catch (err) {
    console.warn('Could not fetch settings document, returning defaults:', err);
  }

  return {
    siteName: 'Arixon - أريكسون',
    defaultDurationMinutes: 20,
    defaultTotalPoints: 100,
    leaderboardVisible: true,
    maintenanceMode: false,
    registrationOpen: true,
    announcementsEnabled: true,
    challengesEnabled: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

export async function saveAdminSettings(settings: Partial<AdminSettings>): Promise<void> {
  const now = new Date().toISOString();
  const adminEmail = auth.currentUser?.email || 'admin';

  const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
  const cleanData = sanitizeFirestoreData({
    ...settings,
    updatedAt: now,
    updatedBy: adminEmail,
  });

  await setDoc(docRef, cleanData, { merge: true });

  await recordAdminAuditLog({
    action: 'settings_change',
    targetType: 'settings',
    targetId: SETTINGS_DOC_ID,
    details: `تحديث إعدادات المنصة العامة بواسطة ${adminEmail}`,
  });
}

// ==========================================
// 8. AI Generator & Verification Proxy
// ==========================================

export interface GenerateAiQuestionsOptions {
  subject: string;
  grade?: string;
  lesson: string;
  topic?: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  difficultyDistribution?: { easy: number; medium: number; hard: number };
  questionType: 'multiple_choice' | 'true_false' | 'mixed';
  questionCount: number;
  pointsPerQuestion?: number;
  language?: 'ar' | 'en';
  generationMode: GenerationMode;
  sourceMaterial?: string;
  existingQuestionsContext?: string[];
}

export async function generateQuestionsViaAi(
  params: GenerateAiQuestionsOptions
): Promise<{
  questions: AiGeneratedQuestionDraft[];
  modelUsed: string;
  summary: any;
}> {
  const token = await getAuthToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب المشرف أولاً.');

  const res = await fetch('/api/admin/ai-generate-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'فشل توليد الأسئلة بواسطة الذكاء الاصطناعي.');
  }

  const result = await res.json();
  const rawDrafts: AiGeneratedQuestionDraft[] = result.questions || [];

  await recordAdminAuditLog({
    action: 'ai_generation',
    targetType: 'question',
    targetId: `ai_batch_${Date.now()}`,
    details: `توليد دفعة ذكاء اصطناعي (${rawDrafts.length} سؤال) بنمط [${params.generationMode}] لمبحث "${params.subject}" - درس "${params.lesson}"`,
  });

  return {
    questions: rawDrafts,
    modelUsed: result.modelUsed || 'gemini-3.8-flash',
    summary: result.summary,
  };
}

export async function regenerateSingleQuestionViaAi(params: {
  subject: string;
  lesson: string;
  previousQuestion: string;
  failureReason: string;
  difficulty: 'easy' | 'medium' | 'hard';
  sourceMaterial?: string;
}): Promise<AiGeneratedQuestionDraft> {
  const token = await getAuthToken();
  if (!token) throw new Error('يرجى تسجيل الدخول بحساب المشرف أولاً.');

  const res = await fetch('/api/admin/ai-regenerate-single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'فشل إعادة توليد السؤال.');
  }

  const result = await res.json();
  return result.question;
}

// ==========================================
// 9. AI Generation Jobs & Templates
// ==========================================

export async function recordAiGenerationJob(job: Omit<AiGenerationJob, 'jobId' | 'createdAt'>): Promise<string> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const fullJob: AiGenerationJob = {
    ...job,
    jobId,
    createdAt: new Date().toISOString(),
  };

  const docRef = doc(db, 'aiGenerationJobs', jobId);
  await setDoc(docRef, sanitizeFirestoreData(fullJob));
  return jobId;
}

export async function fetchAiGenerationJobs(maxItems = 15): Promise<AiGenerationJob[]> {
  try {
    const q = query(
      collection(db, 'aiGenerationJobs'),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AiGenerationJob);
  } catch (err) {
    console.warn('Could not fetch AI generation jobs:', err);
    return [];
  }
}

export async function bulkSaveApprovedQuestionsToBank(
  questions: AiGeneratedQuestionDraft[]
): Promise<number> {
  let savedCount = 0;
  const adminEmail = auth.currentUser?.email || 'admin';

  for (const q of questions) {
    const qId = q.id || `q_${Date.now()}_${savedCount}`;
    const bankItem: QuestionBankItem = {
      id: qId,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      points: q.suggestedPoints || 5,
      subject: q.subject,
      subjectNameAr: q.subjectNameAr,
      lesson: q.lesson,
      topic: q.topic,
      source: q.sourceQuoteOrReference || `توليد معتمد بالذكاء الاصطناعي (${q.sourceMode})`,
      questionType: q.questionType,
      status: 'approved',
      isAiGenerated: true,
      approved: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: adminEmail,
    };

    await setDoc(doc(db, 'questions', qId), sanitizeFirestoreData(bankItem));
    savedCount++;
  }

  await recordAdminAuditLog({
    action: 'save_approved_questions',
    targetType: 'question',
    targetId: `batch_${Date.now()}`,
    details: `اعتماد ونقل ${savedCount} أسئلة مولدة بالذكاء الاصطناعي إلى بنك الأسئلة المعتمد`,
  });

  return savedCount;
}

// Built-in Exam Templates
export const DEFAULT_EXAM_TEMPLATES: ExamTemplate[] = [
  {
    id: 'tmpl_physics_tawjihi_20',
    name: 'امتحان فيزياء توجيهي رسمي (20 سؤال)',
    description: 'نموذج وزاري مطابق لمواصفات الورقة الامتحانية لمبحث الفيزياء توجيهي 2009',
    subject: 'physics',
    questionCount: 20,
    durationMinutes: 40,
    totalPoints: 100,
    difficulty: 'mixed',
    difficultyDistribution: { easy: 8, medium: 8, hard: 4 },
    allowRetake: true,
  },
  {
    id: 'tmpl_physics_quiz_10',
    name: 'اختبار قصير - الزخم والتصادمات (10 أسئلة)',
    description: 'كويز سريع لقياس استيعاب مفاهيم الزخم الخطي والدفع وتصادم الأجسام',
    subject: 'physics',
    questionCount: 10,
    durationMinutes: 20,
    totalPoints: 50,
    difficulty: 'medium',
    allowRetake: true,
  },
  {
    id: 'tmpl_math_tawjihi_25',
    name: 'امتحان رياضيات علمي شامل (25 سؤال)',
    description: 'توزيع متوازن بين المسائل الحسابية المباشرة وأسئلة القدرات العليا',
    subject: 'math',
    questionCount: 25,
    durationMinutes: 60,
    totalPoints: 100,
    difficulty: 'mixed',
    difficultyDistribution: { easy: 10, medium: 10, hard: 5 },
    allowRetake: true,
  },
];

export async function fetchExamTemplates(): Promise<ExamTemplate[]> {
  try {
    const snap = await getDocs(collection(db, 'examTemplates'));
    const customTemplates = snap.docs.map((d) => d.data() as ExamTemplate);
    return [...DEFAULT_EXAM_TEMPLATES, ...customTemplates];
  } catch (err) {
    console.warn('Could not fetch custom exam templates, returning defaults:', err);
    return DEFAULT_EXAM_TEMPLATES;
  }
}

export async function saveExamTemplate(template: Omit<ExamTemplate, 'id'>): Promise<string> {
  const id = `tmpl_${Date.now()}`;
  const fullTemplate: ExamTemplate = { ...template, id };
  await setDoc(doc(db, 'examTemplates', id), sanitizeFirestoreData(fullTemplate));

  await recordAdminAuditLog({
    action: 'create_template',
    targetType: 'template',
    targetId: id,
    details: `إنشاء قالب امتحاني جديد: "${template.name}"`,
  });

  return id;
}

