/**
 * Judge System - Automated verification and quality assurance
 *
 * Provides automated verification of task completion through configurable
 * criteria evaluation. Supports rework loops for failed verification and
 * confidence-based decision making.
 *
 * @module judge-system
 * @see JudgeVerdict for verdict structure
 * @see JudgeCriterion for individual criteria
 *
 * Sample usage:
 *   const judge = new JudgeSystem(config);
 *   const verdict = await judge.verify(task, result);
 *   if (verdict.requiresRework) { ... }
 */

import { fileURLToPath } from 'url';
import type {
  HierarchicalTask,
  TaskResult,
  JudgeVerdict,
  JudgeCriterion,
  JudgeCriterionType,
  JudgeConfig,
  JudgeCriterionConfig,
  ExtendedAgentRole
} from '../types/swarm-types.js';

/**
 * Verification request for the judge.
 */
export interface VerificationRequest {
  task: HierarchicalTask;
  result: TaskResult;
  previousVerdicts?: JudgeVerdict[];
  customCriteria?: JudgeCriterionType[];
  customPrompt?: string;
}

/**
 * Rework instruction generated from failed verification.
 */
export interface ReworkInstruction {
  taskId: string;
  originalPrompt: string;
  failedCriteria: JudgeCriterion[];
  reworkPrompt: string;
  attemptNumber: number;
  maxAttempts: number;
}

/**
 * Default judge configuration.
 */
const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  enabled: true,
  passThreshold: 0.8,
  confidenceThreshold: 0.7,
  maxRetries: 2,

  criteria: [
    { type: 'completeness', enabled: true, weight: 0.3, passThreshold: 0.8 },
    { type: 'correctness', enabled: true, weight: 0.4, passThreshold: 0.9 },
    { type: 'quality', enabled: true, weight: 0.2, passThreshold: 0.7 },
    { type: 'testing', enabled: false, weight: 0.1, passThreshold: 0.8 }
  ],

  autoReworkOnFailure: true,
  requireHumanApprovalThreshold: 0.5
};

/**
 * Criterion evaluation prompts for different criteria types.
 */
const CRITERION_PROMPTS: Record<JudgeCriterionType, string> = {
  completeness: 'Does the output fully address all requirements in the task prompt?',
  correctness: 'Is the output technically correct and free of errors?',
  quality: 'Does the output meet professional quality standards?',
  testing: 'Are there adequate tests with good coverage?',
  documentation: 'Is the documentation clear and comprehensive?',
  security: 'Are there any security vulnerabilities or concerns?',
  performance: 'Does the output meet performance requirements?',
  custom: ''
};

/**
 * Judge system for automated task verification.
 */
export class JudgeSystem {
  private config: JudgeConfig;
  private verdictHistory: Map<string, JudgeVerdict[]> = new Map();
  private judgeIdCounter: number = 0;

