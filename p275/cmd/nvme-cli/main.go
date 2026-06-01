package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/url"
	"nvme-simulator/pkg/nvme"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var (
	serverAddr = flag.String("server", "localhost:8080", "NVMe simulator server address")
	command    = flag.String("command", "", "Command: identify, create-sq, delete-sq, create-cq, delete-cq, read, write, smart")
	qid        = flag.Uint("qid", 0, "Queue ID")
	qsize      = flag.Uint("qsize", 63, "Queue size")
	cqid       = flag.Uint("cqid", 0, "Completion Queue ID (for create-sq)")
	nsid       = flag.Uint("nsid", 1, "Namespace ID")
	slba       = flag.Uint64("slba", 0, "Starting LBA (for read/write)")
	nlb        = flag.Uint("nlb", 1, "Number of logical blocks (for read/write)")
	data       = flag.String("data", "", "Data byte to write (hex, e.g. 'AA')")
	verbose    = flag.Bool("verbose", false, "Verbose output")
)

func main() {
	flag.Parse()

	if *command == "" {
		fmt.Println("Error: command is required")
		printUsage()
		os.Exit(1)
	}

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	u := url.URL{Scheme: "ws", Host: *serverAddr, Path: "/ws"}
	log.Printf("Connecting to %s", u.String())

	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer c.Close()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				log.Printf("Read error: %v", err)
				return
			}

			var wsResp nvme.WebSocketResponse
			if err := json.Unmarshal(message, &wsResp); err != nil {
				log.Printf("Failed to parse response: %v", err)
				continue
			}

			if wsResp.Error != "" {
				fmt.Printf("Error: %s\n", wsResp.Error)
				os.Exit(1)
			}

			printResponse(&wsResp)
			os.Exit(0)
		}
	}()

	cmd, err := buildCommand()
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	wsCmd := nvme.WebSocketCommand{
		Type:    "admin",
		Command: *cmd,
	}

	if *verbose {
		fmt.Printf("Sending command: %s\n", cmd.String())
	}

	message, err := json.Marshal(wsCmd)
	if err != nil {
		log.Fatalf("Failed to marshal command: %v", err)
	}

	err = c.WriteMessage(websocket.TextMessage, message)
	if err != nil {
		log.Fatalf("Write error: %v", err)
	}

	for {
		select {
		case <-done:
			return
		case <-interrupt:
			log.Println("Interrupt received")
			err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			if err != nil {
				log.Printf("Close error: %v", err)
				return
			}
			select {
			case <-done:
			case <-time.After(time.Second):
			}
			return
		}
	}
}

func buildCommand() (*nvme.Command, error) {
	cmd := &nvme.Command{}
	cmd.NSID = uint32(*nsid)

	switch *command {
	case "identify":
		cmd.Opcode = nvme.AdminOpcodeIdentify
		cmd.CDW10 = nvme.IdentifyCNSController
	case "create-sq":
		if *qid == 0 {
			return nil, fmt.Errorf("qid is required for create-sq")
		}
		if *cqid == 0 {
			return nil, fmt.Errorf("cqid is required for create-sq")
		}
		cmd.Opcode = nvme.AdminOpcodeCreateIOSQ
		cmd.CDW10 = uint32(*qid) | (uint32(*qsize) << 16)
		cmd.CDW11 = 0x1 | (uint32(*cqid) << 16)
	case "delete-sq":
		if *qid == 0 {
			return nil, fmt.Errorf("qid is required for delete-sq")
		}
		cmd.Opcode = nvme.AdminOpcodeDeleteIOSQ
		cmd.CDW10 = uint32(*qid)
	case "create-cq":
		if *qid == 0 {
			return nil, fmt.Errorf("qid is required for create-cq")
		}
		cmd.Opcode = nvme.AdminOpcodeCreateIOCQ
		cmd.CDW10 = uint32(*qid) | (uint32(*qsize) << 16)
		cmd.CDW11 = 0x1
	case "delete-cq":
		if *qid == 0 {
			return nil, fmt.Errorf("qid is required for delete-cq")
		}
		cmd.Opcode = nvme.AdminOpcodeDeleteIOCQ
		cmd.CDW10 = uint32(*qid)
	case "smart":
		cmd.Opcode = nvme.AdminOpcodeGetLogPage
		cmd.NSID = 0xFFFFFFFF
		cmd.CDW10 = uint32(nvme.LogPageSMART) | (127 << 16)
	case "read":
		cmd.Opcode = nvme.NVMOpcodeRead
		cmd.CDW10 = uint32(*slba & 0xFFFFFFFF)
		cmd.CDW11 = uint32((*slba >> 32) & 0xFFFFFFFF)
		cmd.CDW12 = uint32(*nlb - 1)
	case "write":
		cmd.Opcode = nvme.NVMOpcodeWrite
		cmd.CDW10 = uint32(*slba & 0xFFFFFFFF)
		cmd.CDW11 = uint32((*slba >> 32) & 0xFFFFFFFF)
		cmd.CDW12 = uint32(*nlb - 1)
		if *data != "" {
			if b, err := hex.DecodeString(*data); err == nil && len(b) > 0 {
				cmd.PRP1 = uint64(b[0])
			}
		}
		if cmd.PRP1 == 0 {
			cmd.PRP1 = 0xAB
		}
	case "list":
		fmt.Println("Listing queues...")
		return nil, fmt.Errorf("list command not implemented yet")
	default:
		return nil, fmt.Errorf("unknown command: %s", *command)
	}

	return cmd, nil
}

