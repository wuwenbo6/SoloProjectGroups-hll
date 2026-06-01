export const sampleKconfig = `# Sample Kconfig for demonstration

config 64BIT
        bool "64-bit kernel"
        default y
        help
          Say yes to build a 64-bit kernel.

menu "General setup"

        config PRINTK
                bool "Enable support for printk"
                default y
                help
                  This enables support for printk functionality.

        config LOG_BUF_SHIFT
                int "Kernel log buffer size (16 => 64KB, 17 => 128KB)"
                range 12 25
                default 17
                depends on PRINTK
                help
                  Select kernel log buffer size as a power of 2.

        config BUG
                bool "BUG() support"
                default y
                help
                  Choose this option to have BUG() support.

        config ELF_CORE
                bool "Enable ELF core dumps"
                default y
                help
          Enable support for generating ELF format core dumps.

        menu "Executable file formats"

                config BINFMT_ELF
                        bool "Kernel support for ELF binaries"
                        default y
                        help
                          ELF (Executable and Linkable Format) is a format for
                          libraries and executables.

                config BINFMT_SCRIPT
                        bool "Kernel support for scripts starting with #!"
                        default y
                        help
                          Enable support for running scripts that start with
                          the "#!" sequence.

        endmenu

        menu "Processor type and features"

                choice
                        prompt "Processor family"
                        default GENERIC_CPU

                        config M686
                                bool "Pentium-Pro"

                        config MPENTIUM4
                                bool "Pentium-4/Celeron(P4-based)/Pentium-4 M/Xeon"

                        config GENERIC_CPU
                                bool "Generic x86 support"
                endchoice

                config SMP
                        bool "Symmetric multi-processing support"
                        default y
                        help
                          Enable support for systems with multiple CPUs.

                config NUMA
                        bool "NUMA Memory Allocation and Scheduler Support"
                        depends on SMP
                        help
                          Enable NUMA (Non-Uniform Memory Access) support.

                config PREEMPT
                        bool "Preemptible Kernel (Low-Latency Desktop)"
                        help
                          This option reduces the latency of the kernel.

        endmenu

endmenu

menu "Device Drivers"

        config PCI
                bool "PCI support"
                default y
                help
                  PCI support.

        config PCI_MSI
                bool "Message Signaled Interrupts (MSI and MSI-X)"
                depends on PCI
                help
                  This allows device drivers to enable MSI (Message Signaled
                  Interrupts).

        menu "Block devices"

                config BLK_DEV_SD
                        tristate "SCSI disk support"
                        default y
                        help
                          If you want to use SCSI hard disks, say Y or M here.

                config BLK_DEV_SR
                        tristate "SCSI CDROM support"
                        depends on BLK_DEV_SD
                        help
                          If you want to use SCSI CD-ROMs, say Y or M here.

        endmenu

        menu "Network device support"

                config NETDEVICES
                        bool "Network device support"
                        default y
                        help
                          You can say N here if you don't intend to connect your
                          Linux box to any sort of network.

                config ETHERNET
                        bool "Ethernet driver support"
                        depends on NETDEVICES
                        default y
                        help
                          Support for Ethernet hardware.

                config WLAN
                        bool "Wireless LAN"
                        depends on NETDEVICES
                        help
                          Enable support for wireless LAN adapters.

        endmenu

        menu "USB support"

                config USB
                        bool "Support for USB"
                        default y
                        help
                          Universal Serial Bus (USB) support.

                config USB_SUPPORT
                        bool
                        default y
                        depends on USB

                config USB_OHCI_HCD
                        tristate "OHCI HCD support"
                        depends on USB_SUPPORT
                        help
                          The OHCI (Open Host Controller Interface) standard.

                config USB_EHCI_HCD
                        tristate "EHCI HCD (USB 2.0) support"
                        depends on USB_SUPPORT
                        help
                          Enhanced Host Controller Interface (EHCI) for USB 2.0.

                config USB_XHCI_HCD
                        tristate "xHCI HCD (USB 3.0) support"
                        depends on USB_SUPPORT
                        help
                          Extensible Host Controller Interface (xHCI) for USB 3.0.

        endmenu

endmenu

menu "File systems"

        config FILE_LOCKING
                bool "File locking"
                default y
                help
                  Allow files to be locked.

        menu "Native language support"

                config NLS
                        tristate "Native Language Support"
                        help
                          Native Language Support.

        endmenu

        menu "DOS/FAT/NT Filesystems"

                config MSDOS_FS
                        tristate "MSDOS fs support"
                        help
                          This allows you to mount MSDOS partitions.

                config VFAT_FS
                        tristate "VFAT (Windows-95) fs support"
                        select NLS
                        help
                          This option provides support for normal Windows file
                          systems.

                config NTFS_FS
                        tristate "NTFS file system support"
                        help
                          NTFS is the file system of Microsoft Windows.

        endmenu

        menu "Network File Systems"

                config NFS_FS
                        tristate "NFS client support"
                        help
                  NFS is the protocol used for accessing files on remote
                  machines.

                config CIFS
                        tristate "CIFS support"
                        help
                          This is the client VFS module for the Common Internet
                          File System (CIFS) protocol.

        endmenu

endmenu

menu "Kernel hacking"

        config DEBUG_KERNEL
                bool "Kernel debugging"
                help
                  Say Y here if you are developing drivers or trying to
                  debug and test the kernel.

        config PRINTK_TIME
                bool "Show timing information on printks"
                depends on PRINTK
                help
                  Selecting this option causes time stamps of the printk
                  messages to be added to the output of the syslog() system call.

endmenu
`;