  constructor(config: Partial<JudgeConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_JUDGE_CONFIG, config);
  }

  /**
   * Merge configuration with defaults.
   */
  private mergeConfig(defaults: JudgeConfig, overrides: Partial<JudgeConfig>): JudgeConfig {
    const merged = { ...defaults, ...overrides };

    // Merge criteria arrays if provided
    if (overrides.criteria) {
      merged.criteria = overrides.criteria.map(override => {
        const defaultCriterion = defaults.criteria.find(d => d.type === override.type);
        return defaultCriterion ? { ...defaultCriterion, ...override } : override;
      });
    }

    return merged;
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  /**
   * Verify task completion against criteria.
   */
  async verify(request: VerificationRequest): Promise<JudgeVerdict> {
    const { task, result, customCriteria } = request;

    if (!this.config.enabled) {
      // Return auto-pass verdict if judge is disabled
      return this.createAutoPassVerdict(task);
    }

    // Determine which criteria to evaluate
    const criteriaToEvaluate = this.selectCriteria(task, customCriteria);

    // Evaluate each criterion
    const evaluatedCriteria: JudgeCriterion[] = [];
    for (const criterionConfig of criteriaToEvaluate) {
      const criterion = await this.evaluateCriterion(
        task,
        result,
        criterionConfig,
        request.customPrompt
      );
      evaluatedCriteria.push(criterion);
    }

    // Calculate overall score (weighted average)
    const overallScore = this.calculateOverallScore(evaluatedCriteria);

    // Determine pass/fail
    const passed = overallScore >= this.config.passThreshold &&
      evaluatedCriteria.every(c => !c.passed ? c.weight < 0.3 : true);

    // Calculate confidence
    const confidence = this.calculateConfidence(evaluatedCriteria);

    // Determine if rework is needed
    const requiresRework = !passed && this.config.autoReworkOnFailure;

    // Generate rework instructions if needed
    const reworkInstructions = requiresRework
      ? this.generateReworkInstructions(task, evaluatedCriteria)
      : undefined;

    const verdict: JudgeVerdict = {
      taskId: task.id,
      judgeAgentId: this.generateJudgeId(),
      timestamp: Date.now(),

      passed,
      confidence,
      overallScore,

      criteria: evaluatedCriteria,

      requiresRework,
      reworkInstructions,

      executionTimeMs: 0 // Would be set by actual execution
    };

    // Store in history
    this.addToHistory(task.id, verdict);

    return verdict;
  }

  /**
   * Select criteria based on task role and custom overrides.
   */
  private selectCriteria(
    task: HierarchicalTask,
    customCriteria?: JudgeCriterionType[]
  ): JudgeCriterionConfig[] {
    if (customCriteria && customCriteria.length > 0) {
      // Use custom criteria selection - enable them for this evaluation
      return this.config.criteria
        .filter(c => customCriteria.includes(c.type))
        .map(c => ({ ...c, enabled: true }));
    }

    // Select based on task role - role requirements override default enabled state
    const roleCriteria = this.getCriteriaForRole(task.role);

    // Get criteria that match role requirements, enabling them for evaluation
    const matchingCriteria = this.config.criteria
      .filter(c => roleCriteria.includes(c.type))
      .map(c => ({ ...c, enabled: true }));

    // If no matching criteria in config, create defaults for required types
    const configuredTypes = matchingCriteria.map(c => c.type);
    const missingTypes = roleCriteria.filter(t => !configuredTypes.includes(t));

    for (const type of missingTypes) {
      matchingCriteria.push({
        type,
        enabled: true,
        weight: 1.0 / roleCriteria.length,
        passThreshold: 0.7
      });
    }

    return matchingCriteria;
  }

  /**
   * Get relevant criteria for a role.
   */
  private getCriteriaForRole(role: ExtendedAgentRole): JudgeCriterionType[] {
    const roleMapping: Record<ExtendedAgentRole, JudgeCriterionType[]> = {
      analysis: ['completeness', 'correctness'],
      implementation: ['completeness', 'correctness', 'quality', 'security'],
      testing: ['completeness', 'correctness', 'testing'],
      documentation: ['completeness', 'documentation'],
      debugging: ['completeness', 'correctness'],
      planner: ['completeness'],
      judge: ['correctness'],
      synthesizer: ['completeness', 'quality'],
      monitor: ['completeness']
    };

    return roleMapping[role] || ['completeness', 'correctness'];
  }

  /**
   * Evaluate a single criterion.
   */
  private async evaluateCriterion(
    task: HierarchicalTask,
    result: TaskResult,
    criterionConfig: JudgeCriterionConfig,
    customPrompt?: string
  ): Promise<JudgeCriterion> {
    // Rule-based evaluation (can be extended with AI evaluation)
    const evaluation = this.ruleBasedEvaluation(task, result, criterionConfig.type);

    return {
      type: criterionConfig.type,
      name: this.getCriterionName(criterionConfig.type),
      description: customPrompt || CRITERION_PROMPTS[criterionConfig.type],
      weight: criterionConfig.weight,
      passed: evaluation.score >= criterionConfig.passThreshold,
      score: evaluation.score,
      feedback: evaluation.feedback,
      evidence: evaluation.evidence
    };
  }

  /**
   * Rule-based criterion evaluation.
   */
  private ruleBasedEvaluation(
    task: HierarchicalTask,
    result: TaskResult,
    criterionType: JudgeCriterionType
  ): { score: number; feedback: string; evidence: string[] } {
    const evidence: string[] = [];
    let score = 0;
    let feedback = '';

    // Base score from task result
    if (result.success) {
      score += 0.5;
      evidence.push('Task completed successfully');
    } else {
      evidence.push('Task did not complete successfully');
      feedback = 'Task execution reported failure. ';
    }

    // Evaluate based on criterion type
    switch (criterionType) {
      case 'completeness':
        score += this.evaluateCompleteness(task, result, evidence);
        break;

      case 'correctness':
        score += this.evaluateCorrectness(task, result, evidence);
        break;

      case 'quality':
        score += this.evaluateQuality(result, evidence);
        break;

      case 'testing':
        score += this.evaluateTesting(result, evidence);
        break;

      case 'documentation':
        score += this.evaluateDocumentation(result, evidence);
        break;

      case 'security':
        score += this.evaluateSecurity(result, evidence);
        break;

      case 'performance':
        score += this.evaluatePerformance(result, evidence);
        break;

      default:
        score = result.success ? 0.8 : 0.3;
    }

    // Normalize score
    score = Math.max(0, Math.min(1, score));

    // Generate feedback
    if (!feedback) {
      if (score >= 0.9) {
        feedback = 'Excellent work. All requirements met.';
      } else if (score >= 0.7) {
        feedback = 'Good work with minor issues.';
      } else if (score >= 0.5) {
        feedback = 'Acceptable but needs improvement.';
      } else {
        feedback = 'Significant issues found. Rework recommended.';
      }
    }

    return { score, feedback, evidence };
  }

  private evaluateCompleteness(
    task: HierarchicalTask,
    result: TaskResult,
    evidence: string[]
  ): number {
    let score = 0;

    // Check if output is substantial
    if (result.output && result.output.length > 50) {
      score += 0.2;
      evidence.push('Output contains substantial content');
    }

    // Check for summary
    if (result.summary && result.summary.length > 0) {
      score += 0.1;
      evidence.push('Summary provided');
    }

    // Check for artifacts
    if (result.artifacts && result.artifacts.length > 0) {
      score += 0.1;
      evidence.push(`${result.artifacts.length} artifact(s) produced`);
    }

    // Check if output mentions key terms from prompt
    const promptTerms = task.prompt.toLowerCase().split(/\s+/).filter(t => t.length > 4);
    const outputLower = (result.output || '').toLowerCase();
    const mentionedTerms = promptTerms.filter(t => outputLower.includes(t));
    const termCoverage = promptTerms.length > 0 ? mentionedTerms.length / promptTerms.length : 0;

    score += termCoverage * 0.1;
    if (termCoverage > 0.5) {
      evidence.push('Output addresses key terms from the prompt');
    }

    return score;
  }

  private evaluateCorrectness(
    task: HierarchicalTask,
    result: TaskResult,
    evidence: string[]
  ): number {
    let score = 0;

    // No errors reported
    if (!result.error) {
      score += 0.2;
      evidence.push('No errors reported');
    } else {
      evidence.push(`Error reported: ${result.error.message}`);
    }

    // Metrics indicate success
    if (result.metrics) {
      if (result.metrics.testsRun && result.metrics.testsPassed) {
        const passRate = result.metrics.testsPassed / result.metrics.testsRun;
        score += passRate * 0.2;
        evidence.push(`Test pass rate: ${Math.round(passRate * 100)}%`);
      }
    }

    // Output doesn't contain error indicators
    const outputLower = (result.output || '').toLowerCase();
    const errorIndicators = ['error', 'exception', 'failed', 'undefined', 'null reference'];
    const hasErrors = errorIndicators.some(ind => outputLower.includes(ind));

    if (!hasErrors) {
      score += 0.1;
      evidence.push('No error indicators in output');
    }

    return score;
  }

  private evaluateQuality(result: TaskResult, evidence: string[]): number {
    let score = 0;
    const output = result.output || '';

    // Output is well-structured (has sections)
    if (output.includes('\n\n') || output.includes('##') || output.includes('```')) {
      score += 0.15;
      evidence.push('Output is well-structured');
    }

    // Reasonable length (not too short or too long)
    if (output.length >= 100 && output.length <= 50000) {
      score += 0.15;
      evidence.push('Output length is appropriate');
    }

    // Contains code blocks if implementation
    if (output.includes('```')) {
      score += 0.1;
      evidence.push('Contains formatted code blocks');
    }

    // Has explanations
    if (output.match(/because|therefore|this ensures|this allows/i)) {
      score += 0.1;
      evidence.push('Contains explanations');
    }

    return score;
  }

  private evaluateTesting(result: TaskResult, evidence: string[]): number {
    let score = 0;

    if (result.metrics?.testsRun) {
      score += 0.2;
      evidence.push(`${result.metrics.testsRun} tests executed`);

      if (result.metrics.testsPassed === result.metrics.testsRun) {
        score += 0.3;
        evidence.push('All tests passed');
      } else if (result.metrics.testsPassed && result.metrics.testsPassed > 0) {
        const passRate = result.metrics.testsPassed / result.metrics.testsRun;
        score += passRate * 0.3;
        evidence.push(`${result.metrics.testsPassed}/${result.metrics.testsRun} tests passed`);
      }
    }

    // Check output for test-related content
    const output = result.output || '';
    if (output.includes('test') || output.includes('spec') || output.includes('expect')) {
      score += 0.1;
      evidence.push('Output contains test-related content');
    }

    return score;
  }

  private evaluateDocumentation(result: TaskResult, evidence: string[]): number {
    let score = 0;
    const output = result.output || '';

    // Has headers/sections
    if (output.includes('#') || output.includes('===')) {
      score += 0.15;
      evidence.push('Documentation has section headers');
    }

    // Has examples
    if (output.includes('example') || output.includes('```')) {
      score += 0.15;
      evidence.push('Documentation includes examples');
    }

    // Has descriptions
    if (output.length > 200) {
      score += 0.1;
      evidence.push('Documentation is substantive');
    }

    // Has parameter/API documentation
    if (output.includes('@param') || output.includes('Parameters:') || output.includes('Args:')) {
      score += 0.1;
      evidence.push('API parameters documented');
    }

    return score;
  }

  private evaluateSecurity(result: TaskResult, evidence: string[]): number {
    let score = 0.3; // Start with baseline
    const output = result.output || '';
    const outputLower = output.toLowerCase();

    // Check for common security issues
    const securityConcerns = [
      'sql injection',
      'xss',
      'csrf',
      'hardcoded password',
      'eval(',
      'exec(',
      'dangerouslySetInnerHTML'
    ];

    const foundConcerns = securityConcerns.filter(c => outputLower.includes(c.toLowerCase()));

    if (foundConcerns.length > 0) {
      evidence.push(`Potential security concerns: ${foundConcerns.join(', ')}`);
      score -= foundConcerns.length * 0.1;
    } else {
      score += 0.2;
      evidence.push('No obvious security concerns detected');
    }

    // Check for security best practices
    if (outputLower.includes('sanitize') || outputLower.includes('validate') || outputLower.includes('escape')) {
      score += 0.1;
      evidence.push('Security best practices mentioned');
    }

    return Math.max(0, score);
  }

  private evaluatePerformance(result: TaskResult, evidence: string[]): number {
    let score = 0;

    if (result.metrics?.executionTimeMs) {
      // Fast execution is good
      if (result.metrics.executionTimeMs < 1000) {
        score += 0.3;
        evidence.push('Fast execution time');
      } else if (result.metrics.executionTimeMs < 10000) {
        score += 0.2;
        evidence.push('Acceptable execution time');
      } else {
        score += 0.1;
        evidence.push('Slow execution time');
      }
    }

    const outputLower = (result.output || '').toLowerCase();

    // Check for performance optimizations mentioned
    if (outputLower.includes('optimize') || outputLower.includes('cache') || outputLower.includes('performance')) {
      score += 0.1;
      evidence.push('Performance considerations mentioned');
    }

    // No performance anti-patterns
    if (!outputLower.includes('n+1') && !outputLower.includes('memory leak')) {
      score += 0.1;
      evidence.push('No obvious performance anti-patterns');
    }

    return score;
  }

  /**
   * Get human-readable criterion name.
   */
  private getCriterionName(type: JudgeCriterionType): string {
    const names: Record<JudgeCriterionType, string> = {
      completeness: 'Completeness',
      correctness: 'Correctness',
      quality: 'Code Quality',
      testing: 'Test Coverage',
      documentation: 'Documentation',
      security: 'Security',
      performance: 'Performance',
      custom: 'Custom'
    };
    return names[type] || type;
  }

  // ===========================================================================
  // SCORING
  // ===========================================================================

  /**
   * Calculate weighted overall score.
   */
  private calculateOverallScore(criteria: JudgeCriterion[]): number {
    if (criteria.length === 0) return 1.0;

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 1.0;

    const weightedSum = criteria.reduce((sum, c) => sum + c.score * c.weight, 0);
    return weightedSum / totalWeight;
  }

  /**
   * Calculate confidence in the verdict.
   */
  private calculateConfidence(criteria: JudgeCriterion[]): number {
    if (criteria.length === 0) return 1.0;

    // Confidence is based on:
    // 1. Number of criteria evaluated
    // 2. Score consistency
    // 3. Evidence availability

    const numCriteria = criteria.length;
    const criteriaConfidence = Math.min(numCriteria / 4, 1.0) * 0.3;

    // Score consistency (low variance = high confidence)
    const scores = criteria.map(c => c.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length;
    const consistencyConfidence = (1 - Math.min(variance, 1)) * 0.4;

    // Evidence availability
    const evidenceCount = criteria.reduce((sum, c) => sum + (c.evidence?.length || 0), 0);
    const evidenceConfidence = Math.min(evidenceCount / (criteria.length * 3), 1.0) * 0.3;

    return criteriaConfidence + consistencyConfidence + evidenceConfidence;
  }

  // ===========================================================================
  // REWORK GENERATION
  // ===========================================================================

  /**
   * Generate rework instructions for failed verification.
   */
  private generateReworkInstructions(
    task: HierarchicalTask,
    criteria: JudgeCriterion[]
  ): string {
    const failedCriteria = criteria.filter(c => !c.passed);

    if (failedCriteria.length === 0) {
      return 'Please review and improve the overall quality.';
    }

    const instructions: string[] = [
      'The following issues need to be addressed:\n'
    ];

    for (const criterion of failedCriteria) {
      instructions.push(`- ${criterion.name}: ${criterion.feedback}`);
      if (criterion.evidence && criterion.evidence.length > 0) {
        instructions.push(`  Evidence: ${criterion.evidence.join('; ')}`);
      }
    }

    instructions.push('\nPlease rework the task addressing these specific issues.');

    return instructions.join('\n');
  }

  /**
   * Create a rework instruction object.
   */
  createReworkInstruction(
    task: HierarchicalTask,
    verdict: JudgeVerdict,
    attemptNumber: number
  ): ReworkInstruction {
    const failedCriteria = verdict.criteria.filter(c => !c.passed);

    return {
      taskId: task.id,
      originalPrompt: task.prompt,
      failedCriteria,
      reworkPrompt: this.buildReworkPrompt(task, failedCriteria),
      attemptNumber,
      maxAttempts: this.config.maxRetries + 1
    };
  }

  /**
   * Build a rework prompt from failed criteria.
   */
  private buildReworkPrompt(task: HierarchicalTask, failedCriteria: JudgeCriterion[]): string {
    const issues = failedCriteria.map(c => `- ${c.name}: ${c.feedback}`).join('\n');

    return `Rework required for the following task:

Original task: ${task.prompt}

Issues identified by verification:
${issues}

Please address all the issues above and resubmit. Focus on:
${failedCriteria.map(c => `- Improving ${c.name.toLowerCase()}`).join('\n')}`;
  }

  // ===========================================================================
  // HISTORY & UTILITIES
  // ===========================================================================

  /**
   * Add verdict to history.
   */
  private addToHistory(taskId: string, verdict: JudgeVerdict): void {
    if (!this.verdictHistory.has(taskId)) {
      this.verdictHistory.set(taskId, []);
    }
    this.verdictHistory.get(taskId)!.push(verdict);
  }

  /**
   * Get verdict history for a task.
   */
  getVerdictHistory(taskId: string): JudgeVerdict[] {
    return this.verdictHistory.get(taskId) || [];
  }

  /**
   * Get latest verdict for a task.
   */
  getLatestVerdict(taskId: string): JudgeVerdict | undefined {
    const history = this.verdictHistory.get(taskId);
    return history && history.length > 0 ? history[history.length - 1] : undefined;
  }

  /**
   * Check if task has exceeded retry limit.
   */
  hasExceededRetries(taskId: string): boolean {
    const history = this.verdictHistory.get(taskId) || [];
    const failedAttempts = history.filter(v => !v.passed).length;
    return failedAttempts >= this.config.maxRetries;
  }

  /**
   * Create auto-pass verdict (when judge is disabled).
   */
  private createAutoPassVerdict(task: HierarchicalTask): JudgeVerdict {
    return {
      taskId: task.id,
      judgeAgentId: 'auto-pass',
      timestamp: Date.now(),
      passed: true,
      confidence: 1.0,
      overallScore: 1.0,
      criteria: [],
      requiresRework: false,
      executionTimeMs: 0,
      metadata: { reason: 'Judge system disabled' }
    };
  }

  /**
   * Generate judge agent ID.
   */
  private generateJudgeId(): string {
    this.judgeIdCounter++;
    return `judge-${Date.now().toString(36)}-${this.judgeIdCounter}`;
  }

  /**
   * Check if verdict requires human approval.
   */
  requiresHumanApproval(verdict: JudgeVerdict): boolean {
    return verdict.confidence < this.config.requireHumanApprovalThreshold;
  }

  /**
   * Get configuration.
   */
  getConfig(): JudgeConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<JudgeConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  /**
   * Clear verdict history.
   */
  clearHistory(taskId?: string): void {
    if (taskId) {
      this.verdictHistory.delete(taskId);
    } else {
      this.verdictHistory.clear();
    }
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  (async () => {
    const judge = new JudgeSystem();

    const allValidationFailures: string[] = [];
    let totalTests = 0;

    console.log('Testing JudgeSystem...\n');

    // Test 1: Verify successful task
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-1',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Implement user login feature',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'high',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: true,
        output: `
## Implementation Complete

Implemented user login feature with the following:

\`\`\`typescript
async function login(email: string, password: string) {
  const user = await validateCredentials(email, password);
  if (!user) throw new Error('Invalid credentials');
  return generateToken(user);
}
\`\`\`

This ensures secure authentication because we validate credentials and generate tokens.
        `,
        summary: 'Login feature implemented with validation',
        metrics: {
          executionTimeMs: 500,
          testsRun: 5,
          testsPassed: 5
        }
      };

      const verdict = await judge.verify({ task, result });

      if (!verdict.passed) {
        allValidationFailures.push(`SuccessfulTask: Expected pass, got fail (score: ${verdict.overallScore})`);
      } else {
        console.log(`  ✓ Verify successful task (score: ${verdict.overallScore.toFixed(2)})`);
      }
    } catch (error) {
      allValidationFailures.push(`SuccessfulTask: ${error}`);
    }

    // Test 2: Verify failed task
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-2',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Implement comprehensive error handling',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'high',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: false,
        output: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Failed to complete task',
          recoverable: true
        }
      };

      const verdict = await judge.verify({ task, result });

      if (verdict.passed) {
        allValidationFailures.push(`FailedTask: Expected fail, got pass`);
      } else if (!verdict.requiresRework) {
        allValidationFailures.push(`FailedTask: Expected requiresRework to be true`);
      } else {
        console.log(`  ✓ Verify failed task (score: ${verdict.overallScore.toFixed(2)}, rework: true)`);
      }
    } catch (error) {
      allValidationFailures.push(`FailedTask: ${error}`);
    }

    // Test 3: Criterion selection by role
    totalTests++;
    try {
      const testingTask: HierarchicalTask = {
        id: 'task-3',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Write unit tests',
        role: 'testing',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'medium',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: true,
        output: `
\`\`\`typescript
describe('User', () => {
  test('should create user', () => {
    expect(createUser('test')).toBeDefined();
  });
});
\`\`\`
        `,
        metrics: {
          executionTimeMs: 200,
          testsRun: 10,
          testsPassed: 10
        }
      };

      const verdict = await judge.verify({ task: testingTask, result });

      // Testing role should include testing criterion
      const hasTestingCriterion = verdict.criteria.some(c => c.type === 'testing');
      if (!hasTestingCriterion) {
        allValidationFailures.push('CriterionSelection: Testing criterion missing for testing role');
      } else {
        console.log(`  ✓ Criterion selection by role (${verdict.criteria.length} criteria)`);
      }
    } catch (error) {
      allValidationFailures.push(`CriterionSelection: ${error}`);
    }

    // Test 4: Custom criteria
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-4',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Security audit',
        role: 'analysis',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'high',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: true,
        output: 'Security analysis complete. No SQL injection or XSS vulnerabilities found.',
        summary: 'Security audit passed'
      };

      // Use custom criteria to evaluate security
      judge.updateConfig({
        criteria: [
          ...judge.getConfig().criteria,
          { type: 'security', enabled: true, weight: 1.0, passThreshold: 0.6 }
        ]
      });

      const verdict = await judge.verify({
        task,
        result,
        customCriteria: ['security']
      });

      const hasSecurityCriterion = verdict.criteria.some(c => c.type === 'security');
      if (!hasSecurityCriterion) {
        allValidationFailures.push('CustomCriteria: Security criterion not used');
      } else {
        console.log(`  ✓ Custom criteria (security score: ${verdict.criteria.find(c => c.type === 'security')?.score.toFixed(2)})`);
      }
    } catch (error) {
      allValidationFailures.push(`CustomCriteria: ${error}`);
    }

    // Test 5: Verdict history
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-history',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Test history',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'medium',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      // Create multiple verdicts
      await judge.verify({ task, result: { success: true, output: 'First attempt' } });
      await judge.verify({ task, result: { success: true, output: 'Second attempt' } });

      const history = judge.getVerdictHistory('task-history');
      if (history.length !== 2) {
        allValidationFailures.push(`VerdictHistory: Expected 2 verdicts, got ${history.length}`);
      } else {
        console.log('  ✓ Verdict history (2 verdicts recorded)');
      }
    } catch (error) {
      allValidationFailures.push(`VerdictHistory: ${error}`);
    }

    // Test 6: Rework instruction generation
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-rework',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Implement feature with documentation',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'high',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: false,
        output: 'Incomplete implementation',
        error: { code: 'INCOMPLETE', message: 'Missing parts', recoverable: true }
      };

      const verdict = await judge.verify({ task, result });
      const reworkInstruction = judge.createReworkInstruction(task, verdict, 1);

      if (!reworkInstruction.reworkPrompt.includes('Rework required')) {
        allValidationFailures.push('ReworkInstruction: Invalid rework prompt');
      } else if (reworkInstruction.attemptNumber !== 1) {
        allValidationFailures.push('ReworkInstruction: Wrong attempt number');
      } else {
        console.log('  ✓ Rework instruction generation');
      }
    } catch (error) {
      allValidationFailures.push(`ReworkInstruction: ${error}`);
    }

    // Test 7: Retry limit check
    totalTests++;
    try {
      judge.clearHistory('task-retry-limit');

      const task: HierarchicalTask = {
        id: 'task-retry-limit',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Test retry limit',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'medium',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      // Create failing verdicts
      for (let i = 0; i < 3; i++) {
        await judge.verify({ task, result: { success: false, output: 'fail' } });
      }

      const exceeded = judge.hasExceededRetries('task-retry-limit');
      if (!exceeded) {
        allValidationFailures.push('RetryLimit: Should have exceeded retry limit');
      } else {
        console.log('  ✓ Retry limit check (limit exceeded after 3 failures)');
      }
    } catch (error) {
      allValidationFailures.push(`RetryLimit: ${error}`);
    }

    // Test 8: Confidence calculation
    totalTests++;
    try {
      const task: HierarchicalTask = {
        id: 'task-confidence',
        parentId: null,
        depth: 0,
        children: [],
        prompt: 'Implement with high confidence',
        role: 'implementation',
        workFolder: '/tmp',
        returnMode: 'full',
        dependencies: [],
        status: 'completed',
        priority: 'high',
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        tags: []
      };

      const result: TaskResult = {
        success: true,
        output: `
Complete implementation with proper error handling.
This ensures reliability because all edge cases are covered.
\`\`\`typescript
function example() { return true; }
\`\`\`
        `,
        summary: 'Done',
        metrics: {
          executionTimeMs: 100,
          testsRun: 10,
          testsPassed: 10
        }
      };

      const verdict = await judge.verify({ task, result });

      if (verdict.confidence < 0.5 || verdict.confidence > 1.0) {
        allValidationFailures.push(`Confidence: Invalid confidence value ${verdict.confidence}`);
      } else {
        console.log(`  ✓ Confidence calculation (confidence: ${verdict.confidence.toFixed(2)})`);
      }
    } catch (error) {
      allValidationFailures.push(`Confidence: ${error}`);
    }

    // Report results
    console.log('\n' + '─'.repeat(50));
    if (allValidationFailures.length > 0) {
      console.log(`❌ VALIDATION FAILED - ${allValidationFailures.length} of ${totalTests} tests failed:`);
      for (const failure of allValidationFailures) {
        console.log(`  - ${failure}`);
      }
      process.exit(1);
    } else {
      console.log(`✅ VALIDATION PASSED - All ${totalTests} tests produced expected results`);
      process.exit(0);
    }
  })();
}
