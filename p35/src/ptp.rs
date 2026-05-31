use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::io::Cursor;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::Serialize;

pub const PTP_VERSION: u8 = 2;
pub const PTP_EVENT_PORT: u16 = 319;
pub const PTP_GENERAL_PORT: u16 = 320;
pub const PTP_MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(224, 0, 1, 129);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PtpMessageType {
    Sync = 0x0,
    DelayReq = 0x1,
    FollowUp = 0x8,
    DelayResp = 0x9,
    Announce = 0xb,
    Signaling = 0xc,
    Management = 0xd,
}

impl From<u8> for PtpMessageType {
    fn from(v: u8) -> Self {
        match v & 0x0f {
            0x0 => PtpMessageType::Sync,
            0x1 => PtpMessageType::DelayReq,
            0x8 => PtpMessageType::FollowUp,
            0x9 => PtpMessageType::DelayResp,
            0xb => PtpMessageType::Announce,
            0xc => PtpMessageType::Signaling,
            0xd => PtpMessageType::Management,
            _ => PtpMessageType::Signaling,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PtpDomain {
    Default = 0,
    Alt1 = 1,
    Alt2 = 2,
    Alt3 = 3,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PtpTimestamp {
    pub seconds: u64,
    pub nanoseconds: u32,
}

impl PtpTimestamp {
    pub fn now() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        
        PtpTimestamp {
            seconds: now.as_secs(),
            nanoseconds: now.subsec_nanos(),
        }
    }

    pub fn zero() -> Self {
        PtpTimestamp {
            seconds: 0,
            nanoseconds: 0,
        }
    }

    pub fn from_system_time(time: SystemTime) -> Self {
        let dur = time
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        
        PtpTimestamp {
            seconds: dur.as_secs(),
            nanoseconds: dur.subsec_nanos(),
        }
    }

    pub fn to_system_time(&self) -> SystemTime {
        UNIX_EPOCH + Duration::new(self.seconds, self.nanoseconds)
    }

    pub fn to_duration(&self) -> Duration {
        Duration::new(self.seconds, self.nanoseconds)
    }

    pub fn to_ntp_timestamp(&self) -> super::protocol::NtpTimestamp {
        use super::protocol::{NtpTimestamp, NTP_EPOCH};
        
        let total_seconds = self.seconds + NTP_EPOCH;
        let fraction = ((self.nanoseconds as u64) * (1u64 << 32) / 1_000_000_000) as u32;
        
        NtpTimestamp {
            seconds: total_seconds as u32,
            fraction,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ClockIdentity(pub [u8; 8]);

impl ClockIdentity {
    pub fn from_mac(mac: &[u8; 6]) -> Self {
        let mut id = [0u8; 8];
        id[0] = mac[0];
        id[1] = mac[1];
        id[2] = mac[2];
        id[3] = 0xff;
        id[4] = 0xfe;
        id[5] = mac[3];
        id[6] = mac[4];
        id[7] = mac[5];
        ClockIdentity(id)
    }

    pub fn random() -> Self {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let mut id = [0u8; 8];
        rng.fill(&mut id);
        id[3] = 0xff;
        id[4] = 0xfe;
        ClockIdentity(id)
    }
}

impl Default for ClockIdentity {
    fn default() -> Self {
        ClockIdentity::random()
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PortIdentity {
    pub clock_identity: ClockIdentity,
    pub port_number: u16,
}

impl PortIdentity {
    pub fn new(clock_identity: ClockIdentity, port_number: u16) -> Self {
        PortIdentity {
            clock_identity,
            port_number,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PtpHeader {
    pub message_type: PtpMessageType,
    pub version: u8,
    pub message_length: u16,
    pub domain_number: u8,
    pub flags: u16,
    pub correction_field: i64,
    pub source_port_identity: PortIdentity,
    pub sequence_id: u16,
    pub control_field: u8,
    pub log_message_interval: i8,
}

impl Default for PtpHeader {
    fn default() -> Self {
        PtpHeader {
            message_type: PtpMessageType::Sync,
            version: PTP_VERSION,
            message_length: 0,
            domain_number: 0,
            flags: 0,
            correction_field: 0,
            source_port_identity: PortIdentity::new(ClockIdentity::default(), 1),
            sequence_id: 0,
            control_field: 0,
            log_message_interval: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncMessage {
    pub header: PtpHeader,
    pub origin_timestamp: PtpTimestamp,
}

impl SyncMessage {
    pub fn new(sequence_id: u16, port_identity: PortIdentity) -> Self {
        SyncMessage {
            header: PtpHeader {
                message_type: PtpMessageType::Sync,
                message_length: 44,
                source_port_identity: port_identity,
                sequence_id,
                control_field: 0,
                ..Default::default()
            },
            origin_timestamp: PtpTimestamp::now(),
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(44);
        self.header.serialize_into(&mut buf);
        
        buf.write_u16::<BigEndian>(0).unwrap();
        buf.write_u16::<BigEndian>(0).unwrap();
        
        buf.write_u16::<BigEndian>(self.origin_timestamp.seconds as u16).unwrap();
        buf.write_u32::<BigEndian>((self.origin_timestamp.seconds >> 16) as u32).unwrap();
        buf.write_u32::<BigEndian>(self.origin_timestamp.nanoseconds).unwrap();
        
        buf
    }

    pub fn deserialize(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        let mut cursor = Cursor::new(data);
        let header = PtpHeader::deserialize_from(&mut cursor)?;
        
        cursor.set_position(34);
        let seconds_hi = cursor.read_u16::<BigEndian>()? as u64;
        let seconds_lo = cursor.read_u32::<BigEndian>()? as u64;
        let nanoseconds = cursor.read_u32::<BigEndian>()?;
        
        Ok(SyncMessage {
            header,
            origin_timestamp: PtpTimestamp {
                seconds: (seconds_hi << 32) | seconds_lo,
                nanoseconds,
            },
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FollowUpMessage {
    pub header: PtpHeader,
    pub precise_origin_timestamp: PtpTimestamp,
}

impl FollowUpMessage {
    pub fn new(sequence_id: u16, port_identity: PortIdentity, timestamp: PtpTimestamp) -> Self {
        FollowUpMessage {
            header: PtpHeader {
                message_type: PtpMessageType::FollowUp,
                message_length: 44,
                source_port_identity: port_identity,
                sequence_id,
                control_field: 2,
                ..Default::default()
            },
            precise_origin_timestamp: timestamp,
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(44);
        self.header.serialize_into(&mut buf);
        
        buf.write_u16::<BigEndian>(0).unwrap();
        buf.write_u16::<BigEndian>(0).unwrap();
        
        let seconds = self.precise_origin_timestamp.seconds;
        buf.write_u16::<BigEndian>((seconds >> 32) as u16).unwrap();
        buf.write_u32::<BigEndian>(seconds as u32).unwrap();
        buf.write_u32::<BigEndian>(self.precise_origin_timestamp.nanoseconds).unwrap();
        
        buf
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DelayReqMessage {
    pub header: PtpHeader,
    pub origin_timestamp: PtpTimestamp,
}

#[derive(Debug, Clone, Serialize)]
pub struct DelayRespMessage {
    pub header: PtpHeader,
    pub receive_timestamp: PtpTimestamp,
    pub requesting_port_identity: PortIdentity,
}

impl DelayRespMessage {
    pub fn new(
        sequence_id: u16,
        port_identity: PortIdentity,
        timestamp: PtpTimestamp,
        requester: PortIdentity,
    ) -> Self {
        DelayRespMessage {
            header: PtpHeader {
                message_type: PtpMessageType::DelayResp,
                message_length: 54,
                source_port_identity: port_identity,
                sequence_id,
                control_field: 3,
                ..Default::default()
            },
            receive_timestamp: timestamp,
            requesting_port_identity: requester,
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(54);
        self.header.serialize_into(&mut buf);
        
        buf.write_u16::<BigEndian>(0).unwrap();
        buf.write_u16::<BigEndian>(0).unwrap();
        
        let seconds = self.receive_timestamp.seconds;
        buf.write_u16::<BigEndian>((seconds >> 32) as u16).unwrap();
        buf.write_u32::<BigEndian>(seconds as u32).unwrap();
        buf.write_u32::<BigEndian>(self.receive_timestamp.nanoseconds).unwrap();
        
        buf.extend_from_slice(&self.requesting_port_identity.clock_identity.0);
        buf.write_u16::<BigEndian>(self.requesting_port_identity.port_number).unwrap();
        
        buf
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AnnounceMessage {
    pub header: PtpHeader,
    pub origin_timestamp: PtpTimestamp,
    pub current_utc_offset: i16,
    pub grandmaster_priority1: u8,
    pub grandmaster_clock_quality: u32,
    pub grandmaster_priority2: u8,
    pub grandmaster_identity: ClockIdentity,
    pub steps_removed: u16,
    pub time_source: u8,
}

impl AnnounceMessage {
    pub fn new(sequence_id: u16, port_identity: PortIdentity, grandmaster: ClockIdentity) -> Self {
        AnnounceMessage {
            header: PtpHeader {
                message_type: PtpMessageType::Announce,
                message_length: 64,
                source_port_identity: port_identity,
                sequence_id,
                control_field: 5,
                ..Default::default()
            },
            origin_timestamp: PtpTimestamp::now(),
            current_utc_offset: 37,
            grandmaster_priority1: 128,
            grandmaster_clock_quality: 0x00000000,
            grandmaster_priority2: 128,
            grandmaster_identity: grandmaster,
            steps_removed: 0,
            time_source: 0x80,
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(64);
        self.header.serialize_into(&mut buf);
        
        buf.write_u16::<BigEndian>(0).unwrap();
        buf.write_u16::<BigEndian>(0).unwrap();
        
        let seconds = self.origin_timestamp.seconds;
        buf.write_u16::<BigEndian>((seconds >> 32) as u16).unwrap();
        buf.write_u32::<BigEndian>(seconds as u32).unwrap();
        buf.write_u32::<BigEndian>(self.origin_timestamp.nanoseconds).unwrap();
        
        buf.write_i16::<BigEndian>(self.current_utc_offset).unwrap();
        buf.write_u8(self.grandmaster_priority1).unwrap();
        buf.write_u8(0).unwrap();
        buf.write_u8(0).unwrap();
        buf.write_u8(0).unwrap();
        buf.write_u8(self.grandmaster_priority2).unwrap();
        buf.extend_from_slice(&self.grandmaster_identity.0);
        buf.write_u16::<BigEndian>(self.steps_removed).unwrap();
        buf.write_u8(self.time_source).unwrap();
        
        buf.resize(64, 0);
        buf
    }
}

impl PtpHeader {
    pub fn serialize_into(&self, buf: &mut Vec<u8>) {
        let first_byte = ((self.message_type as u8) & 0x0f) | ((self.version & 0x0f) << 4);
        buf.push(first_byte);
        buf.push(0);
        buf.write_u16::<BigEndian>(self.message_length).unwrap();
        buf.push(self.domain_number);
        buf.push(0);
        buf.write_u16::<BigEndian>(self.flags).unwrap();
        
        buf.write_u32::<BigEndian>((self.correction_field >> 32) as u32).unwrap();
        buf.write_u32::<BigEndian>(self.correction_field as u32).unwrap();
        
        buf.write_u32::<BigEndian>(0).unwrap();
        
        buf.extend_from_slice(&self.source_port_identity.clock_identity.0);
        buf.write_u16::<BigEndian>(self.source_port_identity.port_number).unwrap();
        buf.write_u16::<BigEndian>(self.sequence_id).unwrap();
        buf.write_u8(self.control_field).unwrap();
        buf.write_u8(self.log_message_interval as u8).unwrap();
    }

    pub fn deserialize_from(cursor: &mut Cursor<&[u8]>) -> Result<Self, Box<dyn std::error::Error>> {
        let first_byte = cursor.read_u8()?;
        let message_type = PtpMessageType::from(first_byte);
        let version = (first_byte >> 4) & 0x0f;
        
        cursor.read_u8()?;
        let message_length = cursor.read_u16::<BigEndian>()?;
        let domain_number = cursor.read_u8()?;
        cursor.read_u8()?;
        let flags = cursor.read_u16::<BigEndian>()?;
        
        let correction_hi = cursor.read_u32::<BigEndian>()? as i64;
        let correction_lo = cursor.read_u32::<BigEndian>()? as i64;
        let correction_field = (correction_hi << 32) | correction_lo;
        
        cursor.read_u32::<BigEndian>()?;
        
        let mut clock_identity = [0u8; 8];
        cursor.read_exact(&mut clock_identity)?;
        let port_number = cursor.read_u16::<BigEndian>()?;
        let sequence_id = cursor.read_u16::<BigEndian>()?;
        let control_field = cursor.read_u8()?;
        let log_message_interval = cursor.read_i8()?;
        
        Ok(PtpHeader {
            message_type,
            version,
            message_length,
            domain_number,
            flags,
            correction_field,
            source_port_identity: PortIdentity::new(ClockIdentity(clock_identity), port_number),
            sequence_id,
            control_field,
            log_message_interval,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PtpState {
    pub clock_identity: ClockIdentity,
    pub port_number: u16,
    pub sequence_id: u16,
    pub last_sync_time: Option<PtpTimestamp>,
    pub last_follow_up_time: Option<PtpTimestamp>,
    pub offset_from_master: Option<f64>,
    pub mean_path_delay: Option<f64>,
    pub is_grandmaster: bool,
}

impl Default for PtpState {
    fn default() -> Self {
        PtpState {
            clock_identity: ClockIdentity::default(),
            port_number: 1,
            sequence_id: 0,
            last_sync_time: None,
            last_follow_up_time: None,
            offset_from_master: None,
            mean_path_delay: None,
            is_grandmaster: true,
        }
    }
}

pub fn calculate_ptp_offset(
    t1: PtpTimestamp,
    t2: PtpTimestamp,
    t3: PtpTimestamp,
    t4: PtpTimestamp,
) -> f64 {
    let t1_ns = t1.seconds as f64 * 1e9 + t1.nanoseconds as f64;
    let t2_ns = t2.seconds as f64 * 1e9 + t2.nanoseconds as f64;
    let t3_ns = t3.seconds as f64 * 1e9 + t3.nanoseconds as f64;
    let t4_ns = t4.seconds as f64 * 1e9 + t4.nanoseconds as f64;
    
    ((t2_ns - t1_ns) - (t4_ns - t3_ns)) / 2.0
}

pub fn calculate_ptp_delay(
    t1: PtpTimestamp,
    t2: PtpTimestamp,
    t3: PtpTimestamp,
    t4: PtpTimestamp,
) -> f64 {
    let t1_ns = t1.seconds as f64 * 1e9 + t1.nanoseconds as f64;
    let t2_ns = t2.seconds as f64 * 1e9 + t2.nanoseconds as f64;
    let t3_ns = t3.seconds as f64 * 1e9 + t3.nanoseconds as f64;
    let t4_ns = t4.seconds as f64 * 1e9 + t4.nanoseconds as f64;
    
    ((t4_ns - t1_ns) + (t3_ns - t2_ns)) / 2.0
}
