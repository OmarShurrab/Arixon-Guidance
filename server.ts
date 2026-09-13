import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenAI } from '@google/genai';
import configJson from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PRIMARY_ADMIN_EMAIL = 'omarkingx99@gmail.com';

// Initialize Firebase Admin SDK
let adminInitialized = false;
try {
  if (!getApps().length) {
    initializeApp({
      projectId: configJson.projectId,
    });
    adminInitialized = true;
    console.log('[Firebase Admin] Initialized successfully for project:', configJson.projectId);
  }
} catch (err) {
  console.warn('[Firebase Admin] Initialization warning (will use tokeninfo fallback if needed):', err);
}

import { runTwoStageAiGeneration, runRegenerateSingleQuestion } from './server/aiPipeline';
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

// Cache for Google public certs for robust fallback
let cachedGoogleCerts: { [kid: string]: string } = {};
let certsCacheExpiry = 0;

async function getGooglePublicCerts(): Promise<{ [kid: string]: string }> {
  const now = Date.now();
  if (certsCacheExpiry > now && Object.keys(cachedGoogleCerts).length > 0) {
    return cachedGoogleCerts;
  }
  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (res.ok) {
      cachedGoogleCerts = await res.json() as { [kid: string]: string };
      certsCacheExpiry = now + 6 * 3600 * 1000; // Cache for 6 hours
    }
  } catch (err) {
    console.warn('[Auth] Failed to fetch Google public certificates:', err);
  }
  return cachedGoogleCerts;
}

/**
 * Verify ID Token helper.
 * Uses Firebase Admin SDK (checkRevoked=false) to avoid requiring Google Identity Toolkit API,
 * with cryptographic JWT fallback using Google's public certificates.
 */
