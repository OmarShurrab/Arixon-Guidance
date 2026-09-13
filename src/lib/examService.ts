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
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase';
import type { 
  Exam, 
  Question, 
  ExamAttempt, 
  QuestionReview, 
  SubjectId, 
  UserProfile 
} from '../types';
import { 
  FIRST_EXAM, 
  FIRST_EXAM_ID, 
  FIRST_EXAM_QUESTIONS,
  type QuestionWithKey
} from '../data/firstExamData';

/**
 * Ensures the first physics exam and its public questions exist in Firestore.
 * Automatically runs on app launch so real data is present in Firestore without manual setup.
 */
export async function seedFirstExamIfMissing(): Promise<void> {
  try {
    const examDocRef = doc(db, 'exams', FIRST_EXAM_ID);
    const examSnap = await getDoc(examDocRef);

    if (!examSnap.exists()) {
      console.log('Seeding first exam into Firestore...');
      // 1. Create main exam doc
      await setDoc(examDocRef, FIRST_EXAM);

      // 2. Create questions subcollection (public fields only)
      for (const q of FIRST_EXAM_QUESTIONS) {
        const qRef = doc(db, 'exams', FIRST_EXAM_ID, 'questions', q.id);
        const publicQuestionData: Question = {
          id: q.id,
          examId: FIRST_EXAM_ID,
          order: q.order,
          questionText: q.questionText,
          options: q.options,
          difficulty: q.difficulty,
          source: q.source,
          points: q.points,
          questionType: q.questionType,
        };
        await setDoc(qRef, publicQuestionData);

        // 3. Create protected answer keys in separate subcollection
        const keyRef = doc(db, 'exams', FIRST_EXAM_ID, 'answerKeys', q.id);
        await setDoc(keyRef, {
          id: q.id,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        });
      }
      console.log('Successfully seeded first exam into Firestore.');
    }
  } catch (error) {
    console.warn('Seeding check/create note:', error);
  }
}

/**
 * Fetch all published exams from Firestore, dynamically enriched with the user's attempt status
 */
export async function getExamsList(subjectFilter?: SubjectId, currentUserId?: string): Promise<Exam[]> {
  try {
    // Make sure first exam is seeded
    await seedFirstExamIfMissing();

    const examsRef = collection(db, 'exams');
    let q = query(examsRef, where('published', '==', true));

    if (subjectFilter && subjectFilter !== 'all') {
      q = query(examsRef, where('published', '==', true), where('subject', '==', subjectFilter));
    }

    const snapshot = await getDocs(q);
    const exams: Exam[] = [];

    // Also get all user attempts if user is signed in to mark completed/in_progress
    const userAttemptsMap: Record<string, ExamAttempt> = {};
    if (currentUserId) {
      const attemptsRef = collection(db, 'attempts');
      const attemptsQuery = query(attemptsRef, where('userId', '==', currentUserId));
      const attemptsSnap = await getDocs(attemptsQuery);
      attemptsSnap.forEach((d) => {
        const att = d.data() as ExamAttempt;
        userAttemptsMap[att.examId] = att;
      });
    }

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as Exam;
      const examObj: Exam = {
        ...data,
        id: docSnapshot.id,
      };

      if (currentUserId && userAttemptsMap[examObj.id]) {
        const att = userAttemptsMap[examObj.id];
        if (att.status === 'submitted') {
          examObj.userAttemptStatus = 'completed';
          examObj.userLastAttemptId = att.id;
          examObj.userScore = att.score ?? 0;
          if (!examObj.allowRetake) {
            examObj.status = 'completed';
          }
        } else if (att.status === 'in_progress') {
          // Check if expectedEndAt has not passed
          const isExpired = new Date(att.expectedEndAt).getTime() < Date.now();
          if (!isExpired) {
            examObj.userAttemptStatus = 'in_progress';
            examObj.userLastAttemptId = att.id;
          }
        }
      }

      exams.push(examObj);
    });

    // Sort by createdAt descending
    exams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return exams;
  } catch (error) {
    console.error('Error in getExamsList:', error);
    return [];
  }
}

/**
 * Fetch a single exam details
 */
