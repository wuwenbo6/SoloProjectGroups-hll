from diameter import message, node, avp, constants

print('Modules imported successfully')

attrs = [
    'CMD_CREDIT_CONTROL',
    'AVP_SESSION_ID',
    'AVP_ORIGIN_HOST',
    'AVP_RESULT_CODE',
    'AVP_CC_REQUEST_TYPE',
    'AVP_CC_REQUEST_NUMBER',
    'AVP_GRANTED_SERVICE_UNIT',
    'AVP_USED_SERVICE_UNIT',
    'AVP_CC_TOTAL_OCTETS',
    'AVP_CC_INPUT_OCTETS',
    'AVP_CC_OUTPUT_OCTETS',
    'AVP_SUBSCRIPTION_ID',
    'AVP_SUBSCRIPTION_ID_TYPE',
    'AVP_SUBSCRIPTION_ID_DATA',
    'AVP_VALIDITY_TIME',
    'AVP_REQUESTED_SERVICE_UNIT',
    'AVP_DESTINATION_REALM',
    'AVP_AUTH_APPLICATION_ID'
]

for attr in attrs:
    if hasattr(constants, attr):
        value = getattr(constants, attr)
        print(f'  {attr}: {value}')
    else:
        print(f'  {attr}: NOT FOUND')

print('\nChecking avp.GroupedAVP:', hasattr(avp, 'GroupedAVP'))
print('Checking node.Node:', hasattr(node, 'Node'))
print('Checking message.Message:', hasattr(message, 'Message'))

try:
    msg = message.Message()
    print('Message created successfully')
    msg.header.command_code = 272
    msg.header.application_id = 4
    msg.header.request = True
    
    msg.append(avp.AVP(constants.AVP_SESSION_ID, b'test-session'))
    print('AVP added successfully')
    
    found = msg.find('Session-Id')
    print(f'Found AVP: {found}')
    if found:
        print(f'AVP value: {found[0].val}')
    
except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