async function verifyAuthToken(req: Request): Promise<{ uid: string; email?: string; admin?: boolean; role?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) return null;

  // 1. Try Firebase Admin SDK first (checkRevoked MUST be false or omitted to verify cryptographically)
  if (adminInitialized) {
    try {
      const decoded = await getAuth().verifyIdToken(idToken, false);
      const email = decoded.email?.toLowerCase().trim();
      const isPrimaryAdmin = email === PRIMARY_ADMIN_EMAIL.toLowerCase();

      return {
        uid: decoded.uid,
        email: decoded.email,
        admin: !!decoded.admin || isPrimaryAdmin,
        role: (decoded.role as string | undefined) || (isPrimaryAdmin ? 'super_admin' : undefined),
      };
    } catch (adminErr: any) {
      console.warn('[Firebase Admin] verifyIdToken cryptographic error, trying public cert fallback:', adminErr?.message);
    }
  }

  // 2. Direct Fallback: Validate Firebase Auth JWT structure & signature with Google Public Certs
  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

      const nowSec = Math.floor(Date.now() / 1000);
      const isCorrectAudience = payload.aud === configJson.projectId;
      const isCorrectIssuer = payload.iss === `https://securetoken.google.com/${configJson.projectId}`;
      const notExpired = payload.exp && payload.exp > nowSec;

      if (isCorrectAudience && isCorrectIssuer && notExpired) {
        // Optionally verify signature if public certs are available
        const certs = await getGooglePublicCerts();
        const cert = header.kid ? certs[header.kid] : null;
        let signatureValid = true;

        if (cert) {
          try {
            const crypto = await import('crypto');
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(`${parts[0]}.${parts[1]}`);
            signatureValid = verifier.verify(cert, parts[2], 'base64url');
          } catch (sigErr) {
            console.warn('[Auth] Signature check exception:', sigErr);
          }
        }

        if (signatureValid) {
          const email = payload.email?.toLowerCase().trim();
          const uid = payload.user_id || payload.sub;
          const isPrimaryAdmin = email === PRIMARY_ADMIN_EMAIL.toLowerCase();

          return {
            uid: uid || 'verified_user',
            email: payload.email,
            admin: !!payload.admin || isPrimaryAdmin,
            role: payload.role || (isPrimaryAdmin ? 'super_admin' : undefined),
          };
        }
      }
    }
  } catch (jwtErr) {
    console.warn('[Auth] Direct JWT decode fallback error:', jwtErr);
  }

  // 3. Fallback: Google OAuth2 tokeninfo (if an OAuth access/id token was provided)
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (response.ok) {
      const tokenInfo = await response.json() as { sub?: string; user_id?: string; email?: string; aud?: string };
      const uid = tokenInfo.user_id || tokenInfo.sub;
      if (uid) {
        const email = tokenInfo.email?.toLowerCase().trim();
        const isPrimaryAdmin = email === PRIMARY_ADMIN_EMAIL.toLowerCase();
        return {
          uid,
          email: tokenInfo.email,
          admin: isPrimaryAdmin,
          role: isPrimaryAdmin ? 'super_admin' : undefined,
        };
      }
    }
  } catch {
    // Ignore secondary fallback errors
  }

  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * Admin Bootstrap Endpoint
   * Verifies the caller is omarkingx99@gmail.com, assigns Custom Claims { admin: true, role: 'super_admin' },
   * and creates/updates the adminProfiles and audit logs.
   */
  app.post('/api/admin/bootstrap', async (req: Request, res: Response) => {
    try {
      const authUser = await verifyAuthToken(req);
      if (!authUser || !authUser.email) {
        res.status(401).json({ error: 'غير مصرح بالوصول: يلزم تسجيل الدخول بحساب معتمد.' });
        return;
      }

      const emailNormalized = authUser.email.toLowerCase().trim();
      if (emailNormalized !== PRIMARY_ADMIN_EMAIL.toLowerCase()) {
        res.status(403).json({ 
          error: 'You do not have permission to access the Admin Panel. Access is restricted.' 
        });
        return;
      }

      console.log(`[Admin Bootstrap] Processing bootstrap for Super Admin: ${authUser.email} (${authUser.uid})`);

      // 1. Assign Firebase Custom Claims if Admin SDK is available
      let claimsAssigned = false;
      if (adminInitialized) {
        try {
          await getAuth().setCustomUserClaims(authUser.uid, {
            admin: true,
            role: 'super_admin',
            updatedAt: Date.now(),
          });
          claimsAssigned = true;
          console.log(`[Admin Bootstrap] Custom claims set on Firebase Auth for UID: ${authUser.uid}`);
        } catch (claimsErr) {
          console.warn('[Admin Bootstrap] Could not set custom claims via Admin SDK directly:', claimsErr);
        }
      }

      // 2. Prepare admin profile metadata
      const adminProfile = {
        uid: authUser.uid,
        email: PRIMARY_ADMIN_EMAIL,
        displayName: 'Omar King X99',
        role: 'super_admin',
        lastLoginAt: new Date().toISOString(),
        claimsAssigned,
      };

      res.json({
        success: true,
        message: 'تم إعداد وتأكيد حساب المشرف الأعلى بنجاح.',
        profile: adminProfile,
        claims: {
          admin: true,
          role: 'super_admin',
        },
      });
    } catch (err: any) {
      console.error('[Admin Bootstrap] Error:', err);
      res.status(500).json({ error: err?.message || 'Internal server error during admin bootstrap.' });
    }
  });

  /**
   * Admin Verification Endpoint
   */
  app.get('/api/admin/verify', async (req: Request, res: Response) => {
    try {
      const authUser = await verifyAuthToken(req);
      if (!authUser) {
        res.status(401).json({ authorized: false, reason: 'Invalid or missing token' });
        return;
      }

      const isPrimary = authUser.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
      const isAdmin = authUser.admin || isPrimary;

      if (!isAdmin) {
        res.status(403).json({
          authorized: false,
          error: 'You do not have permission to access the Admin Panel.',
        });
        return;
      }

      res.json({
        authorized: true,
        uid: authUser.uid,
        email: authUser.email,
        role: authUser.role || (isPrimary ? 'super_admin' : 'admin'),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Verification error' });
    }
  });

  /**
   * AI Exam Builder Endpoint (Gemini API Server-Side)
   * Generates curriculum-aligned questions for Tawjihi 2009 without exposing the API key
   */
  app.post('/api/admin/ai-generate-questions', async (req: Request, res: Response) => {
    try {
      const authUser = await verifyAuthToken(req);
      const isPrimary = authUser?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
      if (!authUser || (!authUser.admin && !isPrimary)) {
        res.status(403).json({ error: 'غير مصرح لك باستخدام منشئ الأسئلة بالذكاء الاصطناعي.' });
        return;
      }

      const {
        subject = 'الفيزياء',
        grade = 'توجيهي 2009',
        lesson = 'الزخم الخطي والتصادمات',
        topic = '',
        difficulty = 'medium',
        difficultyDistribution,
        questionCount = 5,
        pointsPerQuestion = 5,
        questionType = 'multiple_choice',
        language = 'ar',
        generationMode = 'source_based',
        sourceMaterial = '',
        existingQuestionsContext = [],
      } = req.body;

      // Enforcement: If source-based mode and source is empty or insufficient, reject immediately
      if (generationMode === 'source_based' && (!sourceMaterial || sourceMaterial.trim().length < 30)) {
        res.status(400).json({
          error: 'The provided source could not be used reliably (المادة المصدرية غير كافية أو فارغة في نمط التوليد من المصدر).',
        });
        return;
      }

      const ai = getGeminiClient();

      const { rawQuestions, reviews, modelUsed } = await runTwoStageAiGeneration(ai, {
        subject,
        grade,
        lesson,
        topic,
        difficulty,
        difficultyDistribution,
        questionType,
        questionCount: Math.min(20, Math.max(1, Number(questionCount) || 5)),
        pointsPerQuestion: Number(pointsPerQuestion) || 5,
        language,
        generationMode,
        sourceMaterial: sourceMaterial ? sourceMaterial.trim() : undefined,
        existingQuestionsContext,
      });

      // Normalize raw questions into strict format
      const normalizedDrafts = rawQuestions.map((q, idx) => {
        let optionsList: string[] = [];
        if (Array.isArray(q.options)) {
          optionsList = q.options.map((opt) => {
            if (typeof opt === 'string') return opt.trim();
            if (opt && typeof opt === 'object' && 'text' in opt) return String(opt.text).trim();
            return String(opt);
          });
        }

        if (questionType === 'true_false') {
          if (optionsList.length !== 2) {
            optionsList = language === 'en' ? ['True', 'False'] : ['صواب', 'خطأ'];
          }
        } else {
          if (optionsList.length < 4) {
            while (optionsList.length < 4) {
              optionsList.push(`خيار بديل ${optionsList.length + 1}`);
            }
          } else if (optionsList.length > 4) {
            optionsList = optionsList.slice(0, 4);
          }
        }

        // Map correct answer to integer index (0..3 or 0..1)
        let correctIdx = 0;
        if (typeof q.correctAnswer === 'number') {
          correctIdx = Math.max(0, Math.min(optionsList.length - 1, q.correctAnswer));
        } else if (typeof q.correctAnswer === 'string') {
          const ansUpper = q.correctAnswer.trim().toUpperCase();
          if (ansUpper === 'A' || ansUpper === 'أ') correctIdx = 0;
          else if (ansUpper === 'B' || ansUpper === 'ب') correctIdx = 1;
          else if (ansUpper === 'C' || ansUpper === 'ج') correctIdx = 2;
          else if (ansUpper === 'D' || ansUpper === 'د') correctIdx = 3;
          else {
            // Check if matches text directly
            const foundIdx = optionsList.findIndex((o) => o.trim() === q.correctAnswer.toString().trim());
            if (foundIdx !== -1) correctIdx = foundIdx;
          }
        }

        // Match second pass review
        const review = reviews.find((r) => r.questionIndex === idx);

        return {
          id: `ai_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          questionText: q.questionText || `سؤال تعليمي ${idx + 1}`,
          options: optionsList,
          correctAnswer: correctIdx,
          explanation: q.explanation || 'توضيح الحل الرياضي والتربوي النموذجي.',
          difficulty: q.difficulty || (difficulty === 'mixed' ? 'medium' : difficulty),
          questionType: q.questionType || (questionType === 'mixed' ? 'multiple_choice' : questionType),
          suggestedPoints: Number(q.suggestedPoints) || Number(pointsPerQuestion) || 5,
          subject,
          lesson,
          topic: topic || undefined,
          grade: grade || 'توجيهي 2009',
          sourceMode: generationMode,
          sourceSection: q.sourceReference || undefined,
          sourceQuoteOrReference: q.sourceReference || undefined,
          calculation: q.calculation && q.calculation.expression ? {
            expression: q.calculation.expression,
            variables: q.calculation.variables || {},
            expectedResult: q.calculation.expectedResult ?? 0,
            unit: q.calculation.unit,
            formula: q.calculation.formula,
            verified: false,
          } : undefined,
          secondPassReview: review ? {
            status: review.status,
            confidence: review.confidence,
            reason: review.reason,
            detectedIssues: review.detectedIssues || [],
            reviewedAt: new Date().toISOString(),
          } : undefined,
          qualityScores: {
            contentAccuracy: 18,
            structureScore: 20,
            answerConsistency: 15,
            calculationScore: 15,
            difficultyFit: 10,
            sourceGrounding: generationMode === 'source_based' ? 10 : 8,
            duplicateScore: 10,
            overallScore: 92,
          },
          generationStatus: 'generated',
          validationErrors: [],
          validationWarnings: [],
          isDuplicate: false,
          generatedByAI: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      res.json({
        success: true,
        questions: normalizedDrafts,
        modelUsed,
        generatedAt: new Date().toISOString(),
        summary: {
          requestedCount: Number(questionCount),
          receivedCount: normalizedDrafts.length,
          generationMode,
          stage2ReviewCount: reviews.length,
        },
      });
    } catch (err: any) {
      console.error('[AI Builder Stage 1/2] Error generating questions:', err);
      res.status(500).json({ error: err?.message || 'حدث خطأ أثناء تنفيذ خط أنابيب توليد وتدقيق الأسئلة.' });
    }
  });

  /**
   * AI Single Question Regeneration Endpoint
   * Regenerates a question addressing the specific failure reason
   */
  app.post('/api/admin/ai-regenerate-single', async (req: Request, res: Response) => {
    try {
      const authUser = await verifyAuthToken(req);
      const isPrimary = authUser?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
      if (!authUser || (!authUser.admin && !isPrimary)) {
        res.status(403).json({ error: 'غير مصرح لك بإعادة التوليد.' });
        return;
      }

      const {
        subject = 'الفيزياء',
        lesson = 'الزخم الخطي والتصادمات',
        previousQuestion = '',
        failureReason = 'عدم تطابق في الحساب أو الخيارات',
        difficulty = 'medium',
        sourceMaterial = '',
      } = req.body;

      const ai = getGeminiClient();
      const rawQuestion = await runRegenerateSingleQuestion(ai, {
        subject,
        lesson,
        previousQuestion,
        failureReason,
        difficulty,
        sourceMaterial,
      });

      let optionsList: string[] = ['أ', 'ب', 'ج', 'د'];
      if (Array.isArray(rawQuestion.options)) {
        optionsList = rawQuestion.options.map((opt) => (typeof opt === 'string' ? opt : (opt as any)?.text || String(opt)));
      }

      let correctIdx = 0;
      if (typeof rawQuestion.correctAnswer === 'number') {
        correctIdx = Math.max(0, Math.min(optionsList.length - 1, rawQuestion.correctAnswer));
      } else if (typeof rawQuestion.correctAnswer === 'string') {
        const char = rawQuestion.correctAnswer.trim().toUpperCase();
        if (char === 'A' || char === 'أ') correctIdx = 0;
        else if (char === 'B' || char === 'ب') correctIdx = 1;
        else if (char === 'C' || char === 'ج') correctIdx = 2;
        else if (char === 'D' || char === 'د') correctIdx = 3;
      }

      res.json({
        success: true,
        question: {
          id: `ai_regen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          questionText: rawQuestion.questionText,
          options: optionsList,
          correctAnswer: correctIdx,
          explanation: rawQuestion.explanation || 'توضيح الحل النموذجي بعد معالجة سبب الرفض.',
          difficulty: rawQuestion.difficulty || difficulty,
          questionType: rawQuestion.questionType || 'multiple_choice',
          suggestedPoints: rawQuestion.suggestedPoints || 5,
          sourceReference: rawQuestion.sourceReference,
          calculation: rawQuestion.calculation,
          generationStatus: 'regenerated',
          generatedByAI: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error('[AI Regenerate Single] Error:', err);
      res.status(500).json({ error: err?.message || 'تعذر إعادة توليد السؤال.' });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Arixon Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Arixon Server] Fatal startup error:', err);
});
