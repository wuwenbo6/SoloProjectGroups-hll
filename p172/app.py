import os
import sys
import signal
import subprocess
import tempfile
import shutil
import multiprocessing
import traceback
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='static')

EXECUTION_TIMEOUT = 5
MAX_OUTPUT_SIZE = 1024 * 1024
MAX_MEMORY_MB = 256
MAX_CPU_SECONDS = 5


def limit_resources():
    try:
        import resource
        
        soft_as, hard_as = resource.getrlimit(resource.RLIMIT_AS)
        max_as = min(MAX_MEMORY_MB * 1024 * 1024, hard_as if hard_as != resource.RLIM_INFINITY else MAX_MEMORY_MB * 1024 * 1024)
        resource.setrlimit(resource.RLIMIT_AS, (max_as, max_as))
        
        soft_cpu, hard_cpu = resource.getrlimit(resource.RLIMIT_CPU)
        max_cpu = min(MAX_CPU_SECONDS, hard_cpu if hard_cpu != resource.RLIM_INFINITY else MAX_CPU_SECONDS)
        resource.setrlimit(resource.RLIMIT_CPU, (max_cpu, max_cpu))
        
        soft_nproc, hard_nproc = resource.getrlimit(resource.RLIMIT_NPROC)
        max_nproc = min(50, hard_nproc if hard_nproc != resource.RLIM_INFINITY else 50)
        resource.setrlimit(resource.RLIMIT_NPROC, (max_nproc, max_nproc))
    except Exception:
        pass


def run_in_subprocess(language, code, files, conn):
    try:
        limit_resources()

        tmp_dir = tempfile.mkdtemp(prefix='code-sandbox-')

        try:
            if files:
                for filename, file_data in files.items():
                    if isinstance(file_data, dict) and 'content' in file_data:
                        content = file_data['content']
                    else:
                        content = str(file_data)
                    
                    safe_filename = os.path.basename(filename)
                    if safe_filename and not safe_filename.startswith('.'):
                        filepath = os.path.join(tmp_dir, safe_filename)
                        with open(filepath, 'w') as f:
                            f.write(content)

            if language == 'go':
                main_filename = os.path.join(tmp_dir, 'main.go')
                with open(main_filename, 'w') as f:
                    f.write(code)
                cmd = ['go', 'run', main_filename]
            else:
                main_filename = os.path.join(tmp_dir, 'main.py')
                with open(main_filename, 'w') as f:
                    f.write(code)
                cmd = ['python3', main_filename]

            env = os.environ.copy()
            env['PATH'] = '/usr/local/bin:/usr/bin:/bin'
            env['PYTHONUNBUFFERED'] = '1'

            result = subprocess.run(
                cmd,
                cwd=tmp_dir,
                capture_output=True,
                text=True,
                timeout=EXECUTION_TIMEOUT,
                env=env,
                preexec_fn=os.setsid
            )

            stdout = result.stdout[:MAX_OUTPUT_SIZE]
            stderr = result.stderr[:MAX_OUTPUT_SIZE]
            error = None

            if result.returncode != 0 and not stderr:
                error = f'Process exited with code {result.returncode}'

            conn.send(('success', stdout, stderr, error))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    except subprocess.TimeoutExpired:
        conn.send(('timeout', '', '', 'Execution timed out after 5 seconds'))
    except MemoryError:
        conn.send(('error', '', '', 'Memory limit exceeded'))
    except Exception as e:
        conn.send(('error', '', '', str(e)))
    finally:
        conn.close()


def execute_code(language, code, files=None):
    parent_conn, child_conn = multiprocessing.Pipe()

    process = multiprocessing.Process(
        target=run_in_subprocess,
        args=(language, code, files, child_conn),
        daemon=True
    )

    try:
        process.start()
        child_conn.close()

        if parent_conn.poll(timeout=EXECUTION_TIMEOUT + 2):
            result = parent_conn.recv()
            status, stdout, stderr, error = result
            return stdout, stderr, error
        else:
            process.terminate()
            process.join(timeout=1)
            if process.is_alive():
                process.kill()
                process.join()
            return '', '', 'Execution timed out after 5 seconds'

    except Exception as e:
        if process.is_alive():
            process.terminate()
            process.join(timeout=1)
        return '', '', f'Server error: {str(e)}'
    finally:
        parent_conn.close()
        if process.is_alive():
            process.terminate()
            process.join(timeout=1)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/execute', methods=['POST'])
def execute():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request'}), 400

        language = data.get('language', '').lower()
        code = data.get('code', '')
        files = data.get('files', {})

        if language not in ['go', 'python']:
            return jsonify({'error': 'Unsupported language'}), 400

        if not code.strip():
            return jsonify({'error': 'Code cannot be empty'}), 400

        if len(code) > 100000:
            return jsonify({'error': 'Code too large'}), 400

        if files and len(files) > 20:
            return jsonify({'error': 'Too many files'}), 400

        stdout, stderr, error = execute_code(language, code, files)

        return jsonify({
            'stdout': stdout,
            'stderr': stderr,
            'error': error
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500


if __name__ == '__main__':
    print('Server starting on http://localhost:8080')
    print(f'Limits: {EXECUTION_TIMEOUT}s timeout, {MAX_MEMORY_MB}MB memory, {MAX_CPU_SECONDS}s CPU')
    print(f'Pre-installed: numpy, pandas')
    app.run(host='0.0.0.0', port=8080, debug=False)
