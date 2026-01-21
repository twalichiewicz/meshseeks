/**
 * MeshSeeks Swarm Types - Cursor-Scale Architecture
 *
 * This module defines all TypeScript interfaces and types for the swarm orchestration
 * system, supporting 100+ concurrent agents, week-long sessions, hierarchical planning,
 * and automated verification.
 *
 * @module swarm-types
 * @see https://github.com/anthropics/claude-code
 */
/**
 * Type guard for checking if value is a valid ExtendedAgentRole.
 */
export function isExtendedAgentRole(value) {
    return [
        'analysis', 'implementation', 'testing', 'documentation', 'debugging',
        'planner', 'judge', 'synthesizer', 'monitor'
    ].includes(value);
}
/**
 * Type guard for checking if value is a valid TaskStatus.
 */
export function isTaskStatus(value) {
    return [
        'pending', 'queued', 'blocked', 'in_progress', 'verifying',
        'rework', 'completed', 'failed', 'cancelled'
    ].includes(value);
}
/**
 * Type guard for checking if value is a valid SessionStatus.
 */
export function isSessionStatus(value) {
    return [
        'initializing', 'active', 'paused', 'resuming',
        'completing', 'completed', 'failed', 'archived'
    ].includes(value);
}
// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================
/**
 * Default swarm configuration.
 */
export const DEFAULT_SWARM_CONFIG = {
    maxConcurrentAgents: 100,
    maxTaskDepth: 5,
    agentTimeoutMs: 3600000, // 1 hour
    sessionTimeoutMs: 604800000, // 7 days
    enableJudge: true,
    judgePassThreshold: 0.8,
    maxJudgeRetries: 2,
    checkpointIntervalMs: 300000, // 5 minutes
    checkpointDir: '~/.meshseeks/sessions',
    maxCheckpointsPerSession: 100,
    minAgents: 1,
    maxAgents: 500,
    scaleUpThreshold: 10, // Tasks in queue
    scaleDownThreshold: 60000, // 1 minute idle
    maxConsecutiveFailures: 5,
    failureThresholdPercent: 30,
    maxTotalTasks: 10000,
    maxTasksPerLevel: 100
};
/**
 * Default judge configuration.
 */
export const DEFAULT_JUDGE_CONFIG = {
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
