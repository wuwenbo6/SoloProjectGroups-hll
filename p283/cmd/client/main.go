package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"time"

	"nvme-tcp-target/pkg/protocol"
)

type NVMEClient struct {
	conn        net.Conn
	initialized bool
	ccidCounter uint16
}

func NewNVMEClient() *NVMEClient {
	return &NVMEClient{}
}

func (c *NVMEClient) Connect(addr string) error {
	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	c.conn = conn

	if err := c.handshake(); err != nil {
		conn.Close()
		return fmt.Errorf("handshake failed: %w", err)
	}

	log.Println("Successfully connected to NVMe-TCP target")
	return nil
}

func (c *NVMEClient) handshake() error {
	icReq := protocol.NewICReqPDU()
	icReq.PFV = 0x0100
	icReq.CPDA = 0
	icReq.Digest = 0
	icReq.MAXH2CDATA = 131072

	reqData := icReq.Marshal()
	_, err := c.conn.Write(reqData)
	if err != nil {
		return fmt.Errorf("failed to send ICReq: %w", err)
	}

	log.Println("Sent ICReq, waiting for ICResp...")

	respHdr, err := c.readCommonHeader()
	if err != nil {
		return fmt.Errorf("failed to read ICResp header: %w", err)
	}

	if respHdr.PDUType != protocol.NVME_TCP_PDU_TYPE_IC_RESP {
		return fmt.Errorf("unexpected PDU type: 0x%02x, expected ICResp", respHdr.PDUType)
	}

	respData := make([]byte, respHdr.PLen)
	copy(respData[0:8], respHdr.Marshal())
	if respHdr.PLen > 8 {
		_, err := io.ReadFull(c.conn, respData[8:])
		if err != nil {
			return fmt.Errorf("failed to read ICResp data: %w", err)
		}
	}

	icResp := &protocol.ICRespPDU{}
	if err := icResp.Unmarshal(respData); err != nil {
		return fmt.Errorf("failed to parse ICResp: %w", err)
	}

	log.Printf("Received ICResp: PFV=0x%04x, MAXH2CDATA=%d", icResp.PFV, icResp.MAXH2CDATA)
	c.initialized = true

	return nil
}

func (c *NVMEClient) readCommonHeader() (*protocol.CommonPDUHdr, error) {
	hdrData := make([]byte, protocol.NVME_TCP_COMMON_HDR_LEN)
	_, err := io.ReadFull(c.conn, hdrData)
	if err != nil {
		return nil, err
	}

	hdr := &protocol.CommonPDUHdr{}
	if err := hdr.Unmarshal(hdrData); err != nil {
		return nil, err
	}

	return hdr, nil
}

func (c *NVMEClient) SendCommand(cmd *protocol.NVMeCommand, qid uint16) (*protocol.NVMeCQE, []byte, error) {
	if !c.initialized {
		return nil, nil, fmt.Errorf("not initialized")
	}

	c.ccidCounter++
	ccid := c.ccidCounter

	cmdPDU := protocol.NewCmdPDU()
	cmdPDU.CCID = ccid
	cmdPDU.QID = qid
	copy(cmdPDU.Command[:], cmd.Marshal())

	if cmd.Opcode == protocol.NVME_IO_OPC_WRITE {
		_ = 0
	}

	reqData := cmdPDU.Marshal()
	_, err := c.conn.Write(reqData)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to send command: %w", err)
	}

	log.Printf("Sent command: Opcode=0x%02x, QID=%d, CCID=%d", cmd.Opcode, qid, ccid)

	var dataOut []byte
	var cqe *protocol.NVMeCQE

	for {
		hdr, err := c.readCommonHeader()
		if err != nil {
			return nil, nil, fmt.Errorf("failed to read response header: %w", err)
		}

		respData := make([]byte, hdr.PLen)
		copy(respData[0:8], hdr.Marshal())
		if hdr.PLen > 8 {
			_, err := io.ReadFull(c.conn, respData[8:])
			if err != nil {
				return nil, nil, fmt.Errorf("failed to read response data: %w", err)
			}
		}

		switch hdr.PDUType {
		case protocol.NVME_TCP_PDU_TYPE_C2H_DATA:
			dataPDU := &protocol.C2HDataPDU{}
			if err := dataPDU.Unmarshal(respData); err != nil {
				return nil, nil, fmt.Errorf("failed to parse C2H Data: %w", err)
			}
			if dataPDU.CCID == ccid {
				if dataOut == nil {
					dataOut = make([]byte, int(hdr.PLen))
				}
				copy(dataOut[dataPDU.DataOffset:], dataPDU.Data)
				log.Printf("Received C2H Data: CCID=%d, Offset=%d, Len=%d",
					dataPDU.CCID, dataPDU.DataOffset, len(dataPDU.Data))
			}

		case protocol.NVME_TCP_PDU_TYPE_CQE:
			cqePDU := &protocol.CQEPDU{}
			if err := cqePDU.Unmarshal(respData); err != nil {
				return nil, nil, fmt.Errorf("failed to parse CQE: %w", err)
			}
			if cqePDU.CCID == ccid {
				log.Printf("Received CQE: CCID=%d, Status=0x%04x", cqePDU.CCID, cqePDU.Status)

				cqe = protocol.NewNVMeCQE()
				cqe.Status = cqePDU.Status
				copy(cqe.CommandSpecific[:], cqePDU.CQE[:])

				if dataOut == nil && cmd.Opcode == protocol.NVME_FABRIC_OPC_PROPERTY_GET {
					dataLen := 8
					if cmd.CDW11 == 4 {
						dataLen = 4
					}
					dataOut = make([]byte, dataLen)
					copy(dataOut, cqePDU.CQE[:dataLen])
				}

				if dataOut == nil && cmd.Opcode == protocol.NVME_FABRIC_OPC_CONNECT {
					dataOut = make([]byte, 16)
					copy(dataOut, cqePDU.CQE[:])
				}

				return cqe, dataOut, nil
			}
		}
	}
}