export async function getExamById(examId: string): Promise<Exam | null> {
  try {
    const examDoc = await getDoc(doc(db, 'exams', examId));
    if (examDoc.exists()) {
      return { id: examDoc.id, ...(examDoc.data() as Omit<Exam, 'id'>) };
    }
    return null;
  } catch (error) {
    console.error('Error fetching exam by ID:', error);
    return null;
  }
}

/**
 * Fetch questions for an exam without exposing correct answers or explanations
 */
export async function getExamQuestions(examId: string): Promise<Question[]> {
  try {
    const qCol = collection(db, 'exams', examId, 'questions');
    const snap = await getDocs(query(qCol, orderBy('order', 'asc')));
    const questions: Question[] = [];

    snap.forEach((d) => {
      const data = d.data() as Question;
      questions.push({
        id: d.id,
        examId,
        questionText: data.questionText,
        options: data.options,
        difficulty: data.difficulty,
        source: data.source,
        points: data.points,
        order: data.order,
        questionType: data.questionType,
        media: data.media,
      });
    });

    // Fallback to initial question data if subcollection is empty
    if (questions.length === 0 && examId === FIRST_EXAM_ID) {
      return FIRST_EXAM_QUESTIONS.map(q => ({
        id: q.id,
        examId: FIRST_EXAM_ID,
        questionText: q.questionText,
        options: q.options,
        difficulty: q.difficulty,
        source: q.source,
        points: q.points,
        order: q.order,
        questionType: q.questionType,
      }));
    }

    return questions;
  } catch (error) {
    console.error('Error fetching exam questions:', error);
    if (examId === FIRST_EXAM_ID) {
      return FIRST_EXAM_QUESTIONS.map(q => ({
        id: q.id,
        examId: FIRST_EXAM_ID,
        questionText: q.questionText,
        options: q.options,
        difficulty: q.difficulty,
        source: q.source,
        points: q.points,
        order: q.order,
        questionType: q.questionType,
      }));
    }
    return [];
  }
}

/**
 * Start or resume an exam attempt for a user
 */
export async function startOrResumeAttempt(
  examId: string, 
  userId: string, 
  userDisplayName?: string
): Promise<{ attempt: ExamAttempt; questions: Question[]; isResumed: boolean }> {
  const exam = await getExamById(examId);
  if (!exam) {
    throw new Error('الامتحان غير موجود.');
  }

  // 1. Check for existing attempts for this user and exam
  const attemptsRef = collection(db, 'attempts');
  const q = query(
    attemptsRef, 
    where('userId', '==', userId), 
    where('examId', '==', examId)
  );
  const snap = await getDocs(q);

  let inProgressAttempt: ExamAttempt | null = null;
  let completedAttempt: ExamAttempt | null = null;

  snap.forEach((d) => {
    const data = d.data() as ExamAttempt;
    if (data.status === 'in_progress') {
      inProgressAttempt = { ...data, id: d.id };
    } else if (data.status === 'submitted') {
      completedAttempt = { ...data, id: d.id };
    }
  });

  // If retake is not allowed and exam is completed
  if (completedAttempt && !exam.allowRetake) {
    const questions = await getExamQuestions(examId);
    return { attempt: completedAttempt, questions, isResumed: true };
  }

  // If there is an active in_progress attempt, check whether time has expired
  if (inProgressAttempt) {
    const inProg = inProgressAttempt as ExamAttempt;
    const now = Date.now();
    const end = new Date(inProg.expectedEndAt).getTime();
    if (now < end) {
      const questions = await getExamQuestions(examId);
      return { attempt: inProg, questions, isResumed: true };
    }
  }

  // Otherwise, create a new attempt
  const startedAt = new Date();
  const durationMs = (exam.durationMinutes || 20) * 60 * 1000;
  const expectedEndAt = new Date(startedAt.getTime() + durationMs);

  const attemptId = `att_${userId.slice(0, 8)}_${examId}_${Date.now()}`;
  const newAttempt: ExamAttempt = {
    id: attemptId,
    userId,
    examId,
    examTitle: exam.title,
    examSubject: exam.subjectNameAr || exam.subject,
    lesson: exam.lesson,
    totalPoints: exam.totalPoints,
    startedAt: startedAt.toISOString(),
    expectedEndAt: expectedEndAt.toISOString(),
    submittedAt: null,
    status: 'in_progress',
    score: null,
    pointsEarned: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    unanswered: 0,
    durationSeconds: 0,
    lastSavedAt: startedAt.toISOString(),
  };

  const attemptDocRef = doc(db, 'attempts', attemptId);
  await setDoc(attemptDocRef, newAttempt);

  const questions = await getExamQuestions(examId);
  return { attempt: newAttempt, questions, isResumed: false };
}

