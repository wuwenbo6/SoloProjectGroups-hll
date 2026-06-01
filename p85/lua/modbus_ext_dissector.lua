local modbus_ext_proto = Proto("modbus_ext", "Modbus Extension Protocol")

local function_names = {
    [0x01] = "Read Coils",
    [0x02] = "Read Discrete Inputs",
    [0x03] = "Read Holding Registers",
    [0x04] = "Read Input Registers",
    [0x05] = "Write Single Coil",
    [0x06] = "Write Single Register",
    [0x0F] = "Write Multiple Coils",
    [0x10] = "Write Multiple Registers",
    [0x41] = "Custom Read Sensor Data",
    [0x42] = "Custom Write Configuration",
    [0x43] = "Custom Firmware Update",
    [0x44] = "Custom Device Status Query",
    [0x45] = "Custom Alarm Acknowledge"
}

local exception_codes = {
    [0x01] = "Illegal Function",
    [0x02] = "Illegal Data Address",
    [0x03] = "Illegal Data Value",
    [0x04] = "Slave Device Failure",
    [0x05] = "Acknowledge",
    [0x06] = "Slave Device Busy",
    [0x08] = "Memory Parity Error"
}

local f = modbus_ext_proto.fields
f.transaction_id = ProtoField.uint16("modbus_ext.transaction_id", "Transaction Identifier", base.HEX)
f.protocol_id = ProtoField.uint16("modbus_ext.protocol_id", "Protocol Identifier", base.HEX)
f.length = ProtoField.uint16("modbus_ext.length", "Length", base.DEC)
f.unit_id = ProtoField.uint8("modbus_ext.unit_id", "Unit Identifier", base.DEC)
f.function_code = ProtoField.uint8("modbus_ext.function_code", "Function Code", base.HEX, function_names)
f.exception_code = ProtoField.uint8("modbus_ext.exception_code", "Exception Code", base.HEX, exception_codes)
f.start_address = ProtoField.uint16("modbus_ext.start_address", "Starting Address", base.HEX)
f.quantity = ProtoField.uint16("modbus_ext.quantity", "Quantity", base.DEC)
f.byte_count = ProtoField.uint8("modbus_ext.byte_count", "Byte Count", base.DEC)
f.register_value = ProtoField.uint16("modbus_ext.register_value", "Register Value", base.HEX)
f.coil_status = ProtoField.uint8("modbus_ext.coil_status", "Coil Status", base.HEX)

f.sensor_id = ProtoField.uint16("modbus_ext.sensor_id", "Sensor ID", base.HEX)
f.sensor_type = ProtoField.uint8("modbus_ext.sensor_type", "Sensor Type", base.DEC)
f.sensor_value = ProtoField.float("modbus_ext.sensor_value", "Sensor Value")
f.timestamp = ProtoField.uint32("modbus_ext.timestamp", "Timestamp", base.DEC)
f.config_key = ProtoField.uint16("modbus_ext.config_key", "Config Key", base.HEX)
f.config_value = ProtoField.uint32("modbus_ext.config_value", "Config Value", base.HEX)
f.firmware_version = ProtoField.string("modbus_ext.firmware_version", "Firmware Version")
f.device_status = ProtoField.uint8("modbus_ext.device_status", "Device Status", base.HEX)
f.alarm_id = ProtoField.uint16("modbus_ext.alarm_id", "Alarm ID", base.HEX)

f.payload = ProtoField.bytes("modbus_ext.payload", "Payload")

