import asyncio
from backend.iscsi import ConnectionManager, ConnectionState, ISCSIPDU

async def test():
    manager = ConnectionManager()
    
    conn = manager.create_connection('192.168.1.1:3260', cid=1, session_id='session-1')
    print(f'Created connection: {conn.connection_id}, cid={conn.cid}, state={conn.state}')
    assert conn.state == ConnectionState.FREE
    assert 0 <= conn.cid <= 65535
    
    assert manager.update_connection_state(conn.connection_id, ConnectionState.XPT_WAIT)
    assert manager.update_connection_state(conn.connection_id, ConnectionState.IN_LOGIN)
    assert manager.update_connection_state(conn.connection_id, ConnectionState.LOGGED_IN)
    print(f'State transitions passed, current state: {conn.state}')
    
    result = manager.update_connection_state(conn.connection_id, ConnectionState.FREE)
    assert not result
    print('Invalid transition rejected correctly')
    
    pdu = ISCSIPDU(opcode=0x01, data=b'test data')
    sent = await manager.send_pdu(conn.connection_id, pdu)
    assert sent
    print(f'PDU sent successfully, stats: {conn.stats}')
    
    recv_pdu = ISCSIPDU(opcode=0x21, data=b'response')
    await manager.enqueue_received_pdu(conn.connection_id, recv_pdu)
    received = await manager.receive_pdu(conn.connection_id)
    assert received is not None and received.opcode == 0x21
    print(f'PDU received successfully, stats: {conn.stats}')
    
    assert manager.simulate_fault(conn.connection_id)
    assert conn.is_faulty
    sent = await manager.send_pdu(conn.connection_id, pdu)
    assert not sent
    print('Fault simulation works')
    
    assert manager.recover_connection(conn.connection_id)
    assert not conn.is_faulty
    print('Recovery works')
    
    conns = manager.get_connections_by_session('session-1')
    assert len(conns) == 1
    print(f'Connections by session: {len(conns)}')
    
    all_conns = manager.get_all_connections()
    assert len(all_conns) == 1
    print(f'All connections: {len(all_conns)}')
    
    assert manager.remove_connection(conn.connection_id)
    assert manager.get_connection(conn.connection_id) is None
    print('Connection removed successfully')
    
    try:
        manager.create_connection('192.168.1.1:3260', cid=65536)
        assert False
    except ValueError:
        print('CID validation works correctly')
    
    print('\nAll tests passed!')

asyncio.run(test())
