from backend.iscsi import ErrorRecoveryEngine, SessionManager, ConnectionManager, LogManager
from backend.iscsi.types import SessionConfig, ErrorRecoveryLevel

print('All imports successful!')

config = SessionConfig(target_iqn='iqn.2025-01.com.example:target', erl_level=ErrorRecoveryLevel.ERL1)
session_mgr = SessionManager(config)
conn_mgr = ConnectionManager()
logger = LogManager()

recovery_engine = ErrorRecoveryEngine(session_mgr, conn_mgr, logger)
print('ErrorRecoveryEngine initialized successfully!')

session_id = session_mgr.create_session('iqn.2025-01.com.example:initiator')
print(f'Created session: {session_id}')

status = recovery_engine.get_recovery_status(session_id)
print(f'Status: exists={status["exists"]}, recovering={status["is_recovering"]}')

recovery_engine.trigger_recovery(session_id)
print('Recovery triggered!')

status = recovery_engine.get_recovery_status(session_id)
print(f'After trigger: recovering={status["is_recovering"]}')

print('All tests passed!')
