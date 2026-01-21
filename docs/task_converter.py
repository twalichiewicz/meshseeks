#!/usr/bin/env python3
"""
Task Converter for Claude Code MCP

This script converts Markdown validation tasks into machine-readable JSON
format that is compatible with Claude Code MCP (Model Context Protocol).

The script analyzes Markdown files containing validation task definitions and outputs
a JSON list of tasks that can be directly consumed by the Claude Code MCP server.

### Claude Code MCP Integration ###

The output from this converter is specifically designed to work with the Claude Code MCP
server described in: https://github.com/twalichiewicz/meshseeks

The MCP (Model Context Protocol) is a standardized way for AI models to interact with
external tools and services. This converter generates prompts that are formatted
to be processed by the Claude Code MCP, which allows Claude to:

1. Understand code tasks and their requirements
2. Execute appropriate code generation based on task specifications
3. Format output according to expectations
4. Process multiple tasks in sequence

### Output Format ###

The output JSON has the following structure:
[
  {
    "tool": "claude_code",
    "arguments": {
      "command": "cd /path/to/project && [Detailed prompt for the task]",
      "dangerously_skip_permissions": true,
      "timeout_ms": 300000
    }
  },
  ...
]

The "dangerously_skip_permissions" flag is set to true to allow Claude Code to execute
operations without permission interruptions, and a timeout is set to prevent long-running tasks.

### Usage ###
    # File output mode:
    python task_converter.py <input_markdown> <output_json>
    
    # JSON stdout mode (for MCP integration):
    python task_converter.py --json-output <input_markdown>

### Example ###
    # File output:
    python task_converter.py docs/tasks/011_db_operations_validation.md tasks.json
    
    # JSON stdout (for MCP):
    python task_converter.py --json-output docs/tasks/011_db_operations_validation.md
"""

import re
import json
import sys
import os
from typing import List, Dict, Tuple, Any, Optional

def load_file(filename: str) -> str:
    """
    Load content from a markdown file.
    
    Args:
        filename: Path to the markdown file to load
        
    Returns:
        String containing the file content
    """
    with open(filename, "r", encoding="utf-8") as f:
        return f.read()

def extract_title(md: str) -> str:
    """
    Extract the title from the markdown content.
    
    Args:
        md: Markdown content
        
    Returns:
        The title of the task
    """
    title_match = re.search(r'^#\s+(.+)$', md, re.MULTILINE)
    return title_match.group(1) if title_match else "Untitled Task"

def extract_objective(md: str) -> str:
    """
    Extract the objective section from the markdown content.
    
    Args:
        md: Markdown content
        
    Returns:
        The objective of the task
    """
    objective_match = re.search(r'## Objective\n(.+?)(?=\n##|\Z)', md, re.DOTALL)
    return objective_match.group(1).strip() if objective_match else ""

def extract_requirements(md: str) -> List[str]:
    """
    Extract the requirements list from the markdown content.
    
    Args:
        md: Markdown content
        
    Returns:
        List of requirement strings
    """
    requirements = []
    req_section = re.search(r'## Requirements\n(.*?)(?=\n##|\Z)', md, re.DOTALL)
    
    if req_section:
        req_text = req_section.group(1)
        # Extract all requirements (numbered lists with checkboxes)
        req_matches = re.findall(r'\d+\.\s+\[\s?\]\s*(.+)', req_text)
        requirements = [r.strip() for r in req_matches]
    
    return requirements

def extract_validation_tasks(md: str) -> List[Tuple[str, str]]:
    """
    Extract validation tasks and their corresponding steps.
    
    Args:
        md: Markdown content
        
    Returns:
        List of tuples containing (module_name, steps_block)
    """
    # Find all "- [ ] Validate `module_name`" entries and capture the module name
    # and the indented block of steps that follows
    pattern = re.compile(
        r'- \[ \] Validate `([^`]+)`\n((?:\s{3,}- \[ \].+\n?)*)',
        re.MULTILINE
    )
    return pattern.findall(md)

def extract_steps(block: str) -> List[str]:
    """
    Extract steps from an indented block.
    
    Args:
        block: Text block containing indented checklist items
        
    Returns:
        List of step strings
    """
    steps = []
    for line in block.splitlines():
        m = re.match(r'\s+- \[ \] (.+)', line)
        if m:
            steps.append(m.group(1).strip())
    return steps