func (c *NVMEClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Printf("Usage: %s <target-addr>\n", os.Args[0])
		fmt.Printf("Example: %s 127.0.0.1:4420\n", os.Args[0])
		os.Exit(1)
	}

	targetAddr := os.Args[1]

	client := NewNVMEClient()
	defer client.Close()

	log.Printf("Connecting to NVMe-TCP target at %s...", targetAddr)
	if err := client.Connect(targetAddr); err != nil {
		log.Fatalf("Connection failed: %v", err)
	}

	log.Println("\n=== Testing Admin Commands ===")

	log.Println("\n1. Property Get - CAP")
	capCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_FABRIC_OPC_PROPERTY_GET,
		CDW10:  protocol.NVME_PROP_CAP,
		CDW11:  8,
	}
	_, data, err := client.SendCommand(capCmd, 0)
	if err != nil {
		log.Printf("Property Get failed: %v", err)
	} else {
		cap := binary.LittleEndian.Uint64(data)
		log.Printf("CAP = 0x%016x", cap)
	}

	log.Println("\n2. Property Get - VS")
	vsCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_FABRIC_OPC_PROPERTY_GET,
		CDW10:  protocol.NVME_PROP_VS,
		CDW11:  4,
	}
	_, data, err = client.SendCommand(vsCmd, 0)
	if err != nil {
		log.Printf("Property Get failed: %v", err)
	} else {
		vs := binary.LittleEndian.Uint32(data)
		log.Printf("VS = 0x%08x (NVMe %d.%d)", vs, (vs>>16)&0xFFFF, vs&0xFFFF)
	}

	log.Println("\n3. Property Set - CC (Enable Controller)")
	ccSetCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_FABRIC_OPC_PROPERTY_SET,
		CDW10:  protocol.NVME_PROP_CC,
		CDW11:  4,
		CDW12:  0x1,
	}
	_, _, err = client.SendCommand(ccSetCmd, 0)
	if err != nil {
		log.Printf("Property Set failed: %v", err)
	} else {
		log.Println("Controller enabled successfully")
	}

	log.Println("\n4. Fabric Connect (Admin Queue)")
	connectCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_FABRIC_OPC_CONNECT,
		CDW10:  255,
		CDW11:  0,
	}
	_, data, err = client.SendCommand(connectCmd, 0)
	if err != nil {
		log.Printf("Connect failed: %v", err)
	} else {
		cntrlID := binary.LittleEndian.Uint16(data)
		log.Printf("Connected to Controller ID: %d", cntrlID)
	}

	log.Println("\n5. Identify Controller")
	idCtrlCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_ADMIN_OPC_IDENTIFY,
		CDW10:  protocol.NVME_IDENTIFY_CNS_CONTROLLER,
	}
	_, data, err = client.SendCommand(idCtrlCmd, 0)
	if err != nil {
		log.Printf("Identify Controller failed: %v", err)
	} else {
		model := string(data[24:64])
		serial := string(data[4:24])
		fw := string(data[64:72])
		nn := binary.LittleEndian.Uint32(data[520:524])
		log.Printf("Model: %s", model)
		log.Printf("Serial: %s", serial)
		log.Printf("Firmware: %s", fw)
		log.Printf("Number of Namespaces: %d", nn)
	}

	log.Println("\n6. Identify Namespace List")
	idListCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_ADMIN_OPC_IDENTIFY,
		CDW10:  protocol.NVME_IDENTIFY_CNS_NAMESPACE_LIST,
	}
	_, data, err = client.SendCommand(idListCmd, 0)
	if err != nil {
		log.Printf("Identify Namespace List failed: %v", err)
	} else {
		log.Println("Active Namespaces:")
		for i := 0; i < 1024; i += 4 {
			nsid := binary.LittleEndian.Uint32(data[i : i+4])
			if nsid == 0 {
				break
			}
			log.Printf("  - NSID: %d", nsid)
		}
	}

	log.Println("\n7. Identify Namespace 1")
	idNsCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_ADMIN_OPC_IDENTIFY,
		NSID:   1,
		CDW10:  protocol.NVME_IDENTIFY_CNS_NAMESPACE,
	}
	_, data, err = client.SendCommand(idNsCmd, 0)
	if err != nil {
		log.Printf("Identify Namespace failed: %v", err)
	} else {
		size := binary.LittleEndian.Uint64(data[0:8])
		cap := binary.LittleEndian.Uint64(data[8:16])
		log.Printf("Namespace 1 Size: %d LBAs (%.2f GB)", size, float64(size*512)/1024/1024/1024)
		log.Printf("Namespace 1 Capacity: %d LBAs", cap)
	}

	log.Println("\n=== Testing IO Commands ===")

	log.Println("\n8. Fabric Connect (IO Queue 1)")
	connectIOCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_FABRIC_OPC_CONNECT,
		CDW10:  255,
		CDW11:  1,
	}
	_, data, err = client.SendCommand(connectIOCmd, 0)
	if err != nil {
		log.Printf("Connect IO Queue failed: %v", err)
	} else {
		log.Println("IO Queue 1 created successfully")
	}

	log.Println("\n9. Write to Namespace 1 (LBA 0)")
	writeData := make([]byte, 512)
	for i := range writeData {
		writeData[i] = byte(i % 256)
	}

	writeCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_IO_OPC_WRITE,
		NSID:   1,
		CDW10:  0,
		CDW11:  0,
		CDW12:  0,
	}

	client.ccidCounter++
	writeCCID := client.ccidCounter

	writeCmdPDU := protocol.NewCmdPDU()
	writeCmdPDU.CCID = writeCCID
	writeCmdPDU.QID = 1
	copy(writeCmdPDU.Command[:], writeCmd.Marshal())

	_, err = client.conn.Write(writeCmdPDU.Marshal())
	if err != nil {
		log.Printf("Failed to send write command: %v", err)
	} else {
		log.Println("Write command sent, sending data...")

		dataPDU := protocol.NewH2CDataPDU()
		dataPDU.CCID = writeCCID
		dataPDU.DataOffset = 0
		dataPDU.Data = writeData

		_, err = client.conn.Write(dataPDU.Marshal())
		if err != nil {
			log.Printf("Failed to send write data: %v", err)
		} else {
			log.Println("Write data sent, waiting for completion...")

			hdr, err := client.readCommonHeader()
			if err != nil {
				log.Printf("Failed to read write response: %v", err)
			} else {
				respData := make([]byte, hdr.PLen)
				copy(respData[0:8], hdr.Marshal())
				if hdr.PLen > 8 {
					io.ReadFull(client.conn, respData[8:])
				}

				cqePDU := &protocol.CQEPDU{}
				cqePDU.Unmarshal(respData)
				log.Printf("Write completed with status: 0x%04x", cqePDU.Status)
			}
		}
	}

	log.Println("\n10. Read from Namespace 1 (LBA 0)")
	readCmd := &protocol.NVMeCommand{
		Opcode: protocol.NVME_IO_OPC_READ,
		NSID:   1,
		CDW10:  0,
		CDW11:  0,
		CDW12:  0,
	}
	_, readData, err := client.SendCommand(readCmd, 1)
	if err != nil {
		log.Printf("Read failed: %v", err)
	} else {
		log.Printf("Read %d bytes successfully", len(readData))
		if len(readData) >= 16 {
			log.Printf("First 16 bytes: %x", readData[:16])
		}

		if len(readData) >= 512 {
			match := true
			for i := 0; i < 512; i++ {
				if readData[i] != byte(i%256) {
					match = false
					log.Printf("Data mismatch at offset %d: got 0x%02x, expected 0x%02x",
						i, readData[i], byte(i%256))
					break
				}
			}
			if match {
				log.Println("Data verification passed!")
			}
		} else {
			log.Printf("Read data too short for verification: %d bytes, expected 512", len(readData))
		}
	}

	log.Println("\n=== All tests completed ===")
}
