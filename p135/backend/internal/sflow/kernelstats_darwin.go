//go:build darwin
// +build darwin

package sflow

import (
	"os/exec"
	"strconv"
	"strings"
)

func readKernelUDPStats() (*KernelUDPStats, error) {
	stats := &KernelUDPStats{}

	cmd := exec.Command("netstat", "-s", "-p", "udp")
	output, err := cmd.Output()
	if err != nil {
		return stats, err
	}

	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		if strings.Contains(line, "datagrams received") {
			if val, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				stats.InDatagrams = val
			}
		} else if strings.Contains(line, "datagrams output") {
			if val, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				stats.OutDatagrams = val
			}
		} else if strings.Contains(line, "dropped due to") {
			if val, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				stats.InErrors += val
				stats.RcvbufErrors += val
			}
		} else if strings.Contains(line, "bad checksum") {
			if val, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				stats.InCsumErrors = val
			}
		} else if strings.Contains(line, "no socket") {
			if val, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				stats.NoPorts = val
			}
		}
	}

	return stats, nil
}
