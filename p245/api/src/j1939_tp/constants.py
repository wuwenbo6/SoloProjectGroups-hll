"""J1939 TP协议常量定义"""

# TP.PGN定义
PGN_TP_CM = 0xEC00  # 连接管理消息
PGN_TP_DT = 0xEB00  # 数据传输消息

# TP.CM控制字节
CTRL_BAM = 16          # BAM广播公告
CTRL_RTS = 16          # RTS请求发送
CTRL_CTS = 17          # CTS清除发送
CTRL_ACK = 19          # EndOfMsgAck消息结束确认
CTRL_ABORT = 255       # 连接中止

# J1939地址常量
GLOBAL_ADDRESS = 0xFF  # 广播目标地址
NULL_ADDRESS = 0xFE    # 空地址

# TP协议限制
MAX_TP_MESSAGE_SIZE = 1785  # TP最大消息大小
MIN_TP_MESSAGE_SIZE = 9     # TP最小消息大小（超过8字节才需要TP）
MAX_TP_PACKETS = 255        # TP最大包数
DT_DATA_SIZE = 7            # 每个DT帧的数据字节数

# 传输模式
MODE_BAM = "bam"            # 广播模式
MODE_CMDT = "cmdt"          # 点对点模式

# 模拟状态
STATE_IDLE = "idle"
STATE_WAITING_CTS = "waiting_cts"
STATE_TRANSMITTING = "transmitting"
STATE_WAITING_ACK = "waiting_ack"
STATE_RETRANSMITTING = "retransmitting"
STATE_COMPLETE = "complete"
STATE_ABORTED = "aborted"

# 事件类型
EVENT_BAM_ANNOUNCE = "bam_announce"
EVENT_RTS_SENT = "rts_sent"
EVENT_RTS_RETRY = "rts_retry"
EVENT_RTS_TIMEOUT = "rts_timeout"
EVENT_CTS_SENT = "cts_sent"
EVENT_FRAME_SENT = "frame_sent"
EVENT_FRAME_RECEIVED = "frame_received"
EVENT_FRAME_LOST = "frame_lost"
EVENT_FRAME_RETRANSMIT = "frame_retransmit"
EVENT_SEQUENCE_ERROR = "sequence_error"
EVENT_EOM_ACK = "eom_ack"
EVENT_REASSEMBLY_PROGRESS = "reassembly_progress"
EVENT_SIMULATION_COMPLETE = "simulation_complete"
EVENT_STATE_CHANGE = "state_change"
EVENT_ERROR = "error"
EVENT_NODE_RECEIVE = "node_receive"
EVENT_NODE_PROGRESS = "node_progress"

# 超时配置（秒）
RTS_TIMEOUT = 1.0
MAX_RTS_RETRIES = 3