/**
 * Save user's selected answer for a question
 */
export async function saveQuestionAnswer(
  attemptId: string, 
  questionId: string, 
  selectedAnswer: number | null
): Promise<void> {
  try {
    const answerRef = doc(db, 'attempts', attemptId, 'answers', questionId);
    const now = new Date().toISOString();
    await setDoc(answerRef, {
      questionId,
      selectedAnswer,
      answeredAt: now,
      updatedAt: now,
    });

    // Touch attempt lastSavedAt
    const attemptRef = doc(db, 'attempts', attemptId);
    await updateDoc(attemptRef, {
      lastSavedAt: now,
    });
  } catch (error) {
    console.error('Error saving answer:', error);
    throw error;
  }
}

/**
 * Fetch all saved answers for an active attempt
 */
export async function getSavedAnswersForAttempt(attemptId: string): Promise<Record<string, number | null>> {
  try {
    const answersCol = collection(db, 'attempts', attemptId, 'answers');
    const snap = await getDocs(answersCol);
    const answers: Record<string, number | null> = {};
    snap.forEach((d) => {
      const data = d.data();
      answers[data.questionId] = data.selectedAnswer;
    });
    return answers;
  } catch (error) {
    console.warn('Could not fetch saved answers:', error);
    return {};
  }
}

/**
 * Get an attempt by ID
 */
export async function getAttemptById(attemptId: string, userId: string): Promise<ExamAttempt | null> {
  try {
    const attemptDoc = await getDoc(doc(db, 'attempts', attemptId));
    if (!attemptDoc.exists()) return null;
    const data = attemptDoc.data() as ExamAttempt;
    if (data.userId !== userId) {
      throw new Error('غير مصرح بالوصول إلى هذا الامتحان.');
    }
    return { ...data, id: attemptDoc.id };
  } catch (error) {
    console.error('Error in getAttemptById:', error);
    return null;
  }
}

/**
 * Fetch student's completed exam attempts history
 */
export async function getUserExamHistory(userId: string): Promise<ExamAttempt[]> {
  try {
    const attemptsRef = collection(db, 'attempts');
    const q = query(
      attemptsRef,
      where('userId', '==', userId),
      where('status', '==', 'submitted')
    );
    const snap = await getDocs(q);
    const history: ExamAttempt[] = [];
    snap.forEach((d) => {
      history.push({ ...(d.data() as ExamAttempt), id: d.id });
    });
    history.sort((a, b) => new Date(b.submittedAt || b.startedAt).getTime() - new Date(a.submittedAt || a.startedAt).getTime());
    return history;
  } catch (error) {
    console.error('Error fetching exam history:', error);
    return [];
  }
}

/**
 * Submit and Grade Exam with server-time validation, scoring, and atomic profile points update
 */
