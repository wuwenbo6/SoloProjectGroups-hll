import struct
from typing import Dict, Any

from .types import (
    ISCSIPDU,
    BHS_LENGTH,
    ISCSI_OPCODE_SCSI_RESP,
    ISCSI_OPCODE_SCSI_DATA_IN,
    ISCSI_OPCODE_R2T,
    ISCSI_OPCODE_LOGIN_RESP,
    ISCSI_OPCODE_NOP_IN,
    ISCSI_FLAG_FINAL,
    ISCSI_FLAG_IMMEDIATE,
    SCSI_STATUS_GOOD,
    ISCSI_RESPONSE_COMMAND_COMPLETED,
    LOGIN_FLAG_TRANSIT,
    LOGIN_STAGE_FULL_FEATURE_PHASE,
)


class PDUParser:
    @staticmethod
    def parse(data: bytes) -> ISCSIPDU:
        if len(data) < BHS_LENGTH:
            raise ValueError(
                f"Data too short: {len(data)} bytes, minimum {BHS_LENGTH} bytes"
            )

        bhs = PDUParser._parse_bhs(data[:BHS_LENGTH])

        offset = BHS_LENGTH
        ahs_length = bhs["total_ahs_length"] * 4
        if offset + ahs_length > len(data):
            raise ValueError("AHS segments exceed available data")
        ahs_segments = data[offset:offset + ahs_length]
        offset += ahs_length

        data_length = bhs["data_segment_length"]
        padded_data_length = PDUParser._pad_to_4(data_length)
        if offset + padded_data_length > len(data):
            raise ValueError("Data segment exceeds available data")
        data_segment = data[offset:offset + data_length]
        offset += padded_data_length

        pdu = ISCSIPDU(
            opcode=bhs["opcode"],
            immediate=bhs["immediate"],
            final=bhs["final"],
            flags=bhs["flags"],
            total_ahs_length=bhs["total_ahs_length"],
            data_segment_length=data_length,
            lun=bhs["lun"],
            initiator_task_tag=bhs["initiator_task_tag"],
            cmd_sn=bhs["cmd_sn"],
            exp_cmd_sn=bhs["exp_cmd_sn"],
            max_cmd_sn=bhs["max_cmd_sn"],
            exp_stat_sn=bhs["exp_stat_sn"],
            stat_sn=bhs["stat_sn"],
            header_digest=bhs["header_digest"],
            ahs_segments=ahs_segments,
            data=data_segment,
            opcode_specific=bhs["opcode_specific"],
        )

        return pdu

    @staticmethod
    def serialize(pdu: ISCSIPDU) -> bytes:
        bhs = PDUParser._serialize_bhs(pdu)

        ahs = pdu.ahs_segments
        ahs_padding = PDUParser._pad_to_4(len(ahs)) - len(ahs)
        ahs += b"\x00" * ahs_padding

        data = pdu.data
        data_padding = PDUParser._pad_to_4(len(data)) - len(data)
        data += b"\x00" * data_padding

        return bhs + ahs + data

    @staticmethod
    def _parse_bhs(data: bytes) -> Dict[str, Any]:
        if len(data) != BHS_LENGTH:
            raise ValueError(
                f"BHS must be {BHS_LENGTH} bytes, got {len(data)} bytes"
            )

        byte0 = data[0]
        opcode = byte0 & 0x3F
        immediate = bool(byte0 & 0x40)
        final = bool(byte0 & 0x80)

        flags = data[1]

        total_ahs_length = struct.unpack(">H", data[2:4])[0]

        data_segment_length = struct.unpack(">I", b"\x00" + data[4:7])[0]

        lun = struct.unpack(">Q", data[8:16])[0]

        initiator_task_tag = struct.unpack(">I", data[16:20])[0]

        cmd_sn_exp_cmd_sn = struct.unpack(">I", data[20:24])[0]
        cmd_sn = cmd_sn_exp_cmd_sn

        exp_stat_sn_max_cmd_sn = struct.unpack(">I", data[24:28])[0]
        exp_stat_sn = exp_stat_sn_max_cmd_sn

        stat_sn = struct.unpack(">I", data[28:32])[0]

        header_digest = struct.unpack(">I", data[32:36])[0]

        opcode_specific = {
            "bytes_36_47": data[36:48],
        }

        if opcode == ISCSI_OPCODE_SCSI_RESP:
            response = data[32]
            status = data[33]
            residual_count = struct.unpack(">I", data[44:48])[0]
            opcode_specific.update({
                "response": response,
                "status": status,
                "residual_count": residual_count,
            })
        elif opcode == ISCSI_OPCODE_SCSI_DATA_IN:
            data_sn = struct.unpack(">I", data[36:40])[0]
            buffer_offset = struct.unpack(">I", data[40:44])[0]
            residual_count = struct.unpack(">I", data[44:48])[0]
            opcode_specific.update({
                "data_sn": data_sn,
                "buffer_offset": buffer_offset,
                "residual_count": residual_count,
            })
        elif opcode == ISCSI_OPCODE_R2T:
            r2t_sn = struct.unpack(">I", data[36:40])[0]
            buffer_offset = struct.unpack(">I", data[40:44])[0]
            desired_data_transfer_length = struct.unpack(">I", data[44:48])[0]
            opcode_specific.update({
                "r2t_sn": r2t_sn,
                "buffer_offset": buffer_offset,
                "desired_data_transfer_length": desired_data_transfer_length,
            })
        elif opcode == ISCSI_OPCODE_LOGIN_RESP:
            tsi_h = struct.unpack(">H", data[32:34])[0]
            tsi_l = struct.unpack(">H", data[34:36])[0]
            cid = struct.unpack(">H", data[36:38])[0]
            csg_nsg_stage = data[40]
            csg = (csg_nsg_stage >> 6) & 0x03
            ns_g = (csg_nsg_stage >> 2) & 0x03
            stage_flag = csg_nsg_stage & 0x03
            opcode_specific.update({
                "tsi_h": tsi_h,
                "tsi_l": tsi_l,
                "cid": cid,
                "csg": csg,
                "ns_g": ns_g,
                "stage_flag": stage_flag,
            })

        return {
            "opcode": opcode,
            "immediate": immediate,
            "final": final,
            "flags": flags,
            "total_ahs_length": total_ahs_length,
            "data_segment_length": data_segment_length,
            "lun": lun,
            "initiator_task_tag": initiator_task_tag,
            "cmd_sn": cmd_sn,
            "exp_cmd_sn": cmd_sn_exp_cmd_sn,
            "max_cmd_sn": exp_stat_sn_max_cmd_sn,
            "exp_stat_sn": exp_stat_sn_max_cmd_sn,
            "stat_sn": stat_sn,
            "header_digest": header_digest,
            "opcode_specific": opcode_specific,
        }

    @staticmethod
    def _serialize_bhs(pdu: ISCSIPDU) -> bytes:
        bhs = bytearray(BHS_LENGTH)

        byte0 = pdu.opcode & 0x3F
        if pdu.immediate:
            byte0 |= 0x40
        if pdu.final:
            byte0 |= 0x80
        bhs[0] = byte0

        bhs[1] = pdu.flags & 0xFF

        struct.pack_into(">H", bhs, 2, pdu.total_ahs_length & 0xFFFF)

        data_len_bytes = struct.pack(">I", pdu.data_segment_length & 0xFFFFFF)
        bhs[4:7] = data_len_bytes[1:4]

        struct.pack_into(">Q", bhs, 8, pdu.lun)

        struct.pack_into(">I", bhs, 16, pdu.initiator_task_tag)

        struct.pack_into(">I", bhs, 20, pdu.cmd_sn)

        struct.pack_into(">I", bhs, 24, pdu.exp_stat_sn)

        struct.pack_into(">I", bhs, 28, pdu.stat_sn)

        struct.pack_into(">I", bhs, 32, pdu.header_digest)

        if pdu.opcode == ISCSI_OPCODE_SCSI_RESP:
            bhs[32] = pdu.opcode_specific.get("response", 0) & 0xFF
            bhs[33] = pdu.opcode_specific.get("status", 0) & 0xFF
            residual_count = pdu.opcode_specific.get("residual_count", 0)
            struct.pack_into(">I", bhs, 44, residual_count)
        elif pdu.opcode == ISCSI_OPCODE_SCSI_DATA_IN:
            data_sn = pdu.opcode_specific.get("data_sn", 0)
            buffer_offset = pdu.opcode_specific.get("buffer_offset", 0)
            residual_count = pdu.opcode_specific.get("residual_count", 0)
            struct.pack_into(">I", bhs, 36, data_sn)
            struct.pack_into(">I", bhs, 40, buffer_offset)
            struct.pack_into(">I", bhs, 44, residual_count)
        elif pdu.opcode == ISCSI_OPCODE_R2T:
            r2t_sn = pdu.opcode_specific.get("r2t_sn", 0)
            buffer_offset = pdu.opcode_specific.get("buffer_offset", 0)
            desired_length = pdu.opcode_specific.get(
                "desired_data_transfer_length", 0
            )
            struct.pack_into(">I", bhs, 36, r2t_sn)
            struct.pack_into(">I", bhs, 40, buffer_offset)
            struct.pack_into(">I", bhs, 44, desired_length)
        elif pdu.opcode == ISCSI_OPCODE_LOGIN_RESP:
            tsi_h = pdu.opcode_specific.get("tsi_h", 0)
            tsi_l = pdu.opcode_specific.get("tsi_l", 0)
            cid = pdu.opcode_specific.get("cid", 0)
            csg = pdu.opcode_specific.get("csg", 0)
            ns_g = pdu.opcode_specific.get("ns_g", 0)
            stage_flag = pdu.opcode_specific.get("stage_flag", 0)
            struct.pack_into(">H", bhs, 32, tsi_h)
            struct.pack_into(">H", bhs, 34, tsi_l)
            struct.pack_into(">H", bhs, 36, cid)
            csg_nsg_stage = (
                ((csg & 0x03) << 6)
                | ((ns_g & 0x03) << 2)
                | (stage_flag & 0x03)
            )
            bhs[40] = csg_nsg_stage

        return bytes(bhs)

    @staticmethod
    def _pad_to_4(byte_length: int) -> int:
        return ((byte_length + 3) // 4) * 4


def create_scsi_response(
    initiator_task_tag: int,
    cmd_sn: int,
    exp_stat_sn: int,
    stat_sn: int,
    response: int = ISCSI_RESPONSE_COMMAND_COMPLETED,
    status: int = SCSI_STATUS_GOOD,
    residual_count: int = 0,
) -> ISCSIPDU:
    pdu = ISCSIPDU(
        opcode=ISCSI_OPCODE_SCSI_RESP,
        final=True,
        initiator_task_tag=initiator_task_tag,
        cmd_sn=cmd_sn,
        exp_stat_sn=exp_stat_sn,
        stat_sn=stat_sn,
        opcode_specific={
            "response": response,
            "status": status,
            "residual_count": residual_count,
        },
    )
    return pdu


def create_data_in(
    initiator_task_tag: int,
    cmd_sn: int,
    exp_stat_sn: int,
    stat_sn: int,
    data: bytes,
    final: bool = True,
) -> ISCSIPDU:
    pdu = ISCSIPDU(
        opcode=ISCSI_OPCODE_SCSI_DATA_IN,
        final=final,
        initiator_task_tag=initiator_task_tag,
        cmd_sn=cmd_sn,
        exp_stat_sn=exp_stat_sn,
        stat_sn=stat_sn,
        data=data,
        opcode_specific={
            "data_sn": 0,
            "buffer_offset": 0,
            "residual_count": 0,
        },
    )
    return pdu


def create_r2t(
    initiator_task_tag: int,
    cmd_sn: int,
    exp_stat_sn: int,
    stat_sn: int,
    r2t_sn: int,
    buffer_offset: int,
    desired_data_transfer_length: int,
) -> ISCSIPDU:
    pdu = ISCSIPDU(
        opcode=ISCSI_OPCODE_R2T,
        final=True,
        initiator_task_tag=initiator_task_tag,
        cmd_sn=cmd_sn,
        exp_stat_sn=exp_stat_sn,
        stat_sn=stat_sn,
        opcode_specific={
            "r2t_sn": r2t_sn,
            "buffer_offset": buffer_offset,
            "desired_data_transfer_length": desired_data_transfer_length,
        },
    )
    return pdu


def create_login_response(
    initiator_task_tag: int,
    tsi_h: int,
    tsi_l: int,
    cid: int,
    csg: int,
    ns_g: int,
    stage_flag: int,
    parameters: str = "",
) -> ISCSIPDU:
    pdu = ISCSIPDU(
        opcode=ISCSI_OPCODE_LOGIN_RESP,
        final=True,
        initiator_task_tag=initiator_task_tag,
        data=parameters.encode("utf-8"),
        opcode_specific={
            "tsi_h": tsi_h,
            "tsi_l": tsi_l,
            "cid": cid,
            "csg": csg,
            "ns_g": ns_g,
            "stage_flag": stage_flag,
        },
    )
    return pdu


def create_nop_in(
    initiator_task_tag: int,
    data: bytes = b"",
) -> ISCSIPDU:
    pdu = ISCSIPDU(
        opcode=ISCSI_OPCODE_NOP_IN,
        final=True,
        immediate=True,
        initiator_task_tag=initiator_task_tag,
        data=data,
    )
    return pdu
