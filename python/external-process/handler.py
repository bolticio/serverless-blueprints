import subprocess

def handler(path):
    # Extract command from the payload
    request_body = request.get_json(force=True, silent=True)
    cmd = request_body.get("command")
    if not cmd:
        return { 'error': 'Please specify a command to run in the payload'}		

    # Run the command
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        # Log stdout and stderr
        print(result.stdout)
        print(result.stderr)
        return { 'stdout': result.stdout, 'stderr': result.stderr }
    except Exception as e:
        # If an exception occurs, return the error message
        return { 'error': str(e) }
