import asyncio
import logging
from rsp_server import RSPServer
from gdb_client import GDBClient
from debug_target import BASE_ADDR, INSTR_ADDR

logger = logging.getLogger(__name__)


async def run_tests():
    server = RSPServer(host="127.0.0.1", port=9999)

    server_task = asyncio.create_task(server.start())
    await asyncio.sleep(0.3)

    client = GDBClient(host="127.0.0.1", port=9999)

    try:
        await client.connect()
        passed = 0
        failed = 0

        def check(name: str, condition: bool, detail: str = ""):
            nonlocal passed, failed
            if condition:
                passed += 1
                print(f"  ✅ PASS: {name}")
            else:
                failed += 1
                print(f"  ❌ FAIL: {name} {detail}")

        print("\n=== Test 1: qSupported ===")
        resp = await client.query_supported()
        check("qSupported response not empty", len(resp) > 0, f"got: {resp}")
        check("qSupported contains PacketSize", "PacketSize" in resp, f"got: {resp}")
        check("qSupported contains qRegisterInfo+", "qRegisterInfo+" in resp, f"got: {resp}")

        print("\n=== Test 2: qRegisterInfo ===")
        resp0 = await client.query_register_info(0)
        check("reg 0 (rax) has name", "name:rax" in resp0, f"got: {resp0}")
        check("reg 0 bitsize=64", "bitsize:64" in resp0, f"got: {resp0}")

        resp16 = await client.query_register_info(16)
        check("reg 16 (rip) has name", "name:rip" in resp16, f"got: {resp16}")

        resp_end = await client.query_register_info(100)
        check("reg 100 returns error", resp_end.startswith("E"), f"got: {resp_end}")

        print("\n=== Test 3: Query stop reason ===")
        resp = await client.query_stop_reason()
        check("Stop reason is T05 with thread", resp == "T05thread:01;", f"got: {resp}")
        check("Stop reason contains thread field", "thread:01" in resp, f"got: {resp}")

        print("\n=== Test 4: Read registers ===")
        regs = await client.read_registers()
        check("rip == BASE_ADDR", regs.get("rip") == BASE_ADDR,
              f"got: 0x{regs.get('rip', 0):X}, expected: 0x{BASE_ADDR:X}")
        check("rsp is non-zero", regs.get("rsp", 0) != 0,
              f"got: 0x{regs.get('rsp', 0):X}")

        print("\n=== Test 5: Single step ===")
        resp = await client.step()
        check("Step returns T05 with thread", resp == "T05thread:01;", f"got: {resp}")
        regs = await client.read_registers()
        expected_rip = INSTR_ADDR[1]
        check("rip advanced after step",
              regs.get("rip") == expected_rip,
              f"got: 0x{regs.get('rip', 0):X}, expected: 0x{expected_rip:X}")
        check("rax == 1 after first step",
              regs.get("rax") == 1,
              f"got: {regs.get('rax', 0)}")

        print("\n=== Test 6: Single step again ===")
        resp = await client.step()
        regs = await client.read_registers()
        check("rbx == 2 after second step",
              regs.get("rbx") == 2,
              f"got: {regs.get('rbx', 0)}")

        print("\n=== Test 7: Step to add instruction ===")
        resp = await client.step()
        regs = await client.read_registers()
        check("rax == 3 after add rax,rbx",
              regs.get("rax") == 3,
              f"got: {regs.get('rax', 0)}")

        print("\n=== Test 8: Read memory ===")
        data = await client.read_memory(BASE_ADDR, 7)
        check("Memory read returns 7 bytes", len(data) == 7, f"got {len(data)} bytes")
        check("First byte is 0x48 (mov rax prefix)",
              data[0] == 0x48,
              f"got: 0x{data[0]:02X}")

        print("\n=== Test 8b: Memory read fills 0xff for uninitialized ===")
        data = await client.read_memory(BASE_ADDR + 0x2000, 8)
        check("Memory read returns strict 8 bytes", len(data) == 8, f"got {len(data)} bytes")
        check("All bytes filled with 0xff",
              all(b == 0xFF for b in data),
              f"got: {data.hex()}")

        print("\n=== Test 9: Breakpoint set and hit ===")
        bp_addr = INSTR_ADDR[4]  # sub rcx, 1
        resp = await client.add_breakpoint(bp_addr)
        check("Add breakpoint returns OK", resp == "OK", f"got: {resp}")

        resp = await client.continue_exec()
        check("Continue returns T05 with thread", resp == "T05thread:01;", f"got: {resp}")
        regs = await client.read_registers()
        check("rip at breakpoint address",
              regs.get("rip") == bp_addr,
              f"got: 0x{regs.get('rip', 0):X}, expected: 0x{bp_addr:X}")

        print("\n=== Test 10: Remove breakpoint and continue ===")
        resp = await client.remove_breakpoint(bp_addr)
        check("Remove breakpoint returns OK", resp == "OK", f"got: {resp}")

        resp = await client.continue_exec()
        check("Continue after bp removal returns T05 with thread", resp == "T05thread:01;", f"got: {resp}")

        print("\n=== Test 11: Write register ===")
        resp = await client.write_register(0, 0xDEADBEEF)
        check("Write register returns OK", resp == "OK", f"got: {resp}")
        val = await client.read_register(0)
        check("Read back register value",
              val == 0xDEADBEEF,
              f"got: 0x{val:X}")

        print("\n=== Test 12: Write memory ===")
        test_data = b"\xAA\xBB\xCC\xDD"
        resp = await client.write_memory(BASE_ADDR + 0x1000, test_data)
        check("Write memory returns OK", resp == "OK", f"got: {resp}")
        read_back = await client.read_memory(BASE_ADDR + 0x1000, 4)
        check("Read back written memory",
              read_back == test_data,
              f"got: {read_back.hex()}")

        print("\n=== Test 13: vFile create, write, read ===")
        test_content = b"Hello from vFile!"
        fd = await client.vfile_open("/test.txt", flags=0o102)  # O_CREAT | O_RDWR
        check("vFile open returns valid fd", fd >= 3, f"got fd={fd}")

        nwritten = await client.vfile_pwrite(fd, 0, test_content)
        check("vFile write returns correct length",
              nwritten == len(test_content),
              f"wrote {nwritten}, expected {len(test_content)}")

        data = await client.vfile_pread(fd, len(test_content), 0)
        check("vFile read returns correct content",
              data == test_content,
              f"got: {data}, expected: {test_content}")

        ret = await client.vfile_close(fd)
        check("vFile close returns 0", ret == 0, f"got: {ret}")

        print("\n=== Test 14: vFile stat and fstat ===")
        st = await client.vfile_stat("/test.txt")
        check("vFile stat returns size",
              st.get("st_size") == len(test_content),
              f"got size={st.get('st_size')}, expected {len(test_content)}")
        check("vFile stat mode is regular file",
              (st.get("st_mode", 0) & 0o170000) == 0o100000,
              f"got mode=0o{st.get('st_mode', 0):o}")

        fd2 = await client.vfile_open("/test.txt", flags=0)  # O_RDONLY
        fst = await client.vfile_fstat(fd2)
        check("vFile fstat matches stat",
              fst.get("st_size") == st.get("st_size"),
              f"fstat size={fst.get('st_size')}, stat size={st.get('st_size')}")
        await client.vfile_close(fd2)

        print("\n=== Test 15: vFile unlink ===")
        ret = await client.vfile_unlink("/test.txt")
        check("vFile unlink returns 0", ret == 0, f"got: {ret}")

        try:
            await client.vfile_stat("/test.txt")
            check("vFile stat after unlink raises error", False, "should have raised")
        except IOError:
            check("vFile stat after unlink raises IOError", True)

        print("\n=== Test 16: Export debug log ===")
        log_content = await client.export_debug_log()
        check("Debug log is not empty", len(log_content) > 0, f"got {len(log_content)} bytes")
        check("Debug log contains header", "GDB RSP Debug Export" in log_content)
        check("Debug log contains register snapshot", "Registers snapshot" in log_content)
        check("Debug log contains step entries", "Step:" in log_content)
        check("Debug log contains vFile entries", "vFile:" in log_content)

        import tempfile, os
        with tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False) as tf:
            log_path = tf.name
        try:
            await client.save_debug_log(log_path)
            with open(log_path, "r", encoding="utf-8") as f:
                saved = f.read()
            check("Saved log matches exported", saved == log_content, "content mismatch")
        finally:
            os.unlink(log_path)

        print("\n=== Test 17: qSupported includes vFile features ===")
        resp = await client.query_supported()
        check("qSupported contains vFile:open+", "vFile:open+" in resp)
        check("qSupported contains vFile:pread+", "vFile:pread+" in resp)
        check("qSupported contains vFile:pwrite+", "vFile:pwrite+" in resp)
        check("qSupported contains vFile:stat+", "vFile:stat+" in resp)
        check("qSupported contains vFile:unlink+", "vFile:unlink+" in resp)

        print(f"\n{'='*50}")
        print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
        print(f"{'='*50}")

    except Exception as e:
        print(f"Test error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass


def main():
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    asyncio.run(run_tests())


if __name__ == "__main__":
    main()
