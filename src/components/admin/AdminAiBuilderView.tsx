import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Save,
  ShieldCheck,
  RefreshCw,
  Filter,
  Plus,
  ArrowRight,
  Calculator,
  Sliders,
  FileText,
  History,
  CheckSquare,
  Square,
  FileCheck,
  Send,
  HelpCircle,
  Database,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';
import type {
  AiGeneratedQuestionDraft,
  QuestionBankItem,
  SubjectId,
  ExamTemplate,
  GenerationMode,
  IngestedSourceMaterial,
} from '../../types';
import {
  generateQuestionsViaAi,
  regenerateSingleQuestionViaAi,
  bulkSaveApprovedQuestionsToBank,
  fetchExamTemplates,
  fetchQuestionBank,
  saveExamWithValidation,
} from '../../lib/adminService';
import { ingestSourceMaterial } from '../../lib/sourceIngestion';
import { validateQuestionDraft } from '../../lib/questionValidation';
import { AiQuestionReviewCard } from './ai/AiQuestionReviewCard';
import { AiEditQuestionModal } from './ai/AiEditQuestionModal';
import { AiExamBuilderModal } from './ai/AiExamBuilderModal';
import { AiRegeneratePromptModal } from './ai/AiRegeneratePromptModal';
import { AiJobHistoryModal } from './ai/AiJobHistoryModal';

interface AdminAiBuilderViewProps {
  onExamCreated?: () => void;
  onQuestionSaved?: () => void;
}

type ActiveTab = 'ai_builder' | 'bank_builder' | 'templates' | 'history';

