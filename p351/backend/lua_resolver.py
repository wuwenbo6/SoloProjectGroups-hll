from typing import Tuple, Optional
from .models import DataRecord, ConflictResolver, to_utc_timestamp

try:
    from lupa import LuaRuntime
    LUPA_AVAILABLE = True
except ImportError:
    LUPA_AVAILABLE = False


DEFAULT_LUA_SCRIPT = """-- 冲突解决函数
-- incoming: 传入记录 {id, data, timestamp}
-- existing: 本地记录 {id, data, timestamp}
-- 返回: "incoming" 或 "existing"

function resolve(incoming, existing)
  -- 默认策略：按UTC时间戳保留最新记录
  if incoming.timestamp > existing.timestamp then
    return "incoming"
  end
  return "existing"
end
"""


class LuaConflictResolver(ConflictResolver):
    def __init__(self, script: Optional[str] = None):
        if not LUPA_AVAILABLE:
            raise RuntimeError("lupa library is not installed. Run: pip install lupa")

        self.script = script or DEFAULT_LUA_SCRIPT
        self._lua = LuaRuntime(unpack_returned_tuples=False)
        self._compile()

    def _compile(self):
        try:
            self._lua.execute(self.script)
            self._resolve_func = self._lua.globals().resolve
        except Exception as e:
            raise ValueError(f"Lua script compilation error: {e}")

    def update_script(self, script: str):
        old_script = self.script
        self.script = script
        try:
            self._compile()
        except Exception as e:
            self.script = old_script
            self._compile()
            raise ValueError(f"Lua script compilation error: {e}")

    def resolve(self, incoming: DataRecord, existing: DataRecord) -> Tuple[DataRecord, str]:
        incoming_utc = to_utc_timestamp(incoming.timestamp)
        existing_utc = to_utc_timestamp(existing.timestamp)

        try:
            lua_incoming = {
                "id": incoming.id,
                "data": incoming.data,
                "timestamp": incoming_utc,
            }
            lua_existing = {
                "id": existing.id,
                "data": existing.data,
                "timestamp": existing_utc,
            }

            result = self._resolve_func(lua_incoming, lua_existing)

            if result == "incoming":
                return incoming, f"[Lua] 保留传入记录：UTC时间戳更新 ({incoming_utc:.6f} > {existing_utc:.6f})"
            elif result == "existing":
                return existing, f"[Lua] 保留本地记录：UTC时间戳更新或相等 ({existing_utc:.6f} >= {incoming_utc:.6f})"
            else:
                return existing, f"[Lua] 脚本返回未知结果 '{result}'，默认保留本地记录"

        except Exception as e:
            return existing, f"[Lua] 脚本执行错误: {e}，默认保留本地记录"

    def get_script(self) -> str:
        return self.script

    @staticmethod
    def get_default_script() -> str:
        return DEFAULT_LUA_SCRIPT

    @staticmethod
    def is_available() -> bool:
        return LUPA_AVAILABLE