func printResponse(resp *nvme.WebSocketResponse) {
	fmt.Printf("Response:\n")
	fmt.Printf("  CID:     %d\n", resp.Response.CID)
	fmt.Printf("  Status:  0x%04x\n", resp.Response.Status)

	if resp.Response.Status == nvme.StatusSuccess {
		fmt.Println("  Status:  Success")
	} else {
		fmt.Printf("  Status:  Error (0x%04x)\n", resp.Response.Status)
	}

	if len(resp.Response.Data) > 0 {
		fmt.Printf("  Data:    %d bytes\n", len(resp.Response.Data))
		if *verbose {
			dumpLen := 64
			if len(resp.Response.Data) < dumpLen {
				dumpLen = len(resp.Response.Data)
			}
			fmt.Println(hex.Dump(resp.Response.Data[:dumpLen]))
		}

		if resp.Response.Data != nil && len(resp.Response.Data) >= 4096 {
			printIdentifyData(resp.Response.Data)
		} else if len(resp.Response.Data) >= 192 && *command == "smart" {
			printSMARTData(resp.Response.Data)
		} else if (*command == "read" || *command == "write") && len(resp.Response.Data) > 0 {
			dumpLen := 64
			if len(resp.Response.Data) < dumpLen {
				dumpLen = len(resp.Response.Data)
			}
			fmt.Printf("\nData:\n%s", hex.Dump(resp.Response.Data[:dumpLen]))
		}
	}
}

func printIdentifyData(data []byte) {
	fmt.Println("\nController Identify Data:")
	fmt.Printf("  VID:     0x%04x\n", uint16(data[0])|uint16(data[1])<<8)
	fmt.Printf("  SSVID:   0x%04x\n", uint16(data[2])|uint16(data[3])<<8)
	fmt.Printf("  SN:      %s\n", strings.TrimRight(string(data[4:24]), " "))
	fmt.Printf("  MN:      %s\n", strings.TrimRight(string(data[24:64]), " "))
	fmt.Printf("  FR:      %s\n", strings.Trim(string(data[64:72]), "\x00 "))
	fmt.Printf("  MDTS:    %d (2^%d pages)\n", data[77], data[77])
	fmt.Printf("  CNTLID:  0x%04x\n", uint16(data[78])|uint16(data[79])<<8)
	fmt.Printf("  VER:     0x%08x\n", uint32(data[80])|uint32(data[81])<<8|uint32(data[82])<<16|uint32(data[83])<<24)
}

func printSMARTData(data []byte) {
	fmt.Println("\nSMART / Health Information:")
	fmt.Printf("  Critical Warning:         0x%02x\n", data[0])
	temperature := uint16(data[1])|uint16(data[2])<<8
	fmt.Printf("  Temperature:              %d K (%.1f °C)\n", temperature, float64(temperature)-273.15)
	fmt.Printf("  Available Spare:          %d%%\n", data[3])
	fmt.Printf("  Available Spare Thresh:   %d%%\n", data[4])
	fmt.Printf("  Percentage Used:          %d%%\n", data[5])
	fmt.Printf("  Data Units Read:          %d\n", getInt128(data[32:48]))
	fmt.Printf("  Data Units Written:       %d\n", getInt128(data[48:64]))
	fmt.Printf("  Host Read Commands:       %d\n", getInt128(data[64:80]))
	fmt.Printf("  Host Write Commands:      %d\n", getInt128(data[80:96]))
	fmt.Printf("  Controller Busy Time:     %d min\n", getInt128(data[96:112]))
	fmt.Printf("  Power Cycles:             %d\n", getInt128(data[112:128]))
	fmt.Printf("  Power On Hours:           %d h\n", getInt128(data[128:144]))
	fmt.Printf("  Unsafe Shutdowns:         %d\n", getInt128(data[144:160]))
	fmt.Printf("  Media Errors:             %d\n", getInt128(data[160:176]))
	fmt.Printf("  Num Error Log Entries:    %d\n", getInt128(data[176:192]))
}

func getInt128(buf []byte) uint64 {
	var val uint64
	for i := 0; i < 8; i++ {
		val |= uint64(buf[i]) << (i * 8)
	}
	return val
}

func printUsage() {
	fmt.Println("\nNVMe CLI Simulator")
	fmt.Println("\nUsage:")
	fmt.Println("  nvme-cli -command <command> [options]")
	fmt.Println("\nCommands:")
	fmt.Println("  identify    - Identify controller")
	fmt.Println("  create-cq   - Create IO Completion Queue (requires -qid, -qsize)")
	fmt.Println("  create-sq   - Create IO Submission Queue (requires -qid, -qsize, -cqid)")
	fmt.Println("  delete-cq   - Delete IO Completion Queue (requires -qid)")
	fmt.Println("  delete-sq   - Delete IO Submission Queue (requires -qid)")
	fmt.Println("  smart       - Get SMART/Health Information")
	fmt.Println("  read        - Read NVM blocks (requires -nsid, -slba, -nlb)")
	fmt.Println("  write       - Write NVM blocks (requires -nsid, -slba, -nlb, -data)")
	fmt.Println("\nOptions:")
	flag.PrintDefaults()
	fmt.Println("\nExamples:")
	fmt.Println("  nvme-cli -command identify")
	fmt.Println("  nvme-cli -command smart")
	fmt.Println("  nvme-cli -command create-cq -qid 1 -qsize 63")
	fmt.Println("  nvme-cli -command create-sq -qid 1 -qsize 63 -cqid 1")
	fmt.Println("  nvme-cli -command read -nsid 1 -slba 0 -nlb 4")
	fmt.Println("  nvme-cli -command write -nsid 1 -slba 0 -nlb 4 -data AB")
	fmt.Println("  nvme-cli -command delete-sq -qid 1")
	fmt.Println("  nvme-cli -command delete-cq -qid 1")
}