export async function submitExamAttempt(
  attemptId: string, 
  userId: string,
  answersOverride?: Record<string, number | null>
): Promise<ExamAttempt> {
  // 1. Fetch attempt
  const attemptDocRef = doc(db, 'attempts', attemptId);
  const attemptSnap = await getDoc(attemptDocRef);
  if (!attemptSnap.exists()) {
    throw new Error('محاولة الامتحان غير موجودة.');
  }

  const attempt = attemptSnap.data() as ExamAttempt;
  if (attempt.userId !== userId) {
    throw new Error('لا تملك صلاحية تسليم هذا الامتحان.');
  }

  // Idempotency: if already submitted, return it
  if (attempt.status === 'submitted') {
    return { ...attempt, id: attemptSnap.id };
  }

  // 2. Fetch questions with answer keys
  let questionsWithKeys: QuestionWithKey[] = [];
  if (attempt.examId === FIRST_EXAM_ID) {
    questionsWithKeys = FIRST_EXAM_QUESTIONS;
  } else {
    // For other exams, fetch questions and their keys
    const qCol = collection(db, 'exams', attempt.examId, 'questions');
    const qSnap = await getDocs(query(qCol, orderBy('order', 'asc')));
    for (const d of qSnap.docs) {
      const qData = d.data() as Question;
      const keyDoc = await getDoc(doc(db, 'exams', attempt.examId, 'answerKeys', d.id));
      const keyData = keyDoc.exists() ? keyDoc.data() : { correctAnswer: 0, explanation: '' };
      questionsWithKeys.push({
        ...qData,
        id: d.id,
        correctAnswer: keyData.correctAnswer ?? 0,
        explanation: keyData.explanation ?? '',
      });
    }
  }

  // 3. Load student answers
  const savedAnswers = answersOverride || await getSavedAnswersForAttempt(attemptId);

  // 4. Calculate score & breakdown
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let pointsEarned = 0;
  const reviews: QuestionReview[] = [];

  for (const q of questionsWithKeys) {
    const studentAns = savedAnswers[q.id] !== undefined ? savedAnswers[q.id] : null;
    const isUnanswered = studentAns === null;
    const isCorrect = !isUnanswered && studentAns === q.correctAnswer;

    if (isCorrect) {
      correctCount++;
      pointsEarned += q.points;
    } else if (isUnanswered) {
      unansweredCount++;
    } else {
      wrongCount++;
    }

    reviews.push({
      questionId: q.id,
      questionNumber: q.order,
      questionText: q.questionText,
      options: q.options,
      studentAnswer: studentAns,
      correctAnswer: q.correctAnswer,
      isCorrect,
      isUnanswered,
      explanation: q.explanation,
      points: q.points,
      pointsEarned: isCorrect ? q.points : 0,
      source: q.source,
    });
  }

  const now = new Date();
  const startTime = new Date(attempt.startedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - startTime) / 1000));
  const totalExamPoints = attempt.totalPoints || 100;
  const finalScore = Math.round((pointsEarned / totalExamPoints) * 100);

  const submittedAttempt: ExamAttempt = {
    ...attempt,
    id: attemptId,
    status: 'submitted',
    submittedAt: now.toISOString(),
    score: finalScore,
    pointsEarned,
    correctAnswers: correctCount,
    wrongAnswers: wrongCount,
    unanswered: unansweredCount,
    durationSeconds,
    lastSavedAt: now.toISOString(),
  };

  // 5. Save submitted attempt with reviews
  await updateDoc(attemptDocRef, {
    status: 'submitted',
    submittedAt: now.toISOString(),
    score: finalScore,
    pointsEarned,
    correctAnswers: correctCount,
    wrongAnswers: wrongCount,
    unanswered: unansweredCount,
    durationSeconds,
    lastSavedAt: now.toISOString(),
    reviews,
  });

  // 6. Update user's profile statistics in Firestore
  try {
    const userDocRef = doc(db, 'users', userId);
    await runTransaction(db, async (transaction) => {
      const uSnap = await transaction.get(userDocRef);
      if (uSnap.exists()) {
        const uData = uSnap.data() as UserProfile;
        transaction.update(userDocRef, {
          totalPoints: (uData.totalPoints || 0) + pointsEarned,
          weeklyPoints: (uData.weeklyPoints || 0) + pointsEarned,
          monthlyPoints: (uData.monthlyPoints || 0) + pointsEarned,
          examsCompleted: (uData.examsCompleted || 0) + 1,
          correctAnswers: (uData.correctAnswers || 0) + correctCount,
          wrongAnswers: (uData.wrongAnswers || 0) + wrongCount,
          lastActiveAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    });
  } catch (transErr) {
    console.error('Error updating user stats transaction:', transErr);
  }

  return { ...submittedAttempt, reviews } as ExamAttempt & { reviews: QuestionReview[] };
}

/**
 * Fetch reviews for an attempt
 */
export async function getAttemptReviews(attemptId: string, userId: string): Promise<QuestionReview[]> {
  try {
    const attemptDoc = await getDoc(doc(db, 'attempts', attemptId));
    if (!attemptDoc.exists()) return [];
    const data = attemptDoc.data();
    if (data.userId !== userId) {
      throw new Error('غير مصرح بالوصول لمراجعة هذا الامتحان.');
    }
    return (data.reviews as QuestionReview[]) || [];
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }
}
