//go:build linux
// +build linux

package sflow

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

func readKernelUDPStats() (*KernelUDPStats, error) {
	stats := &KernelUDPStats{}

	file, err := os.Open("/proc/net/udp")
	if err != nil {
		return stats, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	firstLine := true
	for scanner.Scan() {
		if firstLine {
			firstLine = false
			continue
		}

		fields := strings.Fields(scanner.Text())
		if len(fields) >= 13 {
			if drops, err := strconv.ParseUint(fields[12], 10, 64); err == nil {
				stats.InErrors += drops
			}
		}
	}

	file6, err := os.Open("/proc/net/snmp")
	if err != nil {
		return stats, nil
	}
	defer file6.Close()

	scanner = bufio.NewScanner(file6)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "Udp:") {
			fields := strings.Fields(line)
			if len(fields) >= 9 {
				stats.InDatagrams, _ = strconv.ParseUint(fields[1], 10, 64)
				stats.NoPorts, _ = strconv.ParseUint(fields[2], 10, 64)
				stats.InErrors, _ = strconv.ParseUint(fields[3], 10, 64)
				stats.OutDatagrams, _ = strconv.ParseUint(fields[4], 10, 64)
				stats.RcvbufErrors, _ = strconv.ParseUint(fields[5], 10, 64)
				stats.SndbufErrors, _ = strconv.ParseUint(fields[6], 10, 64)
				stats.InCsumErrors, _ = strconv.ParseUint(fields[7], 10, 64)
				stats.IgnoredMulti, _ = strconv.ParseUint(fields[8], 10, 64)
			}
			break
		}
	}

	return stats, nil
}