def build_validation_prompt(title: str, objective: str, module: str, steps: List[str], 
                          requirements: List[str]) -> str:
    """
    Build a detailed prompt for validating a module.
    
    Args:
        title: Task title
        objective: Task objective
        module: Name of the module to validate
        steps: List of validation steps
        requirements: List of requirements
        
    Returns:
        Formatted prompt string
    """
    # Extract task ID from title (e.g., "Task 011: ..." -> "011")
    task_id_match = re.search(r'Task (\d+):', title)
    task_id = task_id_match.group(1) if task_id_match else "unknown"
    
    # Add specific working directory command at the beginning
    prompt = f"cd /home/graham/workspace/experiments/arangodb/ && source .venv/bin/activate\n\n"
    
    # Add task structure
    prompt += f"TASK TYPE: Validation\n"
    prompt += f"TASK ID: db-validation-{task_id}\n"
    prompt += f"CURRENT SUBTASK: Validate {module}\n\n"
    
    # Add detailed context
    prompt += f"CONTEXT:\n"
    prompt += f"- {objective}\n"
    prompt += "- Validation must use real ArangoDB connections, not mocks\n"
    prompt += "- Results must be verified with both JSON and rich table outputs\n"
    prompt += f"- File is located at /home/graham/workspace/experiments/arangodb/{module}\n\n"
    
    # Include all requirements explicitly
    prompt += "REQUIREMENTS:\n"
    for i, req in enumerate(requirements, 1):
        prompt += f"{i}. {req}\n"
    
    # Include specific validation steps
    prompt += f"\nVALIDATION STEPS for {module}:\n"
    for i, step in enumerate(steps, 1):
        prompt += f"{i}. {step}\n"
    
    # Add detailed instructions
    prompt += f"""
INSTRUCTIONS:
1. Execute each validation step in sequence
2. For each step:
   - Show the actual code executed with full paths
   - Show the actual output
   - Verify the output matches expectations
   - Include both JSON and rich table outputs where appropriate
3. After completing all steps:
   - Update the task list by editing /home/graham/workspace/experiments/arangodb/docs/tasks/011_db_operations_validation.md
   - Change "- [ ] Validate `{module}`" to "- [x] Validate `{module}`"
   - Document any issues found and fixes applied
   - Confirm all requirements were met
   - Confirm actual database connection was used (no mocks)

After completion, provide summary in this format:

COMPLETION SUMMARY:
- What was validated: 
- Results:
- Files modified:
- Issues encountered:
- Fixes applied:
- Requirements met: [Yes/No with details]
- Used real database: [Confirmed/Not confirmed]

Begin validation of {module} now.
"""
    return prompt.strip()

def format_tasks_for_mcp(validation_prompts: List[str]) -> List[Dict[str, Any]]:
    """
    Format validation tasks for the Claude Code MCP format.
    
    Args:
        validation_prompts: List of formatted validation prompts
        
    Returns:
        List of tasks in Claude Code MCP compatible format
    """
    mcp_tasks = []
    
    for prompt in validation_prompts:
        mcp_task = {
            "tool": "claude_code",
            "arguments": {
                # No need to add "Your work folder is..." since we're already using explicit paths
                "command": prompt,
                "dangerously_skip_permissions": True,
                "timeout_ms": 300000  # 5 minutes timeout
            }
        }
        mcp_tasks.append(mcp_task)
    
    return mcp_tasks

def process_markdown(input_file: str, progress_callback: Optional[callable] = None) -> List[Dict[str, Any]]:
    """
    Process a markdown file and extract validation tasks.
    
    Args:
        input_file: Path to the markdown file
        progress_callback: Optional callback for progress updates
        
    Returns:
        List of tasks in Claude Code MCP format
        
    Raises:
        ValueError: If markdown format is invalid or missing required sections
    """
    if progress_callback:
        progress_callback("Loading task file...")
    
    md = load_file(input_file)
    
    if progress_callback:
        progress_callback("Validating markdown structure...")
    
    # Validate markdown structure
    validation_errors = []
    
    # Extract and validate title
    title = extract_title(md)
    if title == "Untitled Task":
        validation_errors.append("Missing required title. Format: '# Task NNN: Title'")
    
    # Extract and validate objective
    objective = extract_objective(md)
    if not objective:
        validation_errors.append("Missing required 'Objective' section. Format: '## Objective\\nDescription'")
    
    # Extract and validate requirements
    requirements = extract_requirements(md)
    if not requirements:
        validation_errors.append("Missing or empty 'Requirements' section. Format: '## Requirements\\n1. [ ] Requirement'")
    
    # Extract and validate tasks
    validation_tasks = extract_validation_tasks(md)
    if not validation_tasks:
        validation_errors.append("No validation tasks found. Format: '- [ ] Validate `module.py`' with indented steps")
    
    # Check for task steps
    empty_tasks = []
    for module, block in validation_tasks:
        steps = extract_steps(block)
        if not steps:
            empty_tasks.append(module)
    
    if empty_tasks:
        validation_errors.append(f"Tasks without steps: {', '.join(empty_tasks)}. Each task needs indented steps")
    
    # If there are validation errors, raise exception with helpful message
    if validation_errors:
        error_msg = "Markdown format validation failed:\n"
        error_msg += "\n".join(f"  - {error}" for error in validation_errors)
        error_msg += "\n\nRequired markdown format:\n"
        error_msg += "# Task NNN: Title\n"
        error_msg += "## Objective\n"
        error_msg += "Clear description\n"
        error_msg += "## Requirements\n"
        error_msg += "1. [ ] First requirement\n"
        error_msg += "## Task Section\n"
        error_msg += "- [ ] Validate `file.py`\n"
        error_msg += "   - [ ] Step 1\n"
        error_msg += "   - [ ] Step 2\n"
        raise ValueError(error_msg)
    
    if progress_callback:
        progress_callback(f"Converting {len(validation_tasks)} validation tasks...")
    
    prompts = []
    for i, (module, block) in enumerate(validation_tasks, 1):
        if progress_callback:
            progress_callback(f"Task {i}/{len(validation_tasks)}: Converting {module}")
        
        steps = extract_steps(block)
        if not steps:
            continue  # skip if no steps found (already reported in validation)
        
        prompt = build_validation_prompt(title, objective, module, steps, requirements)
        prompts.append(prompt)
    
    if progress_callback:
        progress_callback("Conversion complete!")
    
    return format_tasks_for_mcp(prompts)

