/**
 * Hierarchical Planner - Recursive task decomposition for Cursor-scale operations
 *
 * Decomposes complex problems into hierarchical task trees with depth limiting
 * to prevent infinite recursion. Supports spawning sub-planners for deep
 * decomposition of complex subtasks.
 *
 * @module hierarchical-planner
 * @see SessionManager for task tree management
 * @see HierarchicalTask for task structure
 *
 * Sample usage:
 *   const planner = new HierarchicalPlanner(sessionManager, config);
 *   const tasks = await planner.decompose(rootTask);
 */
import { fileURLToPath } from 'url';
/**
 * Default planner configuration.
 */
const DEFAULT_PLANNER_CONFIG = {
    maxDepth: 5,
    maxTasksPerLevel: 100,
    defaultStrategy: 'hybrid',
    autoDecomposeThreshold: 50,
    minTasksForDecomposition: 2,
    enableSubPlanners: true
};
/**
 * Hierarchical planner for recursive task decomposition.
 */
export class HierarchicalPlanner {
    config;
    taskIdCounter = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_PLANNER_CONFIG, ...config };
    }
    // ===========================================================================
    // TASK DECOMPOSITION
    // ===========================================================================
    /**
     * Decompose a task into subtasks based on its complexity.
     */
    async decompose(parentTask, context, instruction) {
        const errors = [];
        // Check depth limit
        if (parentTask.depth >= context.maxDepth) {
            return {
                success: true,
                tasks: [],
                totalGenerated: 0,
                maxDepthReached: true,
                errors: []
            };
        }
        const effectiveInstruction = {
            strategy: instruction?.strategy || this.config.defaultStrategy,
            minTasks: instruction?.minTasks || this.config.minTasksForDecomposition,
            maxTasks: instruction?.maxTasks || context.maxTasksPerLevel,
            requireTesting: instruction?.requireTesting ?? true,
            requireDocumentation: instruction?.requireDocumentation ?? false,
            customPrompt: instruction?.customPrompt
        };
        // Analyze the task and determine decomposition
        const templates = this.analyzeAndPlan(parentTask, effectiveInstruction, context);
        if (templates.length === 0) {
            return {
                success: true,
                tasks: [],
                totalGenerated: 0,
                maxDepthReached: false,
                errors: []
            };
        }
        // Convert templates to tasks
        const tasks = this.createTasksFromTemplates(templates, parentTask, context, effectiveInstruction.strategy);
        return {
            success: true,
            tasks,
            totalGenerated: tasks.length,
            maxDepthReached: false,
            errors
        };
    }
    /**
     * Analyze a task and generate subtask templates.
     * This is a rule-based decomposition that can be extended with AI planning.
     */
    analyzeAndPlan(task, instruction, context) {
        const templates = [];
        // Determine task type from prompt analysis
        const prompt = task.prompt.toLowerCase();
        const isFeature = prompt.includes('feature') || prompt.includes('implement') || prompt.includes('add');
        const isBugFix = prompt.includes('bug') || prompt.includes('fix') || prompt.includes('error');
        const isRefactor = prompt.includes('refactor') || prompt.includes('improve') || prompt.includes('optimize');
        const isTest = prompt.includes('test') || prompt.includes('spec') || prompt.includes('coverage');
        const isDocumentation = prompt.includes('document') || prompt.includes('readme') || prompt.includes('comment');
        // Generate templates based on task type
        if (isFeature) {
            templates.push(...this.planFeatureImplementation(task, instruction));
        }
        else if (isBugFix) {
            templates.push(...this.planBugFix(task, instruction));
        }
        else if (isRefactor) {
            templates.push(...this.planRefactoring(task, instruction));
        }
        else if (isTest) {
            templates.push(...this.planTestingSuite(task, instruction));
        }
        else if (isDocumentation) {
            templates.push(...this.planDocumentation(task, instruction));
        }
        else {
            // Generic decomposition
            templates.push(...this.planGeneric(task, instruction));
        }
        // Enforce limits
        const maxTasks = Math.min(instruction.maxTasks || this.config.maxTasksPerLevel, context.maxTasksPerLevel);
        return templates.slice(0, maxTasks);
    }
    /**
     * Plan feature implementation tasks.
     */
    planFeatureImplementation(task, instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // Analysis phase
        templates.push({
            prompt: `Analyze requirements and design approach for: ${basePrompt}`,
            role: 'analysis',
            priority: 'high',
            tags: ['analysis', 'design']
        });
        // Implementation phase
        templates.push({
            prompt: `Implement core functionality for: ${basePrompt}`,
            role: 'implementation',
            priority: 'high',
            tags: ['implementation', 'core']
        });
        // Integration phase
        templates.push({
            prompt: `Integrate and wire up components for: ${basePrompt}`,
            role: 'implementation',
            priority: 'medium',
            tags: ['implementation', 'integration']
        });
        // Testing phase (if required)
        if (instruction.requireTesting) {
            templates.push({
                prompt: `Write tests for: ${basePrompt}`,
                role: 'testing',
                priority: 'medium',
                tags: ['testing']
            });
        }
        // Documentation (if required)
        if (instruction.requireDocumentation) {
            templates.push({
                prompt: `Document the implementation for: ${basePrompt}`,
                role: 'documentation',
                priority: 'low',
                tags: ['documentation']
            });
        }
        return templates;
    }
    /**
     * Plan bug fix tasks.
     */
    planBugFix(task, instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // Investigation
        templates.push({
            prompt: `Investigate root cause for: ${basePrompt}`,
            role: 'debugging',
            priority: 'high',
            tags: ['investigation', 'debugging']
        });
        // Fix implementation
        templates.push({
            prompt: `Implement fix for: ${basePrompt}`,
            role: 'implementation',
            priority: 'high',
            tags: ['fix', 'implementation']
        });
        // Regression testing
        if (instruction.requireTesting) {
            templates.push({
                prompt: `Write regression tests to prevent recurrence of: ${basePrompt}`,
                role: 'testing',
                priority: 'medium',
                tags: ['testing', 'regression']
            });
        }
        return templates;
    }
    /**
     * Plan refactoring tasks.
     */
    planRefactoring(task, instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // Analysis
        templates.push({
            prompt: `Analyze current implementation and identify refactoring opportunities for: ${basePrompt}`,
            role: 'analysis',
            priority: 'high',
            tags: ['analysis', 'refactoring']
        });
        // Refactoring
        templates.push({
            prompt: `Perform refactoring for: ${basePrompt}`,
            role: 'implementation',
            priority: 'high',
            tags: ['refactoring', 'implementation']
        });
        // Verification
        if (instruction.requireTesting) {
            templates.push({
                prompt: `Verify refactoring did not break functionality for: ${basePrompt}`,
                role: 'testing',
                priority: 'high',
                tags: ['testing', 'verification']
            });
        }
        return templates;
    }
    /**
     * Plan testing suite tasks.
     */
    planTestingSuite(task, _instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // Unit tests
        templates.push({
            prompt: `Write unit tests for: ${basePrompt}`,
            role: 'testing',
            priority: 'high',
            tags: ['testing', 'unit']
        });
        // Integration tests
        templates.push({
            prompt: `Write integration tests for: ${basePrompt}`,
            role: 'testing',
            priority: 'medium',
            tags: ['testing', 'integration']
        });
        return templates;
    }
    /**
     * Plan documentation tasks.
     */
    planDocumentation(task, _instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // API documentation
        templates.push({
            prompt: `Write API documentation for: ${basePrompt}`,
            role: 'documentation',
            priority: 'medium',
            tags: ['documentation', 'api']
        });
        // Usage examples
        templates.push({
            prompt: `Create usage examples for: ${basePrompt}`,
            role: 'documentation',
            priority: 'low',
            tags: ['documentation', 'examples']
        });
        return templates;
    }
    /**
     * Plan generic tasks.
     */
    planGeneric(task, instruction) {
        const templates = [];
        const basePrompt = task.prompt;
        // Analysis
        templates.push({
            prompt: `Analyze and understand: ${basePrompt}`,
            role: 'analysis',
            priority: 'high',
            tags: ['analysis']
        });
        // Execution
        templates.push({
            prompt: `Execute: ${basePrompt}`,
            role: 'implementation',
            priority: 'high',
            tags: ['execution']
        });
        // Verification
        if (instruction.requireTesting) {
            templates.push({
                prompt: `Verify completion of: ${basePrompt}`,
                role: 'testing',
                priority: 'medium',
                tags: ['verification']
            });
        }
        return templates;
    }
    /**
     * Convert templates to HierarchicalTask objects.
     */
    createTasksFromTemplates(templates, parentTask, context, strategy) {
        const tasks = [];
        const now = Date.now();
        for (let i = 0; i < templates.length; i++) {
            const template = templates[i];
            const taskId = this.generateTaskId(context.sessionId, parentTask.id);
            // Ensure unique ID
            while (context.existingTaskIds.has(taskId)) {
                this.taskIdCounter++;
            }
            context.existingTaskIds.add(taskId);
            // Calculate dependencies based on strategy
            const dependencies = this.calculateDependencies(i, tasks, template, strategy, parentTask.id);
            const task = {
                id: taskId,
                parentId: parentTask.id,
                depth: parentTask.depth + 1,
                children: [],
                prompt: template.prompt,
                role: template.role,
                workFolder: context.workFolder,
                returnMode: 'summary',
                dependencies,
                status: 'pending',
                priority: template.priority || 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: now,
                estimatedDurationMs: template.estimatedDurationMs,
                tags: template.tags || [],
                metadata: template.metadata
            };
            tasks.push(task);
        }
        return tasks;
    }
    /**
     * Calculate dependencies based on decomposition strategy.
     */
    calculateDependencies(index, previousTasks, template, strategy, parentId) {
        // Always include parent as dependency
        const dependencies = [parentId];
        // Add explicit template dependencies
        if (template.dependencies) {
            dependencies.push(...template.dependencies);
        }
        switch (strategy) {
            case 'sequential':
                // Each task depends on the previous one
                if (index > 0) {
                    dependencies.push(previousTasks[index - 1].id);
                }
                break;
            case 'parallel':
                // Tasks only depend on parent (already added)
                break;
            case 'hybrid':
                // Implementation tasks depend on analysis
                // Testing tasks depend on implementation
                if (template.role === 'implementation') {
                    const analysisTasks = previousTasks.filter(t => t.role === 'analysis');
                    dependencies.push(...analysisTasks.map(t => t.id));
                }
                else if (template.role === 'testing') {
                    const implTasks = previousTasks.filter(t => t.role === 'implementation');
                    dependencies.push(...implTasks.map(t => t.id));
                }
                else if (template.role === 'documentation') {
                    // Documentation depends on implementation and testing
                    const implTasks = previousTasks.filter(t => t.role === 'implementation' || t.role === 'testing');
                    dependencies.push(...implTasks.map(t => t.id));
                }
                break;
            case 'phased':
                // Group by phases: analysis -> implementation -> testing -> documentation
                const phases = [
                    ['analysis', 'planner'],
                    ['implementation', 'debugging'],
                    ['testing'],
                    ['documentation', 'synthesizer']
                ];
                const currentPhase = phases.findIndex(p => p.includes(template.role));
                if (currentPhase > 0) {
                    // Depend on all tasks from previous phases
                    const previousPhases = phases.slice(0, currentPhase).flat();
                    const phaseDeps = previousTasks
                        .filter(t => previousPhases.includes(t.role))
                        .map(t => t.id);
                    dependencies.push(...phaseDeps);
                }
                break;
        }
        // Remove duplicates
        return [...new Set(dependencies)];
    }
    /**
     * Generate a unique task ID.
     */
    generateTaskId(sessionId, parentId) {
        this.taskIdCounter++;
        const timestamp = Date.now().toString(36);
        return `task-${sessionId.slice(-6)}-${this.taskIdCounter}-${timestamp}`;
    }
    // ===========================================================================
    // COMPLEXITY ANALYSIS
    // ===========================================================================
    /**
     * Estimate task complexity (0-100 scale).
     */
    estimateComplexity(task) {
        let complexity = 0;
        const prompt = task.prompt.toLowerCase();
        // Length-based complexity
        complexity += Math.min(prompt.length / 20, 20);
        // Keyword-based complexity
        const complexKeywords = [
            'architecture', 'system', 'integrate', 'migration',
            'security', 'performance', 'scale', 'distributed',
            'concurrent', 'real-time', 'api', 'database'
        ];
        for (const keyword of complexKeywords) {
            if (prompt.includes(keyword)) {
                complexity += 5;
            }
        }
        // Scope indicators
        if (prompt.includes('all') || prompt.includes('entire') || prompt.includes('complete')) {
            complexity += 10;
        }
        if (prompt.includes('multiple') || prompt.includes('several') || prompt.includes('various')) {
            complexity += 8;
        }
        // Simplicity indicators (reduce complexity)
        const simpleKeywords = ['simple', 'basic', 'small', 'minor', 'quick'];
        for (const keyword of simpleKeywords) {
            if (prompt.includes(keyword)) {
                complexity -= 10;
            }
        }
        return Math.max(0, Math.min(100, complexity));
    }
    /**
     * Determine if a task should be auto-decomposed.
     */
    shouldAutoDecompose(task, context) {
        // Don't decompose at max depth
        if (task.depth >= context.maxDepth) {
            return false;
        }
        // Don't decompose leaf roles
        const leafRoles = ['testing', 'documentation', 'debugging'];
        if (leafRoles.includes(task.role)) {
            return false;
        }
        // Check complexity threshold
        const complexity = this.estimateComplexity(task);
        return complexity >= this.config.autoDecomposeThreshold;
    }
    // ===========================================================================
    // TASK TREE OPERATIONS
    // ===========================================================================
    /**
     * Get all tasks at a specific depth level.
     */
    getTasksAtDepth(taskTree, depth) {
        const tree = taskTree instanceof Map
            ? taskTree
            : new Map(Object.entries(taskTree));
        return Array.from(tree.values()).filter(t => t.depth === depth);
    }
    /**
     * Get all leaf tasks (tasks with no children).
     */
    getLeafTasks(taskTree) {
        const tree = taskTree instanceof Map
            ? taskTree
            : new Map(Object.entries(taskTree));
        return Array.from(tree.values()).filter(t => t.children.length === 0);
    }
    /**
     * Get all executable tasks (pending with satisfied dependencies).
     */
    getExecutableTasks(taskTree) {
        const tree = taskTree instanceof Map
            ? taskTree
            : new Map(Object.entries(taskTree));
        return Array.from(tree.values()).filter(task => {
            if (task.status !== 'pending')
                return false;
            // Check all dependencies are completed
            for (const depId of task.dependencies) {
                const dep = tree.get(depId);
                if (!dep || dep.status !== 'completed') {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * Get task tree statistics.
     */
    getTreeStats(taskTree) {
        const tree = taskTree instanceof Map
            ? taskTree
            : new Map(Object.entries(taskTree));
        const stats = {
            totalTasks: tree.size,
            byDepth: {},
            byStatus: {},
            byRole: {},
            maxDepth: 0,
            leafCount: 0
        };
        for (const task of tree.values()) {
            // By depth
            stats.byDepth[task.depth] = (stats.byDepth[task.depth] || 0) + 1;
            if (task.depth > stats.maxDepth) {
                stats.maxDepth = task.depth;
            }
            // By status
            stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
            // By role
            stats.byRole[task.role] = (stats.byRole[task.role] || 0) + 1;
            // Leaf count
            if (task.children.length === 0) {
                stats.leafCount++;
            }
        }
        return stats;
    }
    /**
     * Visualize task tree as ASCII art.
     */
    visualizeTree(taskTree, rootId) {
        const tree = taskTree instanceof Map
            ? taskTree
            : new Map(Object.entries(taskTree));
        const lines = [];
        const renderTask = (taskId, prefix, isLast) => {
            const task = tree.get(taskId);
            if (!task)
                return;
            const statusEmoji = this.getStatusEmoji(task.status);
            const roleEmoji = this.getRoleEmoji(task.role);
            const connector = isLast ? '└── ' : '├── ';
            const line = `${prefix}${connector}${statusEmoji} ${roleEmoji} ${task.id.slice(-8)}`;
            lines.push(line);
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            for (let i = 0; i < task.children.length; i++) {
                renderTask(task.children[i], childPrefix, i === task.children.length - 1);
            }
        };
        const root = tree.get(rootId);
        if (root) {
            const statusEmoji = this.getStatusEmoji(root.status);
            const roleEmoji = this.getRoleEmoji(root.role);
            lines.push(`${statusEmoji} ${roleEmoji} ${root.id} (root)`);
            for (let i = 0; i < root.children.length; i++) {
                renderTask(root.children[i], '', i === root.children.length - 1);
            }
        }
        return lines.join('\n');
    }
    getStatusEmoji(status) {
        const emojis = {
            pending: '⏳',
            queued: '📥',
            blocked: '🚫',
            in_progress: '🔄',
            verifying: '🔍',
            rework: '🔧',
            completed: '✅',
            failed: '❌',
            cancelled: '⛔'
        };
        return emojis[status] || '❓';
    }
    getRoleEmoji(role) {
        const emojis = {
            analysis: '🔍',
            implementation: '⚙️',
            testing: '🧪',
            documentation: '📝',
            debugging: '🐛',
            planner: '📋',
            judge: '⚖️',
            synthesizer: '🔗',
            monitor: '📊'
        };
        return emojis[role] || '❓';
    }
}
// =============================================================================
// VALIDATION
// =============================================================================
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    (async () => {
        const planner = new HierarchicalPlanner();
        const allValidationFailures = [];
        let totalTests = 0;
        console.log('Testing HierarchicalPlanner...\n');
        // Test 1: Complexity estimation
        totalTests++;
        try {
            const simpleTask = {
                id: 'task-1',
                parentId: null,
                depth: 0,
                children: [],
                prompt: 'Add a simple button',
                role: 'implementation',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: [],
                status: 'pending',
                priority: 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            };
            const complexTask = {
                ...simpleTask,
                id: 'task-2',
                prompt: 'Implement a distributed real-time database with concurrent access and performance optimization'
            };
            const simpleComplexity = planner.estimateComplexity(simpleTask);
            const complexComplexity = planner.estimateComplexity(complexTask);
            if (simpleComplexity >= complexComplexity) {
                allValidationFailures.push(`ComplexityEstimation: Simple (${simpleComplexity}) >= Complex (${complexComplexity})`);
            }
            else {
                console.log(`  ✓ Complexity estimation (simple: ${simpleComplexity}, complex: ${complexComplexity})`);
            }
        }
        catch (error) {
            allValidationFailures.push(`ComplexityEstimation: ${error}`);
        }
        // Test 2: Feature decomposition
        totalTests++;
        try {
            const featureTask = {
                id: 'task-root',
                parentId: null,
                depth: 0,
                children: [],
                prompt: 'Implement user authentication feature with login and registration',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'pending',
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            };
            const context = {
                sessionId: 'test-session',
                workFolder: '/tmp',
                maxDepth: 5,
                maxTasksPerLevel: 10,
                existingTaskIds: new Set(['task-root'])
            };
            const result = await planner.decompose(featureTask, context, {
                strategy: 'hybrid',
                requireTesting: true
            });
            if (!result.success || result.tasks.length < 3) {
                allValidationFailures.push(`FeatureDecomposition: Expected 3+ tasks, got ${result.tasks.length}`);
            }
            else {
                console.log(`  ✓ Feature decomposition (${result.tasks.length} tasks generated)`);
            }
        }
        catch (error) {
            allValidationFailures.push(`FeatureDecomposition: ${error}`);
        }
        // Test 3: Bug fix decomposition
        totalTests++;
        try {
            const bugTask = {
                id: 'task-bug',
                parentId: null,
                depth: 0,
                children: [],
                prompt: 'Fix the login bug where users cannot sign in with special characters',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'pending',
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            };
            const context = {
                sessionId: 'test-session',
                workFolder: '/tmp',
                maxDepth: 5,
                maxTasksPerLevel: 10,
                existingTaskIds: new Set(['task-bug'])
            };
            const result = await planner.decompose(bugTask, context);
            if (!result.success || result.tasks.length < 2) {
                allValidationFailures.push(`BugDecomposition: Expected 2+ tasks, got ${result.tasks.length}`);
            }
            else {
                // Verify debugging role is present
                const hasDebugTask = result.tasks.some(t => t.role === 'debugging');
                if (!hasDebugTask) {
                    allValidationFailures.push('BugDecomposition: Missing debugging task');
                }
                else {
                    console.log(`  ✓ Bug fix decomposition (${result.tasks.length} tasks, includes debugging)`);
                }
            }
        }
        catch (error) {
            allValidationFailures.push(`BugDecomposition: ${error}`);
        }
        // Test 4: Depth limiting
        totalTests++;
        try {
            const deepTask = {
                id: 'task-deep',
                parentId: 'parent',
                depth: 5, // At max depth
                children: [],
                prompt: 'This should not decompose',
                role: 'implementation',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: [],
                status: 'pending',
                priority: 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            };
            const context = {
                sessionId: 'test-session',
                workFolder: '/tmp',
                maxDepth: 5,
                maxTasksPerLevel: 10,
                existingTaskIds: new Set(['task-deep'])
            };
            const result = await planner.decompose(deepTask, context);
            if (result.tasks.length > 0) {
                allValidationFailures.push(`DepthLimiting: Expected 0 tasks at max depth, got ${result.tasks.length}`);
            }
            else if (!result.maxDepthReached) {
                allValidationFailures.push('DepthLimiting: maxDepthReached should be true');
            }
            else {
                console.log('  ✓ Depth limiting (no tasks at max depth)');
            }
        }
        catch (error) {
            allValidationFailures.push(`DepthLimiting: ${error}`);
        }
        // Test 5: Dependency calculation (hybrid strategy)
        totalTests++;
        try {
            const rootTask = {
                id: 'task-root',
                parentId: null,
                depth: 0,
                children: [],
                prompt: 'Implement feature with analysis, implementation, and testing',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'pending',
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            };
            const context = {
                sessionId: 'test-session',
                workFolder: '/tmp',
                maxDepth: 5,
                maxTasksPerLevel: 10,
                existingTaskIds: new Set(['task-root'])
            };
            const result = await planner.decompose(rootTask, context, { strategy: 'hybrid' });
            // Verify implementation depends on analysis
            const analysisTasks = result.tasks.filter(t => t.role === 'analysis');
            const implTasks = result.tasks.filter(t => t.role === 'implementation');
            const testTasks = result.tasks.filter(t => t.role === 'testing');
            let depError = false;
            for (const impl of implTasks) {
                const dependsOnAnalysis = analysisTasks.some(a => impl.dependencies.includes(a.id));
                if (analysisTasks.length > 0 && !dependsOnAnalysis) {
                    depError = true;
                }
            }
            for (const test of testTasks) {
                const dependsOnImpl = implTasks.some(i => test.dependencies.includes(i.id));
                if (implTasks.length > 0 && !dependsOnImpl) {
                    depError = true;
                }
            }
            if (depError) {
                allValidationFailures.push('DependencyCalculation: Hybrid strategy dependencies incorrect');
            }
            else {
                console.log('  ✓ Dependency calculation (hybrid strategy verified)');
            }
        }
        catch (error) {
            allValidationFailures.push(`DependencyCalculation: ${error}`);
        }
        // Test 6: Tree statistics
        totalTests++;
        try {
            const taskTree = new Map();
            // Create a simple tree
            taskTree.set('root', {
                id: 'root',
                parentId: null,
                depth: 0,
                children: ['child1', 'child2'],
                prompt: 'Root',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'completed',
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            taskTree.set('child1', {
                id: 'child1',
                parentId: 'root',
                depth: 1,
                children: [],
                prompt: 'Child 1',
                role: 'implementation',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: ['root'],
                status: 'pending',
                priority: 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            taskTree.set('child2', {
                id: 'child2',
                parentId: 'root',
                depth: 1,
                children: [],
                prompt: 'Child 2',
                role: 'testing',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: ['root', 'child1'],
                status: 'pending',
                priority: 'low',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            const stats = planner.getTreeStats(taskTree);
            if (stats.totalTasks !== 3) {
                allValidationFailures.push(`TreeStats: Expected 3 total tasks, got ${stats.totalTasks}`);
            }
            else if (stats.maxDepth !== 1) {
                allValidationFailures.push(`TreeStats: Expected max depth 1, got ${stats.maxDepth}`);
            }
            else if (stats.leafCount !== 2) {
                allValidationFailures.push(`TreeStats: Expected 2 leaf tasks, got ${stats.leafCount}`);
            }
            else {
                console.log('  ✓ Tree statistics');
            }
        }
        catch (error) {
            allValidationFailures.push(`TreeStats: ${error}`);
        }
        // Test 7: Get executable tasks
        totalTests++;
        try {
            const taskTree = new Map();
            taskTree.set('root', {
                id: 'root',
                parentId: null,
                depth: 0,
                children: ['child1'],
                prompt: 'Root',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'completed', // Completed
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            taskTree.set('child1', {
                id: 'child1',
                parentId: 'root',
                depth: 1,
                children: [],
                prompt: 'Child 1',
                role: 'implementation',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: ['root'], // Depends on completed root
                status: 'pending', // Should be executable
                priority: 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            const executable = planner.getExecutableTasks(taskTree);
            if (executable.length !== 1 || executable[0].id !== 'child1') {
                allValidationFailures.push(`GetExecutableTasks: Expected child1, got ${executable.map(t => t.id).join(', ')}`);
            }
            else {
                console.log('  ✓ Get executable tasks');
            }
        }
        catch (error) {
            allValidationFailures.push(`GetExecutableTasks: ${error}`);
        }
        // Test 8: Tree visualization
        totalTests++;
        try {
            const taskTree = new Map();
            taskTree.set('root', {
                id: 'root',
                parentId: null,
                depth: 0,
                children: ['child1'],
                prompt: 'Root',
                role: 'planner',
                workFolder: '/tmp',
                returnMode: 'full',
                dependencies: [],
                status: 'completed',
                priority: 'high',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            taskTree.set('child1', {
                id: 'child1',
                parentId: 'root',
                depth: 1,
                children: [],
                prompt: 'Child 1',
                role: 'implementation',
                workFolder: '/tmp',
                returnMode: 'summary',
                dependencies: ['root'],
                status: 'pending',
                priority: 'medium',
                retryCount: 0,
                maxRetries: 3,
                createdAt: Date.now(),
                tags: []
            });
            const visualization = planner.visualizeTree(taskTree, 'root');
            if (!visualization.includes('root') || !visualization.includes('child1')) {
                allValidationFailures.push('TreeVisualization: Missing task IDs in output');
            }
            else {
                console.log('  ✓ Tree visualization');
            }
        }
        catch (error) {
            allValidationFailures.push(`TreeVisualization: ${error}`);
        }
        // Report results
        console.log('\n' + '─'.repeat(50));
        if (allValidationFailures.length > 0) {
            console.log(`❌ VALIDATION FAILED - ${allValidationFailures.length} of ${totalTests} tests failed:`);
            for (const failure of allValidationFailures) {
                console.log(`  - ${failure}`);
            }
            process.exit(1);
        }
        else {
            console.log(`✅ VALIDATION PASSED - All ${totalTests} tests produced expected results`);
            process.exit(0);
        }
    })();
}
