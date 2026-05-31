use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, Duration};
use chrono::{Utc, DateTime, Timelike};
use crate::protocol::LeapIndicator;

#[derive(Debug, Clone)]
pub struct LeapSecondManager {
    current_leap: Arc<AtomicU8>,
    next_leap_utc: Arc<std::sync::RwLock<Option<DateTime<Utc>>>>,
    leap_second_table: Arc<std::sync::RwLock<Vec<LeapSecondEntry>>>,
}

#[derive(Debug, Clone)]
struct LeapSecondEntry {
    utc_time: DateTime<Utc>,
    tai_offset: i32,
}

impl LeapSecondManager {
    pub fn new() -> Self {
        let mut table = Self::build_default_table();
        table.sort_by_key(|e| e.utc_time);
        
        LeapSecondManager {
            current_leap: Arc::new(AtomicU8::new(LeapIndicator::NoWarning as u8)),
            next_leap_utc: Arc::new(std::sync::RwLock::new(None)),
            leap_second_table: Arc::new(std::sync::RwLock::new(table)),
        }
    }

    fn build_default_table() -> Vec<LeapSecondEntry> {
        vec![
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1972-07-01T00:00:00Z").unwrap().into(), tai_offset: 11 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1973-01-01T00:00:00Z").unwrap().into(), tai_offset: 12 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1974-01-01T00:00:00Z").unwrap().into(), tai_offset: 13 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1975-01-01T00:00:00Z").unwrap().into(), tai_offset: 14 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1976-01-01T00:00:00Z").unwrap().into(), tai_offset: 15 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1977-01-01T00:00:00Z").unwrap().into(), tai_offset: 16 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1978-01-01T00:00:00Z").unwrap().into(), tai_offset: 17 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1979-01-01T00:00:00Z").unwrap().into(), tai_offset: 18 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1980-01-01T00:00:00Z").unwrap().into(), tai_offset: 19 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1981-07-01T00:00:00Z").unwrap().into(), tai_offset: 20 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1982-07-01T00:00:00Z").unwrap().into(), tai_offset: 21 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1983-07-01T00:00:00Z").unwrap().into(), tai_offset: 22 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1985-07-01T00:00:00Z").unwrap().into(), tai_offset: 23 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1988-01-01T00:00:00Z").unwrap().into(), tai_offset: 24 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1990-01-01T00:00:00Z").unwrap().into(), tai_offset: 25 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1991-01-01T00:00:00Z").unwrap().into(), tai_offset: 26 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1992-07-01T00:00:00Z").unwrap().into(), tai_offset: 27 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1993-07-01T00:00:00Z").unwrap().into(), tai_offset: 28 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1994-07-01T00:00:00Z").unwrap().into(), tai_offset: 29 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1996-01-01T00:00:00Z").unwrap().into(), tai_offset: 30 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1997-07-01T00:00:00Z").unwrap().into(), tai_offset: 31 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("1999-01-01T00:00:00Z").unwrap().into(), tai_offset: 32 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("2006-01-01T00:00:00Z").unwrap().into(), tai_offset: 33 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("2009-01-01T00:00:00Z").unwrap().into(), tai_offset: 34 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("2012-07-01T00:00:00Z").unwrap().into(), tai_offset: 35 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("2015-07-01T00:00:00Z").unwrap().into(), tai_offset: 36 },
            LeapSecondEntry { utc_time: chrono::DateTime::parse_from_rfc3339("2017-01-01T00:00:00Z").unwrap().into(), tai_offset: 37 },
        ]
    }

    pub async fn update_leap_indicator(&self) {
        let now = Utc::now();
        let table = self.leap_second_table.read().unwrap();
        
        let mut next_leap = None;
        for entry in table.iter() {
            if entry.utc_time > now {
                next_leap = Some(entry.clone());
                break;
            }
        }
        
        let leap_ind = if let Some(ref leap) = next_leap {
            let time_until_leap = leap.utc_time - now;
            if time_until_leap.num_hours() <= 24 {
                let is_positive = self.get_current_tai_offset().map_or(true, |current| {
                    leap.tai_offset > current
                });
                
                if is_positive {
                    LeapIndicator::LastMinute61
                } else {
                    LeapIndicator::LastMinute59
                }
            } else {
                LeapIndicator::NoWarning
            }
        } else {
            LeapIndicator::NoWarning
        };
        
        self.current_leap.store(leap_ind as u8, Ordering::Release);
        
        let mut next_lock = self.next_leap_utc.write().unwrap();
        *next_lock = next_leap.map(|e| e.utc_time);
    }

    pub fn get_leap_indicator(&self) -> LeapIndicator {
        LeapIndicator::from(self.current_leap.load(Ordering::Acquire))
    }

    pub fn get_current_tai_offset(&self) -> Option<i32> {
        let now = Utc::now();
        let table = self.leap_second_table.read().unwrap();
        
        let mut offset = None;
        for entry in table.iter() {
            if entry.utc_time <= now {
                offset = Some(entry.tai_offset);
            } else {
                break;
            }
        }
        offset
    }

    pub fn get_next_leap(&self) -> Option<DateTime<Utc>> {
        *self.next_leap_utc.read().unwrap()
    }

    pub fn is_in_leap_second(&self) -> bool {
        let now = Utc::now();
        
        if now.month() != 1 && now.month() != 7 {
            return false;
        }
        
        if now.day() != 1 {
            return false;
        }
        
        if now.hour() != 23 || now.minute() != 59 {
            return false;
        }
        
        now.second() >= 59
    }

    pub fn smudge_time(&self, base_time: SystemTime) -> SystemTime {
        if !self.is_in_leap_second() {
            return base_time;
        }
        
        let now = Utc::now();
        let secs = now.second();
        let nanos = now.nanosecond();
        
        if secs >= 59 {
            let smudge_nanos = (secs - 59) * 1_000_000_000 + nanos;
            let smudge_ratio = smudge_nanos as f64 / 2_000_000_000.0;
            
            let smudge_duration = Duration::from_nanos((smudge_ratio * 1_000_000.0) as u64);
            base_time.checked_sub(smudge_duration).unwrap_or(base_time)
        } else {
            base_time
        }
    }

    pub fn add_leap_second_entry(&self, utc_time: DateTime<Utc>, tai_offset: i32) {
        let mut table = self.leap_second_table.write().unwrap();
        table.push(LeapSecondEntry { utc_time, tai_offset });
        table.sort_by_key(|e| e.utc_time);
    }
}

impl Default for LeapSecondManager {
    fn default() -> Self {
        Self::new()
    }
}