export const AdminAiBuilderView: React.FC<AdminAiBuilderViewProps> = ({
  onExamCreated,
  onQuestionSaved,
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('ai_builder');

  // Generation Mode & Metadata
  const [generationMode, setGenerationMode] = useState<GenerationMode>('source_based');
  const [subject, setSubject] = useState<SubjectId>('physics');
  const [grade, setGrade] = useState('توجيهي 2009');
  const [lesson, setLesson] = useState('الزخم الخطي والتصادمات');
  const [topic, setTopic] = useState('');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'true_false' | 'mixed'>('multiple_choice');
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('medium');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(5);

  // Difficulty Distribution sliders (when difficulty === 'mixed')
  const [easyPercent, setEasyPercent] = useState<number>(40);
  const [mediumPercent, setMediumPercent] = useState<number>(40);
  const [hardPercent, setHardPercent] = useState<number>(20);

  // Source Ingestion State
  const [rawSourceText, setRawSourceText] = useState('');
  const [ingestedSource, setIngestedSource] = useState<IngestedSourceMaterial | null>(null);

  // Generation Live Flow State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState<string>('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Questions Review & Quality State
  const [draftQuestions, setDraftQuestions] = useState<AiGeneratedQuestionDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterFilter, setFilterFilter] = useState<'all' | 'valid' | 'issues' | 'approved' | 'rejected'>('all');

  // Modals state
  const [editingDraft, setEditingDraft] = useState<AiGeneratedQuestionDraft | null>(null);
  const [regeneratingDraft, setRegeneratingDraft] = useState<AiGeneratedQuestionDraft | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);

  // Bank direct builder state
  const [bankQuestions, setBankQuestions] = useState<QuestionBankItem[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [manualExamTitle, setManualExamTitle] = useState('امتحان وزاري معتمد');
  const [manualExamDuration, setManualExamDuration] = useState(40);
  const [manualExamPoints, setManualExamPoints] = useState(100);

  const subjectNames: Record<SubjectId, string> = {
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

  // Load templates on mount
  useEffect(() => {
    fetchExamTemplates().then((res) => setTemplates(res)).catch(() => {});
  }, []);

  // Update Ingestion preview whenever source text changes
  useEffect(() => {
    if (rawSourceText.trim()) {
      const ingested = ingestSourceMaterial(rawSourceText, {
        sourceType: 'pasted_text',
        targetSubject: subject,
        targetLesson: lesson,
      });
      setIngestedSource(ingested);
    } else {
      setIngestedSource(null);
    }
  }, [rawSourceText, subject, lesson]);

  // Apply template
  const applyTemplate = (tmpl: ExamTemplate) => {
    setSubject(tmpl.subject);
    setQuestionCount(tmpl.questionCount);
    setDifficulty(tmpl.difficulty);
    if (tmpl.difficultyDistribution) {
      setEasyPercent(Math.round((tmpl.difficultyDistribution.easy / tmpl.questionCount) * 100));
      setMediumPercent(Math.round((tmpl.difficultyDistribution.medium / tmpl.questionCount) * 100));
      setHardPercent(Math.round((tmpl.difficultyDistribution.hard / tmpl.questionCount) * 100));
    }
    setActiveTab('ai_builder');
    setNotification({
      type: 'success',
      message: `تم تطبيق القالب: "${tmpl.name}" بنجاح (${tmpl.questionCount} سؤال، ${tmpl.totalPoints} نقطة).`,
    });
  };

  // Run AI Generation Pipeline
  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerationError(null);
    setNotification(null);

    // Enforce source material rule if source_based mode
    if (generationMode === 'source_based') {
      if (!rawSourceText.trim() || rawSourceText.trim().length < 30) {
        setGenerationError('The provided source could not be used reliably (المادة المصدرية غير كافية أو فارغة في نمط التوليد من المصدر).');
        return;
      }
    }

    if (!lesson.trim()) {
      setGenerationError('يرجى تحديد عنوان الدرس أو الوحدة التعليمية.');
      return;
    }

    setIsGenerating(true);
    setGenerationStage('استيعاب المادة وتحليل المفاهيم (Source Ingestion)...');

    try {
      setGenerationStage('المرحلة 1: توليد الأسئلة التعليمية وتوزيع الخيارات بواسطة Gemini 3.8 Flash...');

      const result = await generateQuestionsViaAi({
        subject: subjectNames[subject] || subject,
        grade,
        lesson: lesson.trim(),
        topic: topic.trim() || undefined,
        difficulty,
        difficultyDistribution: difficulty === 'mixed' ? {
          easy: Math.round((easyPercent / 100) * questionCount),
          medium: Math.round((mediumPercent / 100) * questionCount),
          hard: Math.max(0, questionCount - Math.round((easyPercent / 100) * questionCount) - Math.round((mediumPercent / 100) * questionCount)),
        } : undefined,
        questionType,
        questionCount,
        pointsPerQuestion,
        language,
        generationMode,
        sourceMaterial: rawSourceText.trim() || undefined,
        existingQuestionsContext: draftQuestions.map((q) => q.questionText),
      });

      setGenerationStage('المرحلة 2: التدقيق الرياضي المستقل والفحص التربوي (Deterministic & Pedagogical Review)...');

      // Run independent client-side deterministic verification & quality scoring
      const fullyVerifiedDrafts = result.questions.map((rawDraft) => {
        const withSubject = {
          ...rawDraft,
          subject,
          subjectNameAr: subjectNames[subject] || 'الفيزياء',
        };
        const validation = validateQuestionDraft(withSubject, { currentBatch: result.questions });
        return validation.draft;
      });

      setDraftQuestions(fullyVerifiedDrafts);
      // Select all validated questions that have zero errors
      const validIds = fullyVerifiedDrafts
        .filter((q) => q.validationErrors.length === 0)
        .map((q) => q.id);
      setSelectedIds(validIds);

      setNotification({
        type: 'success',
        message: `تم توليد وتدقيق (${fullyVerifiedDrafts.length}) سؤالاً بنجاح عبر خط أنابيب الذكاء الاصطناعي الثنائي!`,
      });
    } catch (err: any) {
      console.error('Generation pipeline error:', err);
      setGenerationError(err.message || 'فشل توليد الأسئلة بواسطة خادم الذكاء الاصطناعي.');
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
    }
  };

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all / deselect all
  const handleSelectAllValid = () => {
    const validQuestions = draftQuestions.filter((q) => q.validationErrors.length === 0);
    if (selectedIds.length === validQuestions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(validQuestions.map((q) => q.id));
    }
  };

  // Approve single question
  const handleApproveQuestion = (id: string) => {
    setDraftQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, generationStatus: 'approved' } : q))
    );
  };

  // Reject single question
  const handleRejectQuestion = (id: string) => {
    setDraftQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, generationStatus: 'rejected' } : q))
    );
    setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
  };

  // Bulk Approve Selected
  const handleBulkApprove = () => {
    const invalidSelected = draftQuestions.filter(
      (q) => selectedIds.includes(q.id) && q.validationErrors.length > 0
    );
    if (invalidSelected.length > 0) {
      alert('لا يمكن اعتماد أسئلة تحتوي على أخطاء تحقق أو فشل حسابي. يرجى تصحيحها أو استثناؤها أولاً.');
      return;
    }

    setDraftQuestions((prev) =>
      prev.map((q) => (selectedIds.includes(q.id) ? { ...q, generationStatus: 'approved' } : q))
    );
    setNotification({
      type: 'success',
      message: `تم اعتماد (${selectedIds.length}) سؤالاً بنجاح للمشرف!`,
    });
  };

  // Save approved to question bank
  const handleSaveApprovedToBank = async () => {
    const approvedToSave = draftQuestions.filter(
      (q) => q.generationStatus === 'approved' || (selectedIds.includes(q.id) && q.validationErrors.length === 0)
    );

    if (approvedToSave.length === 0) {
      alert('لا توجد أسئلة معتمدة للحفظ. يرجى اعتماد الأسئلة أولاً.');
      return;
    }

    try {
      const savedCount = await bulkSaveApprovedQuestionsToBank(approvedToSave);
      setNotification({
        type: 'success',
        message: `تم حفظ (${savedCount}) سؤالاً معتمداً بنجاح في بنك الأسئلة المركزي!`,
      });
      // Remove saved questions from current review list
      const savedIds = new Set(approvedToSave.map((q) => q.id));
      setDraftQuestions((prev) => prev.filter((q) => !savedIds.has(q.id)));
      setSelectedIds((prev) => prev.filter((id) => !savedIds.has(id)));
      onQuestionSaved?.();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الأسئلة في بنك الأسئلة.');
    }
  };

  // Edit question draft
  const handleSaveEditedDraft = (updated: AiGeneratedQuestionDraft) => {
    const val = validateQuestionDraft(updated, { currentBatch: draftQuestions });
    const finalized: AiGeneratedQuestionDraft = {
      ...val.draft,
      generationStatus: 'approved',
    };

    setDraftQuestions((prev) => prev.map((q) => (q.id === finalized.id ? finalized : q)));
    if (!selectedIds.includes(finalized.id)) {
      setSelectedIds((prev) => [...prev, finalized.id]);
    }
    setNotification({
      type: 'success',
      message: 'تم تحديث واعتماد بيانات السؤال بنجاح.',
    });
  };

  // Single Question Regeneration
  const handleConfirmRegenerate = async (
    draftToRegen: AiGeneratedQuestionDraft,
    failureReason: string
  ) => {
    const replacement = await regenerateSingleQuestionViaAi({
      subject: subjectNames[subject] || subject,
      lesson: draftToRegen.lesson || lesson,
      previousQuestion: draftToRegen.questionText,
      failureReason,
      difficulty: draftToRegen.difficulty as any,
      sourceMaterial: rawSourceText.trim() || undefined,
    });

    const withSubject = {
      ...replacement,
      subject,
      subjectNameAr: subjectNames[subject] || 'الفيزياء',
    };
    const val = validateQuestionDraft(withSubject, { currentBatch: draftQuestions });

    setDraftQuestions((prev) =>
      prev.map((q) => (q.id === draftToRegen.id ? val.draft : q))
    );
    setNotification({
      type: 'success',
      message: 'تم توليد وتدقيق السؤال البديل بنجاح!',
    });
  };

  // Load Bank Questions for Manual Exam Builder
  const handleLoadBankQuestions = async () => {
    setBankLoading(true);
    try {
      const questions = await fetchQuestionBank({ subject: subject === 'all' ? undefined : subject });
      setBankQuestions(questions);
    } catch (err) {
      console.error(err);
    } finally {
      setBankLoading(false);
    }
  };

  // Manual Exam Creation from Bank
  const handleCreateManualExam = async () => {
    const chosen = bankQuestions.filter((q) => selectedBankIds.includes(q.id));
    if (chosen.length === 0) {
      alert('يرجى تحديد أسئلة من البنك لإنشاء الامتحان.');
      return;
    }

    try {
      const examId = await saveExamWithValidation(
        {
          title: manualExamTitle.trim(),
          subject,
          subjectNameAr: subjectNames[subject] || 'الفيزياء',
          lesson,
          description: 'امتحان مجمّع يدوياً من بنك الأسئلة المعتمد.',
          durationMinutes: manualExamDuration,
          totalPoints: manualExamPoints,
          difficulty: 'medium',
          status: 'coming_soon',
          published: false,
          allowRetake: true,
          questionCount: chosen.length,
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        chosen.map((q, idx) => ({
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          source: q.source || 'بنك الأسئلة المركزي',
          points: q.points || 5,
          order: idx + 1,
          questionType: q.questionType || 'multiple_choice',
        }))
      );

      setNotification({
        type: 'success',
        message: `تم إنشاء الامتحان اليدوي بنجاح (${chosen.length} أسئلة)!`,
      });
      setSelectedBankIds([]);
      onExamCreated?.();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الامتحان.');
    }
  };

  // Filtered drafts list
  const filteredDrafts = useMemo(() => {
    return draftQuestions.filter((q) => {
      if (filterFilter === 'approved') return q.generationStatus === 'approved';
      if (filterFilter === 'rejected') return q.generationStatus === 'rejected';
      if (filterFilter === 'issues') return q.validationErrors.length > 0 || q.isDuplicate || q.calculationStatus === 'FAILED_VERIFICATION';
      if (filterFilter === 'valid') return q.validationErrors.length === 0;
      return true;
    });
  }, [draftQuestions, filterFilter]);

  // KPI Counters
  const totalDrafts = draftQuestions.length;
  const approvedCount = draftQuestions.filter((q) => q.generationStatus === 'approved').length;
  const rejectedCount = draftQuestions.filter((q) => q.generationStatus === 'rejected').length;
  const validCount = draftQuestions.filter((q) => q.validationErrors.length === 0).length;
  const issuesCount = draftQuestions.filter(
    (q) => q.validationErrors.length > 0 || q.isDuplicate || q.calculationStatus === 'FAILED_VERIFICATION'
  ).length;

  // Selected approved drafts ready for Exam Builder Modal
  const approvedDraftsForExam = draftQuestions.filter(
    (q) => selectedIds.includes(q.id) && q.generationStatus === 'approved'
  );

  return (
    <div className="space-y-6">
      {/* Top Main Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('ai_builder')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'ai_builder'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>منشئ الأسئلة الذكي (AI Builder)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('bank_builder');
              if (bankQuestions.length === 0) handleLoadBankQuestions();
            }}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'bank_builder'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>بناء امتحان يدوي من البنك</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors ${
              activeTab === 'templates'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>القوالب الوزارية ({templates.length})</span>
          </button>
        </div>

        <button
          onClick={() => setIsHistoryModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          <span>سجل مهام الذكاء الاصطناعي</span>
        </button>
      </div>

      {/* Global Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: AI EXAM BUILDER & QUESTION GENERATION WORKSPACE     */}
      {/* ========================================================= */}
      {activeTab === 'ai_builder' && (
        <div className="space-y-6">
          {/* Main Top Header Banner */}
          <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 p-6 rounded-3xl border border-blue-500/30 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h1 className="text-xl font-black text-slate-900 dark:text-white">
                  منشئ الأسئلة والامتحانات الذكي المعتمد (Arixon AI Builder)
                </h1>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                خط أنابيب احترافي مزدوج: توليد مدقق، فحص حسابي وفيزيائي مستقل برمجياً، وتدقيق تربوي صارم لضمان أسئلة خالية من أي أخطاء أو اختلاق.
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-300 text-xs font-bold shrink-0">
              <ShieldCheck className="w-4 h-4" />
              <span>المدقق التربوي: Gemini 3.8 Flash</span>
            </div>
          </div>

          {/* Configuration Form */}
          <form
            onSubmit={handleStartGeneration}
            className="bg-white dark:bg-[#0c101c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-6"
          >
            {/* Generation Mode Selector */}
            <div>
              <label className="text-xs font-black text-slate-900 dark:text-white block mb-2">
                نمط التوليد والاعتماد الأساسي (Generation Mode):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setGenerationMode('source_based')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                    generationMode === 'source_based'
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      توليد مستند إلى مادة مصدرية
                    </span>
                    <BookOpen className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Source-Based: يحظر التوليد من الفراغ، ويحصر الأسئلة في النص المزود فقط.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGenerationMode('curriculum_based')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                    generationMode === 'curriculum_based'
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      توليد مطابق للمنهاج الرسمي
                    </span>
                    <Layers className="w-4 h-4 text-indigo-500" />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Curriculum-Based: التزام دقيق بوحدات ومواصفات امتحان توجيهي 2009.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGenerationMode('question_bank_based')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                    generationMode === 'question_bank_based'
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      توليد مكمل لبنك الأسئلة
                    </span>
                    <Database className="w-4 h-4 text-purple-500" />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Question-Bank-Based: فحص الأسئلة الحالية وتوليد أفكار ونماذج جديدة غير مكررة.
                  </span>
                </button>
              </div>
            </div>

            {/* Curriculum Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  المبحث الدراسي:
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as SubjectId)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                >
                  <option value="physics">الفيزياء</option>
                  <option value="math">الرياضيات</option>
                  <option value="chemistry">الكيمياء</option>
                  <option value="biology">العلوم الحياتية</option>
                  <option value="arabic">اللغة العربية</option>
                  <option value="english">اللغة الإنجليزية</option>
                  <option value="islamic">التربية الإسلامية</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  المستوى / الفوج:
                </label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  الوحدة / الدرس التعليمي:
                </label>
                <input
                  type="text"
                  value={lesson}
                  onChange={(e) => setLesson(e.target.value)}
                  placeholder="مثال: الزخم الخطي والتصادمات"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  المفهوم أو الجزئية (اختياري):
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="مثال: التصادم غير المرن وحفظ الطاقة"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Questions Format & Count Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  نوع الأسئلة:
                </label>
                <select
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="multiple_choice">اختيار من متعدد (4 خيارات)</option>
                  <option value="true_false">صواب أو خطأ</option>
                  <option value="mixed">مختلط (متعدد وصواب/خطأ)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  مستوى الصعوبة:
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="medium">متوسط (منهجي متوازن)</option>
                  <option value="easy">سهل (مفاهيم أساسية وتذكر)</option>
                  <option value="hard">صعب (قدرات تفكير عليا وحسابات مركبة)</option>
                  <option value="mixed">توزيع مخصص (سهل / متوسط / صعب)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  عدد الأسئلة المطلوبة (1 - 20):
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  النقاط لكل سؤال:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={pointsPerQuestion}
                  onChange={(e) => setPointsPerQuestion(Number(e.target.value) || 5)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                />
              </div>
            </div>

            {/* Custom Difficulty Sliders (if difficulty === 'mixed') */}
            {difficulty === 'mixed' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 space-y-3 text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">
                  توزيع مستويات الصعوبة المخصص:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 block mb-1">
                      سهل: {easyPercent}% ({Math.round((easyPercent / 100) * questionCount)} أسئلة)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={easyPercent}
                      onChange={(e) => setEasyPercent(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 block mb-1">
                      متوسط: {mediumPercent}% ({Math.round((mediumPercent / 100) * questionCount)} أسئلة)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mediumPercent}
                      onChange={(e) => setMediumPercent(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 block mb-1">
                      صعب: {hardPercent}% ({Math.round((hardPercent / 100) * questionCount)} أسئلة)
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={hardPercent}
                      onChange={(e) => setHardPercent(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Source Ingestion Text Area & Live Pipeline Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <span>المادة التعليمية المصدرية (Source Material Ingestion):</span>
                  {generationMode === 'source_based' && (
                    <span className="text-rose-500 font-bold">* إلزامي في نمط التوليد من المصدر</span>
                  )}
                </label>
                <span className="text-[11px] text-slate-400">
                  {rawSourceText.length} حرف | {rawSourceText.split(/\s+/).filter(Boolean).length} كلمة
                </span>
              </div>

              <textarea
                rows={5}
                value={rawSourceText}
                onChange={(e) => setRawSourceText(e.target.value)}
                placeholder="الصق هنا نص الدرس، تلخيص المادة، القوانين الفيزيائية، أو فقرات الكتاب المقررة ليعتمد عليها الذكاء الاصطناعي حصراً..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 font-mono leading-relaxed"
              />

              {/* Ingested Source Summary Preview */}
              {ingestedSource && (
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-blue-600" />
                      تقرير استيعاب المادة المصدرية (Source Ingestion Summary)
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        ingestedSource.isUsable
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                      }`}
                    >
                      {ingestedSource.isUsable ? 'جاهز وصالح للتوليد المعتمد' : 'المادة غير كافية أو فارغة'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                    <span>عدد المقاطع (Chunks): {ingestedSource.chunks.length}</span>
                    <span>الكلمات القابلة للاستخدام: {ingestedSource.normalizedWordCount}</span>
                    <span>
                      القوانين المكتشفة:{' '}
                      {ingestedSource.detectedFormulas.length > 0
                        ? ingestedSource.detectedFormulas.join(', ')
                        : 'لا توجد قوانين صريحة'}
                    </span>
                  </div>

                  {ingestedSource.detectedConcepts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-slate-500">المفاهيم المكتشفة:</span>
                      {ingestedSource.detectedConcepts.map((c, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 pt-1 border-t border-blue-100 dark:border-blue-900/40">
                    🔒 <span className="font-bold">ضمان عدم الاختلاق:</span> سيتم حصر جميع الأسئلة المولدة ضمن هذه المادة فقط ولن يقوم النموذج باختلاق أي معلومات خارجية.
                  </p>
                </div>
              )}
            </div>

            {/* Error Message */}
            {generationError && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{generationError}</span>
              </div>
            )}

            {/* Submit Action & Live Status */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {isGenerating ? (
                <div className="flex items-center gap-3 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{generationStage || 'جارٍ معالجة خط أنابيب الذكاء الاصطناعي...'}</span>
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  النتيجة ستخضع للفحص الحسابي والتربوي قبل عرضها للاعتماد.
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'جارٍ التوليد والتدقيق...' : 'بدء توليد وتدقيق الأسئلة'}</span>
              </button>
            </div>
          </form>

          {/* ========================================================= */}
          {/* GENERATION REVIEW & QUALITY METER SCREEN                  */}
          {/* ========================================================= */}
          {draftQuestions.length > 0 && (
            <div className="space-y-4">
              {/* Review Header & Metrics Bar */}
              <div className="bg-white dark:bg-[#0c101c] p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                      <span>شاشة مراجعة واعتماد الأسئلة (Admin Review Screen)</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      فحص نتائج التدقيق الرياضي المستقل وملاحظات المدقق التربوي قبل النشر
                    </p>
                  </div>

                  {/* Bulk Actions Button Group */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllValid}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      {selectedIds.length === validCount ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      <span>تحديد المجاز ({validCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleBulkApprove}
                      disabled={selectedIds.length === 0}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد المحددة ({selectedIds.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveApprovedToBank}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Database className="w-4 h-4" />
                      <span>حفظ المعتمدة في بنك الأسئلة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsExamModalOpen(true)}
                      disabled={approvedDraftsForExam.length === 0}
                      title={approvedDraftsForExam.length === 0 ? 'يرجى اعتماد وتحديد الأسئلة أولاً' : 'إنشاء امتحان'}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Layers className="w-4 h-4" />
                      <span>إنشاء الامتحان ({approvedDraftsForExam.length})</span>
                    </button>
                  </div>
                </div>

                {/* KPI Counters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-xs">
                  <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">إجمالي الدفعة</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      {totalDrafts} سؤال
                    </span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <span className="text-[10px] block opacity-80">معتمد رسمياً</span>
                    <span className="text-sm font-black">{approvedCount}</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                    <span className="text-[10px] block opacity-80">مجاز حسابياً وتربوياً</span>
                    <span className="text-sm font-black">{validCount}</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                    <span className="text-[10px] block opacity-80">ملاحظات / بحاجة لتدقيق</span>
                    <span className="text-sm font-black">{issuesCount}</span>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
                    <span className="text-[10px] block opacity-80">مرفوض</span>
                    <span className="text-sm font-black">{rejectedCount}</span>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-400 font-bold flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    تصفية:
                  </span>
                  {(['all', 'valid', 'issues', 'approved', 'rejected'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFilterFilter(mode)}
                      className={`px-3 py-1 rounded-xl font-bold transition-colors ${
                        filterFilter === mode
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {mode === 'all'
                        ? 'الكل'
                        : mode === 'valid'
                        ? 'المجاز'
                        : mode === 'issues'
                        ? 'الملاحظات'
                        : mode === 'approved'
                        ? 'المعتمد'
                        : 'المرفوض'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards List */}
              <div className="space-y-4">
                {filteredDrafts.map((draft, idx) => (
                  <AiQuestionReviewCard
                    key={draft.id}
                    draft={draft}
                    index={idx}
                    isSelected={selectedIds.includes(draft.id)}
                    onToggleSelect={handleToggleSelect}
                    onApprove={handleApproveQuestion}
                    onReject={handleRejectQuestion}
                    onEdit={(d) => setEditingDraft(d)}
                    onRegenerate={(d) => setRegeneratingDraft(d)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: MANUAL EXAM BUILDER FROM QUESTION BANK             */}
      {/* ========================================================= */}
      {activeTab === 'bank_builder' && (
        <div className="bg-white dark:bg-[#0c101c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span>بناء الامتحان المباشر من بنك الأسئلة المعتمد (بدون ذكاء اصطناعي)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              اختر الأسئلة المعتمدة المحفوظة مسبقاً في البنك لبناء امتحان توجيهي رسمي متكامل
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                عنوان الامتحان:
              </label>
              <input
                type="text"
                value={manualExamTitle}
                onChange={(e) => setManualExamTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                مدة الامتحان (بالدقائق):
              </label>
              <input
                type="number"
                value={manualExamDuration}
                onChange={(e) => setManualExamDuration(Number(e.target.value) || 40)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                مجموع النقاط:
              </label>
              <input
                type="number"
                value={manualExamPoints}
                onChange={(e) => setManualExamPoints(Number(e.target.value) || 100)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Bank Questions Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white">
                قائمة الأسئلة المعتمدة في البنك ({bankQuestions.length})
              </span>
              <button
                type="button"
                onClick={handleLoadBankQuestions}
                className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                تحديث القائمة
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {bankLoading ? (
                <div className="p-8 text-center text-slate-400">جارٍ استرجاع الأسئلة...</div>
              ) : bankQuestions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  لا توجد أسئلة معتمدة بعد في بنك الأسئلة. قم بتوليد أسئلة واعتمادها أولاً.
                </div>
              ) : (
                bankQuestions.map((q) => {
                  const isChecked = selectedBankIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50/50 dark:bg-blue-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setSelectedBankIds((prev) =>
                            prev.includes(q.id) ? prev.filter((i) => i !== q.id) : [...prev, q.id]
                          )
                        }
                        className="mt-1 rounded-md text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {q.questionText}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                            {q.points || 5} نقاط
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          المبحث: {q.subjectNameAr || q.subject} • الدرس: {q.lesson}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
              الأسئلة المختارة: {selectedBankIds.length} سؤال
            </span>
            <button
              onClick={handleCreateManualExam}
              disabled={selectedBankIds.length === 0}
              className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>إنشاء الامتحان من الأسئلة المختارة</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: EXAM TEMPLATES                                     */}
      {/* ========================================================= */}
      {activeTab === 'templates' && (
        <div className="bg-white dark:bg-[#0c101c] p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>قوالب الامتحانات الوزارية المعتمدة (Exam Templates)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              نماذج جاهزة بمواصفات الورقة الامتحانية الرسمية لتوليد سريع بنقرة واحدة
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-blue-500 transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {tmpl.questionCount} سؤال
                    </span>
                    <span className="text-xs text-slate-500 font-bold">
                      {tmpl.totalPoints} نقطة
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {tmpl.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    المدة: {tmpl.durationMinutes} دقيقة
                  </span>
                  <button
                    onClick={() => applyTemplate(tmpl)}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <span>استخدام القالب</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS                                                    */}
      {/* ========================================================= */}
      {/* 1. Edit Question Modal */}
      <AiEditQuestionModal
        draft={editingDraft}
        isOpen={Boolean(editingDraft)}
        onClose={() => setEditingDraft(null)}
        onSave={handleSaveEditedDraft}
      />

      {/* 2. Regenerate Single Question Modal */}
      <AiRegeneratePromptModal
        draft={regeneratingDraft}
        isOpen={Boolean(regeneratingDraft)}
        onClose={() => setRegeneratingDraft(null)}
        onConfirmRegenerate={handleConfirmRegenerate}
      />

      {/* 3. Build & Publish Exam Modal */}
      <AiExamBuilderModal
        isOpen={isExamModalOpen}
        onClose={() => setIsExamModalOpen(false)}
        approvedQuestions={approvedDraftsForExam}
        defaultSubject={subject}
        defaultLesson={lesson}
        onExamCreated={(examId) => {
          setNotification({
            type: 'success',
            message: `تم إنشاء ونشر الامتحان بنجاح (معرف: ${examId})!`,
          });
          onExamCreated?.();
        }}
      />

      {/* 4. Generation Job History Modal */}
      <AiJobHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </div>
  );
};
