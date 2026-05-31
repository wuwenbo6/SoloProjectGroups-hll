use std::io;
use std::net::SocketAddr;
use std::time::{SystemTime, Duration};

#[cfg(target_os = "linux")]
use libc::{
    c_void, msghdr, sockaddr, socklen_t, CMSG_DATA, CMSG_FIRSTHDR, CMSG_NXTHDR,
    SOL_SOCKET, SO_TIMESTAMPING,
};

#[cfg(target_os = "linux")]
use libc::{
    SOF_TIMESTAMPING_RX_HARDWARE, SOF_TIMESTAMPING_RX_SOFTWARE,
    SOF_TIMESTAMPING_TX_HARDWARE, SOF_TIMESTAMPING_TX_SOFTWARE,
    SOF_TIMESTAMPING_SYS_HARDWARE, SOF_TIMESTAMPING_RAW_HARDWARE,
};

#[derive(Debug, Clone, Copy)]
pub struct Timestamps {
    pub software: Option<SystemTime>,
    pub hardware: Option<SystemTime>,
    pub hardware_raw: Option<SystemTime>,
}

impl Timestamps {
    pub fn new() -> Self {
        Timestamps {
            software: None,
            hardware: None,
            hardware_raw: None,
        }
    }

    pub fn best(&self) -> SystemTime {
        self.hardware
            .or(self.hardware_raw)
            .or(self.software)
            .unwrap_or_else(SystemTime::now)
    }
}

impl Default for Timestamps {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "linux")]
pub struct TimestampingSocket {
    fd: std::os::unix::io::RawFd,
    hardware_enabled: bool,
}

#[cfg(target_os = "linux")]
impl TimestampingSocket {
    pub fn new(fd: std::os::unix::io::RawFd) -> io::Result<Self> {
        Ok(TimestampingSocket {
            fd,
            hardware_enabled: false,
        })
    }

    pub fn enable_timestamping(&mut self, hardware: bool) -> io::Result<()> {
        let mut flags = SOF_TIMESTAMPING_RX_SOFTWARE
            | SOF_TIMESTAMPING_TX_SOFTWARE
            | SOF_TIMESTAMPING_SYS_HARDWARE;

        if hardware {
            flags |= SOF_TIMESTAMPING_RX_HARDWARE
                | SOF_TIMESTAMPING_TX_HARDWARE
                | SOF_TIMESTAMPING_RAW_HARDWARE;
        }

        unsafe {
            let result = libc::setsockopt(
                self.fd,
                SOL_SOCKET,
                SO_TIMESTAMPING,
                &flags as *const _ as *const libc::c_void,
                std::mem::size_of_val(&flags) as socklen_t,
            );

            if result == -1 {
                return Err(io::Error::last_os_error());
            }
        }

        self.hardware_enabled = hardware;
        Ok(())
    }

    pub fn recv_with_timestamp(
        &self,
        buf: &mut [u8],
    ) -> io::Result<(usize, SocketAddr, Timestamps)> {
        let mut control_buf = [0u8; 256];
        let mut src_addr: std::mem::MaybeUninit<sockaddr> = std::mem::MaybeUninit::uninit();
        let mut addr_len = std::mem::size_of::<sockaddr>() as socklen_t;

        let mut msg_hdr: msghdr = unsafe { std::mem::zeroed() };
        msg_hdr.msg_name = src_addr.as_mut_ptr() as *mut c_void;
        msg_hdr.msg_namelen = addr_len;
        msg_hdr.msg_iov = &mut libc::iovec {
            iov_base: buf.as_mut_ptr() as *mut c_void,
            iov_len: buf.len(),
        } as *mut _;
        msg_hdr.msg_iovlen = 1;
        msg_hdr.msg_control = control_buf.as_mut_ptr() as *mut c_void;
        msg_hdr.msg_controllen = control_buf.len() as socklen_t;

        let bytes_received = unsafe { libc::recvmsg(self.fd, &mut msg_hdr, 0) };
        if bytes_received == -1 {
            return Err(io::Error::last_os_error());
        }

        let addr = unsafe {
            let sa = src_addr.assume_init();
            sockaddr_to_socket_addr(&sa, addr_len)?
        };

        let timestamps = self.parse_control_messages(&control_buf, &msg_hdr)?;

        Ok((bytes_received as usize, addr, timestamps))
    }

