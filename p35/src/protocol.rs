use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::io::{Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

pub const NTP_VERSION: u8 = 4;
pub const NTP_PORT: u16 = 123;
pub const NTP_EPOCH: u64 = 2208988800;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeapIndicator {
    NoWarning = 0,
    LastMinute61 = 1,
    LastMinute59 = 2,
    Alarm = 3,
}

impl From<u8> for LeapIndicator {
    fn from(v: u8) -> Self {
        match v & 0b11 {
            0 => LeapIndicator::NoWarning,
            1 => LeapIndicator::LastMinute61,
            2 => LeapIndicator::LastMinute59,
            _ => LeapIndicator::Alarm,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Reserved = 0,
    SymmetricActive = 1,
    SymmetricPassive = 2,
    Client = 3,
    Server = 4,
    Broadcast = 5,
    Control = 6,
    Private = 7,
}

impl From<u8> for Mode {
    fn from(v: u8) -> Self {
        match v & 0b111 {
            0 => Mode::Reserved,
            1 => Mode::SymmetricActive,
            2 => Mode::SymmetricPassive,
            3 => Mode::Client,
            4 => Mode::Server,
            5 => Mode::Broadcast,
            6 => Mode::Control,
            _ => Mode::Private,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stratum {
    KissODeath = 0,
    Primary = 1,
    Secondary(u8),
}

impl From<u8> for Stratum {
    fn from(v: u8) -> Self {
        match v {
            0 => Stratum::KissODeath,
            1 => Stratum::Primary,
            n => Stratum::Secondary(n),
        }
    }
}

impl From<Stratum> for u8 {
    fn from(s: Stratum) -> Self {
        match s {
            Stratum::KissODeath => 0,
            Stratum::Primary => 1,
            Stratum::Secondary(n) => n,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NtpTimestamp {
    pub seconds: u32,
    pub fraction: u32,
}

impl NtpTimestamp {
    pub fn now() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        
        let total_seconds = now.as_secs() + NTP_EPOCH;
        let nanos = now.subsec_nanos();
        let fraction = ((nanos as u64) * (1u64 << 32) / 1_000_000_000) as u32;
        
        NtpTimestamp {
            seconds: total_seconds as u32,
            fraction,
        }
    }

    pub fn zero() -> Self {
        NtpTimestamp {
            seconds: 0,
            fraction: 0,
        }
    }

    pub fn from_system_time(time: SystemTime) -> Self {
        let dur = time
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        
        let total_seconds = dur.as_secs() + NTP_EPOCH;
        let nanos = dur.subsec_nanos();
        let fraction = ((nanos as u64) * (1u64 << 32) / 1_000_000_000) as u32;
        
        NtpTimestamp {
            seconds: total_seconds as u32,
            fraction,
        }
    }

    pub fn to_system_time(&self) -> SystemTime {
        let secs = (self.seconds as u64).saturating_sub(NTP_EPOCH);
        let nanos = ((self.fraction as u64) * 1_000_000_000 / (1u64 << 32)) as u32;
        UNIX_EPOCH + std::time::Duration::new(secs, nanos)
    }

    pub fn to_f64(&self) -> f64 {
        self.seconds as f64 + (self.fraction as f64) / (1u64 << 32) as f64
    }
}

#[derive(Debug, Clone)]
pub struct NtpPacket {
    pub leap_indicator: LeapIndicator,
    pub version: u8,
    pub mode: Mode,
    pub stratum: Stratum,
    pub poll: i8,
    pub precision: i8,
    pub root_delay: u32,
    pub root_dispersion: u32,
    pub reference_id: [u8; 4],
    pub reference_timestamp: NtpTimestamp,
    pub originate_timestamp: NtpTimestamp,
    pub receive_timestamp: NtpTimestamp,
    pub transmit_timestamp: NtpTimestamp,
    pub extension_fields: Vec<u8>,
    pub key_identifier: Option<u32>,
    pub message_digest: Option<[u8; 16]>,
}

impl Default for NtpPacket {
    fn default() -> Self {
        NtpPacket {
            leap_indicator: LeapIndicator::NoWarning,
            version: NTP_VERSION,
            mode: Mode::Server,
            stratum: Stratum::Primary,
            poll: 4,
            precision: -20,
            root_delay: 0,
            root_dispersion: 0,
            reference_id: [b'L', b'O', b'C', b'L'],
            reference_timestamp: NtpTimestamp::zero(),
            originate_timestamp: NtpTimestamp::zero(),
            receive_timestamp: NtpTimestamp::zero(),
            transmit_timestamp: NtpTimestamp::zero(),
            extension_fields: Vec::new(),
            key_identifier: None,
            message_digest: None,
        }
    }
}

impl NtpPacket {
    pub fn new_client() -> Self {
        NtpPacket {
            mode: Mode::Client,
            stratum: Stratum::KissODeath,
            ..Default::default()
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(48);
        
        let first_byte = ((self.leap_indicator as u8) << 6) 
            | ((self.version & 0b111) << 3) 
            | (self.mode as u8);
        buf.push(first_byte);
        
        buf.push(u8::from(self.stratum));
        buf.push(self.poll as u8);
        buf.push(self.precision as u8);
        
        buf.write_u32::<BigEndian>(self.root_delay).unwrap();
        buf.write_u32::<BigEndian>(self.root_dispersion).unwrap();
        buf.extend_from_slice(&self.reference_id);
        
        buf.write_u32::<BigEndian>(self.reference_timestamp.seconds).unwrap();
        buf.write_u32::<BigEndian>(self.reference_timestamp.fraction).unwrap();
        
        buf.write_u32::<BigEndian>(self.originate_timestamp.seconds).unwrap();
        buf.write_u32::<BigEndian>(self.originate_timestamp.fraction).unwrap();
        
        buf.write_u32::<BigEndian>(self.receive_timestamp.seconds).unwrap();
        buf.write_u32::<BigEndian>(self.receive_timestamp.fraction).unwrap();
        
        buf.write_u32::<BigEndian>(self.transmit_timestamp.seconds).unwrap();
        buf.write_u32::<BigEndian>(self.transmit_timestamp.fraction).unwrap();
        
        buf.extend_from_slice(&self.extension_fields);
        
        if let Some(key_id) = self.key_identifier {
            buf.write_u32::<BigEndian>(key_id).unwrap();
        }
        
        if let Some(digest) = self.message_digest {
            buf.extend_from_slice(&digest);
        }
        
        buf
    }

    pub fn deserialize(data: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        if data.len() < 48 {
            return Err("Packet too short".into());
        }
        
        let mut cursor = std::io::Cursor::new(data);
        
        let first_byte = cursor.read_u8()?;
        let leap_indicator = LeapIndicator::from(first_byte >> 6);
        let version = (first_byte >> 3) & 0b111;
        let mode = Mode::from(first_byte & 0b111);
        
        let stratum = Stratum::from(cursor.read_u8()?);
        let poll = cursor.read_i8()?;
        let precision = cursor.read_i8()?;
        
        let root_delay = cursor.read_u32::<BigEndian>()?;
        let root_dispersion = cursor.read_u32::<BigEndian>()?;
        
        let mut reference_id = [0u8; 4];
        cursor.read_exact(&mut reference_id)?;
        
        let reference_timestamp = NtpTimestamp {
            seconds: cursor.read_u32::<BigEndian>()?,
            fraction: cursor.read_u32::<BigEndian>()?,
        };
        
        let originate_timestamp = NtpTimestamp {
            seconds: cursor.read_u32::<BigEndian>()?,
            fraction: cursor.read_u32::<BigEndian>()?,
        };
        
        let receive_timestamp = NtpTimestamp {
            seconds: cursor.read_u32::<BigEndian>()?,
            fraction: cursor.read_u32::<BigEndian>()?,
        };
        
        let transmit_timestamp = NtpTimestamp {
            seconds: cursor.read_u32::<BigEndian>()?,
            fraction: cursor.read_u32::<BigEndian>()?,
        };
        
        let extension_fields = if data.len() > 48 {
            let remaining = data.len() - 48;
            let mut ext = vec![0u8; remaining];
            cursor.read_exact(&mut ext)?;
            ext
        } else {
            Vec::new()
        };
        
        Ok(NtpPacket {
            leap_indicator,
            version,
            mode,
            stratum,
            poll,
            precision,
            root_delay,
            root_dispersion,
            reference_id,
            reference_timestamp,
            originate_timestamp,
            receive_timestamp,
            transmit_timestamp,
            extension_fields,
            key_identifier: None,
            message_digest: None,
        })
    }
}

pub fn calculate_offset(
    t1: NtpTimestamp,
    t2: NtpTimestamp,
    t3: NtpTimestamp,
    t4: NtpTimestamp,
) -> f64 {
    let t1 = t1.to_f64();
    let t2 = t2.to_f64();
    let t3 = t3.to_f64();
    let t4 = t4.to_f64();
    
    ((t2 - t1) + (t3 - t4)) / 2.0
}

pub fn calculate_delay(
    t1: NtpTimestamp,
    t2: NtpTimestamp,
    t3: NtpTimestamp,
    t4: NtpTimestamp,
) -> f64 {
    let t1 = t1.to_f64();
    let t2 = t2.to_f64();
    let t3 = t3.to_f64();
    let t4 = t4.to_f64();
    
    (t4 - t1) - (t3 - t2)
}