class MarkdownValidator:
    """
    Validates markdown task files for required structure and format.
    """
    
    @staticmethod
    def validate_markdown_structure(md: str) -> Tuple[bool, List[str]]:
        """
        Validate the structure of a markdown task file.
        
        Args:
            md: Markdown content to validate
            
        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []
        
        # Check for required sections
        if not re.search(r'^#\s+Task\s+\d+:', md, re.MULTILINE):
            errors.append("Missing task title. Format: '# Task NNN: Title'")
            
        if not re.search(r'^##\s+Objective', md, re.MULTILINE | re.IGNORECASE):
            errors.append("Missing '## Objective' section")
            
        if not re.search(r'^##\s+Requirements', md, re.MULTILINE | re.IGNORECASE):
            errors.append("Missing '## Requirements' section")
            
        # Check for at least one task
        if not re.search(r'^\s*-\s*\[\s*\]\s*Validate\s*`[^`]+`', md, re.MULTILINE):
            errors.append("No validation tasks found. Format: '- [ ] Validate `file.py`'")
            
        # Check for checkboxes in requirements
        if re.search(r'^##\s+Requirements', md, re.MULTILINE | re.IGNORECASE):
            req_section = re.search(r'## Requirements\n(.*?)(?=\n##|\Z)', md, re.DOTALL | re.IGNORECASE)
            if req_section and not re.search(r'\[\s*\]', req_section.group(1)):
                errors.append("Requirements should use checkboxes. Format: '1. [ ] Requirement'")
        
        return len(errors) == 0, errors

class TaskConverter:
    """
    Converts Markdown task files into Claude Code MCP compatible JSON format.
    
    This class parses markdown files structured as task definitions and 
    converts them into a standardized JSON format that is compatible with
    the Claude Code MCP requirements. It supports validation tasks and
    ensures the output is properly structured for the MCP server.
    
    Key features:
    - Parses Markdown task files with structured sections
    - Extracts metadata and content for MCP processing
    - Generates well-formatted task prompts for Claude
    - Outputs JSON compatible with Claude Code MCP server
    - Validates markdown structure and provides helpful error messages
    """
    def __init__(self):
        """Initialize the TaskConverter."""
        pass
        
    def validate_mcp_format(self, tasks_data: List[Dict[str, Any]]) -> bool:
        """
        Validate the task data against the expected Claude Code MCP format.
        
        Args:
            tasks_data: List of task dictionaries
            
        Returns:
            True if valid, False otherwise
        """
        # Check if tasks_data is a list
        if not isinstance(tasks_data, list):
            print("Error: Invalid format - not a list")
            return False
            
        # Check if the list is empty
        if not tasks_data:
            print("Warning: Empty tasks list")
            return True
            
        # Check each task for required fields
        for i, task in enumerate(tasks_data):
            # Check required fields
            if 'tool' not in task:
                print(f"Error: Task {i+1} missing required field 'tool'")
                return False
                
            if task['tool'] != 'claude_code':
                print(f"Error: Task {i+1} has incorrect tool value. Expected 'claude_code', got '{task['tool']}'")
                return False
                
            if 'arguments' not in task:
                print(f"Error: Task {i+1} missing required field 'arguments'")
                return False
                
            arguments = task['arguments']
            if not isinstance(arguments, dict):
                print(f"Error: Task {i+1} has invalid 'arguments' type. Expected dict, got {type(arguments)}")
                return False
                
            if 'command' not in arguments:
                print(f"Error: Task {i+1} missing required field 'arguments.command'")
                return False
                
            # Check for specific commands and paths in the command
            command = arguments['command']
            if not "cd /home/graham/workspace/experiments/arangodb/" in command:
                print(f"Warning: Task {i+1} missing explicit working directory command")
                
            if not "source .venv/bin/activate" in command:
                print(f"Warning: Task {i+1} missing virtual environment activation")
                
            if not "TASK TYPE:" in command:
                print(f"Warning: Task {i+1} missing 'TASK TYPE:' section")
                
            if not "TASK ID:" in command:
                print(f"Warning: Task {i+1} missing 'TASK ID:' section")
                
            if not "CURRENT SUBTASK:" in command:
                print(f"Warning: Task {i+1} missing 'CURRENT SUBTASK:' section")
                
            if "/path/to/" in command:
                print(f"Error: Task {i+1} contains ambiguous path '/path/to/'")
                return False
                
            # Verify that dangerously_skip_permissions is set to true
            if 'dangerously_skip_permissions' not in arguments:
                print(f"Error: Task {i+1} missing required field 'arguments.dangerously_skip_permissions'")
                return False
                
            if arguments['dangerously_skip_permissions'] is not True:
                print(f"Error: Task {i+1} has incorrect value for 'arguments.dangerously_skip_permissions'. Expected true")
                return False
                
            # Verify timeout is set
            if 'timeout_ms' not in arguments:
                print(f"Warning: Task {i+1} missing 'timeout_ms' field")
                
        return True

def convert_tasks(input_file: str, output_file: str) -> bool:
    """
    Convert markdown tasks to Claude Code MCP format and save to JSON.
    
    Args:
        input_file: Path to the markdown file
        output_file: Path to save the output JSON file
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Validate input file
        if not os.path.isfile(input_file):
            print(f"Error: Input file '{input_file}' does not exist.")
            return False
        
        # Make sure the output directory exists
        output_dir = os.path.dirname(output_file)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        print(f"Processing '{input_file}' to generate MCP tasks...")
        
        # Process markdown and generate MCP tasks with progress
        def progress_print(msg):
            print(f"[Progress] {msg}")
        
        tasks = process_markdown(input_file, progress_callback=progress_print)
        
        # Validate MCP format
        print("\nValidating Claude Code MCP format...")
        # Create a temporary TaskConverter instance for validation
        temp_converter = TaskConverter()
        valid = temp_converter.validate_mcp_format(tasks)
        
        if not valid:
            print("\nValidation failed. Please check the format requirements.")
            return False
        else:
            print("Validation successful.")
        
        # Save to JSON
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(tasks, f, indent=2)
        
        print(f"\nSuccessfully converted markdown to {len(tasks)} validation tasks")
        print(f"JSON saved to '{output_file}'")
        
        return True
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        return False