    fn parse_control_messages(
        &self,
        _control_buf: &[u8],
        msg_hdr: &msghdr,
    ) -> io::Result<Timestamps> {
        let mut timestamps = Timestamps::new();

        unsafe {
            let mut cmsg = CMSG_FIRSTHDR(msg_hdr);
            while !cmsg.is_null() {
                let cmsg_ref = &*cmsg;
                if cmsg_ref.cmsg_level == SOL_SOCKET 
                    && cmsg_ref.cmsg_type == SO_TIMESTAMPING 
                {
                    let data_ptr = CMSG_DATA(cmsg);
                    let timespec_ptr = data_ptr as *const libc::timespec;
                    
                    let software_ts = *timespec_ptr;
                    timestamps.software = Some(timespec_to_system_time(&software_ts));
                    
                    if self.hardware_enabled {
                        let hardware_ts = *(timespec_ptr.add(1));
                        timestamps.hardware = Some(timespec_to_system_time(&hardware_ts));
                        
                        let raw_ts = *(timespec_ptr.add(2));
                        timestamps.hardware_raw = Some(timespec_to_system_time(&raw_ts));
                    }
                }
                cmsg = CMSG_NXTHDR(msg_hdr, cmsg);
            }
        }

        Ok(timestamps)
    }

    pub fn hardware_enabled(&self) -> bool {
        self.hardware_enabled
    }
}

#[cfg(not(target_os = "linux"))]
pub struct TimestampingSocket {
    fd: std::os::unix::io::RawFd,
    hardware_enabled: bool,
}

#[cfg(not(target_os = "linux"))]
impl TimestampingSocket {
    pub fn new(fd: std::os::unix::io::RawFd) -> io::Result<Self> {
        Ok(TimestampingSocket {
            fd,
            hardware_enabled: false,
        })
    }

    pub fn enable_timestamping(&mut self, _hardware: bool) -> io::Result<()> {
        Ok(())
    }

    pub fn recv_with_timestamp(
        &self,
        _buf: &mut [u8],
    ) -> io::Result<(usize, SocketAddr, Timestamps)> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Timestamping only supported on Linux",
        ))
    }

    pub fn hardware_enabled(&self) -> bool {
        false
    }
}

#[cfg(target_os = "linux")]
unsafe fn sockaddr_to_socket_addr(
    sa: *const sockaddr,
    _len: socklen_t,
) -> io::Result<SocketAddr> {
    let family = (*sa).sa_family as i32;
    
    if family == libc::AF_INET {
        let sin = sa as *const libc::sockaddr_in;
        let ip = std::net::Ipv4Addr::from(u32::from_be((*sin).sin_addr.s_addr));
        let port = u16::from_be((*sin).sin_port);
        Ok(SocketAddr::V4(std::net::SocketAddrV4::new(ip, port)))
    } else if family == libc::AF_INET6 {
        let sin6 = sa as *const libc::sockaddr_in6;
        let ip = std::net::Ipv6Addr::from((*sin6).sin6_addr.s6_addr);
        let port = u16::from_be((*sin6).sin6_port);
        Ok(SocketAddr::V6(std::net::SocketAddrV6::new(
            ip,
            port,
            (*sin6).sin6_flowinfo,
            (*sin6).sin6_scope_id,
        )))
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported address family",
        ))
    }
}

#[cfg(target_os = "linux")]
fn timespec_to_system_time(ts: &libc::timespec) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::new(ts.tv_sec as u64, ts.tv_nsec as u32)
}

pub fn system_time_to_duration(t: SystemTime) -> Duration {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
}