function modbus_ext_proto.dissector(tvbuf, pinfo, tree)
    if tvbuf:len() < 7 then return end

    pinfo.cols.protocol = "Modbus_EXT"
    local subtree = tree:add(modbus_ext_proto, tvbuf(), "Modbus Extension Protocol")

    local offset = 0

    local tid = tvbuf(offset, 2)
    subtree:add(f.transaction_id, tid)
    offset = offset + 2

    local pid = tvbuf(offset, 2)
    subtree:add(f.protocol_id, pid)
    offset = offset + 2

    local len = tvbuf(offset, 2)
    subtree:add(f.length, len)
    offset = offset + 2

    local uid = tvbuf(offset, 1)
    subtree:add(f.unit_id, uid)
    offset = offset + 1

    local fc = tvbuf(offset, 1)
    local fc_value = fc:uint()
    subtree:add(f.function_code, fc)
    offset = offset + 1

    local is_exception = bit.band(fc_value, 0x80) ~= 0

    if is_exception then
        local ec = tvbuf(offset, 1)
        subtree:add(f.exception_code, ec)
        pinfo.cols.info = string.format("Exception: %s", exception_codes[ec:uint()] or "Unknown")
        return
    end

    local info_text = function_names[fc_value] or string.format("Function 0x%02X", fc_value)
    pinfo.cols.info = info_text

    if fc_value == 0x01 or fc_value == 0x02 then
        if offset + 1 <= tvbuf:len() then
            local bc = tvbuf(offset, 1)
            subtree:add(f.byte_count, bc)
            offset = offset + 1
            if offset + bc:uint() <= tvbuf:len() then
                subtree:add(f.coil_status, tvbuf(offset, bc:uint()))
            end
        end
    elseif fc_value == 0x03 or fc_value == 0x04 then
        if offset + 1 <= tvbuf:len() then
            local bc = tvbuf(offset, 1)
            subtree:add(f.byte_count, bc)
            offset = offset + 1
            local num_registers = math.floor(bc:uint() / 2)
            for i = 0, num_registers - 1 do
                if offset + 2 <= tvbuf:len() then
                    local reg_tree = subtree:add(tvbuf(offset, 2), string.format("Register %d", i))
                    reg_tree:add(f.register_value, tvbuf(offset, 2))
                    offset = offset + 2
                end
            end
        end
    elseif fc_value == 0x05 then
        if offset + 4 <= tvbuf:len() then
            local addr = tvbuf(offset, 2)
            subtree:add(f.start_address, addr)
            offset = offset + 2
            local val = tvbuf(offset, 2)
            subtree:add(f.coil_status, val)
        end
    elseif fc_value == 0x06 then
        if offset + 4 <= tvbuf:len() then
            local addr = tvbuf(offset, 2)
            subtree:add(f.start_address, addr)
            offset = offset + 2
            local val = tvbuf(offset, 2)
            subtree:add(f.register_value, val)
        end
    elseif fc_value == 0x0F or fc_value == 0x10 then
        if offset + 4 <= tvbuf:len() then
            local addr = tvbuf(offset, 2)
            subtree:add(f.start_address, addr)
            offset = offset + 2
            local qty = tvbuf(offset, 2)
            subtree:add(f.quantity, qty)
        end
    elseif fc_value == 0x41 then
        if offset + 2 <= tvbuf:len() then
            local sid = tvbuf(offset, 2)
            subtree:add(f.sensor_id, sid)
            offset = offset + 2
        end
        if offset + 1 <= tvbuf:len() then
            local stype = tvbuf(offset, 1)
            subtree:add(f.sensor_type, stype)
            offset = offset + 1
        end
        if offset + 4 <= tvbuf:len() then
            local ts = tvbuf(offset, 4)
            subtree:add(f.timestamp, ts)
            offset = offset + 4
        end
        if offset + 4 <= tvbuf:len() then
            local val_bytes = tvbuf(offset, 4)
            subtree:add(f.sensor_value, val_bytes:float())
        end
    elseif fc_value == 0x42 then
        if offset + 2 <= tvbuf:len() then
            local ckey = tvbuf(offset, 2)
            subtree:add(f.config_key, ckey)
            offset = offset + 2
        end
        if offset + 4 <= tvbuf:len() then
            local cval = tvbuf(offset, 4)
            subtree:add(f.config_value, cval)
        end
    elseif fc_value == 0x43 then
        if offset + 16 <= tvbuf:len() then
            local fw = tvbuf(offset, 16)
            subtree:add(f.firmware_version, fw:string())
        end
    elseif fc_value == 0x44 then
        if offset + 1 <= tvbuf:len() then
            local ds = tvbuf(offset, 1)
            subtree:add(f.device_status, ds)
        end
    elseif fc_value == 0x45 then
        if offset + 2 <= tvbuf:len() then
            local aid = tvbuf(offset, 2)
            subtree:add(f.alarm_id, aid)
        end
    end

    if offset < tvbuf:len() then
        subtree:add(f.payload, tvbuf(offset, tvbuf:len() - offset))
    end
end

local tcp_table = DissectorTable.get("tcp.port")
tcp_table:add(502, modbus_ext_proto)
tcp_table:add(1502, modbus_ext_proto)