def main():
    """Main function to execute the script from command line."""
    # Check for --json-output flag for MCP integration
    json_output_mode = '--json-output' in sys.argv
    
    if json_output_mode:
        # Remove the flag from argv for processing
        sys.argv.remove('--json-output')
        
        # Expect only input file
        if len(sys.argv) != 2:
            print("Usage: python task_converter.py --json-output <input_markdown>", file=sys.stderr)
            sys.exit(1)
            
        input_file = sys.argv[1]
        
        # Validate input file
        if not os.path.isfile(input_file):
            print(f"Error: Input file '{input_file}' does not exist.", file=sys.stderr)
            sys.exit(1)
            
        try:
            # Process markdown and output JSON to stdout
            def progress_to_stderr(msg):
                print(f"[Progress] {msg}", file=sys.stderr)
            
            tasks = process_markdown(input_file, progress_callback=progress_to_stderr)
            # Output JSON to stdout for MCP consumption
            print(json.dumps(tasks, indent=2))
            sys.exit(0)
        except Exception as e:
            print(f"Error during conversion: {str(e)}", file=sys.stderr)
            sys.exit(1)
    
    else:
        # Original file-based mode
        if len(sys.argv) < 3:
            print("Usage: python task_converter.py <input_markdown> <output_json>")
            print("   or: python task_converter.py --json-output <input_markdown>")
            sys.exit(1)
        
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
        success = convert_tasks(input_file, output_file)
        
        if success:
            print("\nJSON structure is compatible with Claude Code MCP format.")
            
            # Show example of how to use the output
            print("\nTo use this file with Claude Code MCP:")
            print("1. Configure your MCP server to use this JSON file")
            print("2. Start your MCP server with the command:")
            print(f"   claude mcp add arangodb-validation -- node /path/to/server.js '{output_file}'")
            print("3. The tasks will be available to Claude through the MCP server")
        else:
            print("\nTask conversion failed.")
            sys.exit(1)

if __name__ == "__main__":
    main()
