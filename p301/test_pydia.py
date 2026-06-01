from pyDiameter.pyDiaMessage import DiaMessage
from pyDiameter.pyDiaAVPFactory import DiaAVPFactory
from pyDiameter.pyDiaAVPBasicTypes import *
from pyDiameter.pyDiaAVPPath import DiaAVPPath
from pyDiameter.pyDiaAVPDict import DiaAVPDict

dict = DiaAVPDict()
print("Checking AVP dictionary...")

codes_to_check = [
    263, 264, 296, 268, 416, 415, 431, 446, 421, 412, 414,
    443, 450, 444, 448, 437, 283, 258
]

for code in codes_to_check:
    try:
        name = dict.getAVPDefName(0, code)
        type = dict.getAVPDefType(0, code)
        print(f'Code {code}: name={name}, type={type}')
    except Exception as e:
        print(f'Code {code}: ERROR - {e}')

print("\n--- Creating a simple message ---")

msg = DiaMessage()
msg.setCommandCode(272)
msg.setApplicationID(4)
msg.setRequestFlag()
msg.setProxyableFlag()
msg.generateHBHID()
msg.generateE2EID()

try:
    session_avp = DiaAVPStr()
    session_avp.setAVPCode(263)
    session_avp.setAVPMandatoryFlag()
    session_avp.setAVPValue(b'test-session-123')
    
    path = DiaAVPPath()
    path.setPath('')
    msg.addAVPByPath(path, session_avp)
    print("Session-Id AVP added successfully")
    
    encoded = msg.encode()
    print(f"Message encoded, length: {len(encoded)} bytes")
    
    msg2 = DiaMessage()
    msg2.decode(encoded)
    print(f"Decoded message code: {msg2.getCommandCode()}")
    print(f"Decoded message app ID: {msg2.getApplicationID()}")
    
    avps = msg2.getAVPs()
    print(f"Number of AVPs: {len(avps)}")
    for avp in avps:
        print(f"  AVP code={avp.getAVPCode()}, name={avp.getAVPName()}, value={avp.getAVPValue()}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
