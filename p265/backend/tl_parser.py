import struct
from typing import Any, Dict, List, Optional, Tuple


TL_CONSTRUCTORS = {
    0x73f1f8dc: "msg_container",
    0x5bb8e511: "message",
    0x90166158: "message_service",
    0x5b855291: "message_empty",
    0x3c6a10b5: "message_media_empty",
    0x3a74f777: "message_media_photo",
    0x188130b5: "message_media_video",
    0x2628c666: "message_media_document",
    0xc89522e5: "message_media_web_page",
    0x84716746: "message_media_contact",
    0x8242e60e: "message_media_geo",
    0xcb421bd9: "message_media_geo_live",
    0x82887988: "message_media_poll",
    0xa929964e: "message_media_dice",
    0x3ddc988f: "message_media_game",
    0x65c66937: "peer_user",
    0x2757b283: "peer_chat",
    0xc917dd2a: "peer_channel",
    0x86d270d1: "input_peer_empty",
    0x8061355a: "input_peer_user",
    0x13540e8d: "input_peer_chat",
    0x32a878ef: "input_peer_channel",
    0x9a7ef03c: "input_peer_self",
    0x1c9af701: "user",
    0x93416265: "user_full",
    0x414bfdae: "chat",
    0x2e46a288: "chat_forbidden",
    0xa14dcae3: "channel",
    0x1e31046e: "channel_forbidden",
    0x3b04832a: "channel_full",
    0x28c32359: "updates",
    0x74ae4240: "updates_combined",
    0x36dd19df: "update_short_message",
    0x313bc7f8: "update_short_chat_message",
    0x914fbf11: "update_short_sent_message",
    0xe471b7cf: "update_short",
    0x952c0494: "update_new_message",
    0x2f2f21bf: "update_new_channel_message",
    0x1f2b0afd: "update_message_id",
    0x4e90bfd6: "update_delete_messages",
    0xe5dbce4e: "update_edit_message",
    0x72e29a8c: "update_read_history_inbox",
    0xc97867c6: "update_read_history_outbox",
    0xe306dffb: "update_web_page",
    0x803c5786: "update_read_messages_contents",
    0x2dc89f83: "update_user_typing",
    0x1d0d4829: "update_chat_user_typing",
    0xd4dc4307: "update_channel_message_views",
    0x25f88870: "update_message_poll",
    0x2b06c164: "message_action_chat_create",
    0x34af0076: "message_action_chat_edit_title",
    0x3a2ceb1d: "message_action_chat_edit_photo",
    0x7177732e: "message_action_chat_delete_photo",
    0x2280e27d: "message_action_chat_add_user",
    0xbdbbbc44: "message_action_chat_delete_user",
    0x88c9b13b: "message_action_chat_migrate_to",
    0x5a0c1d6e: "message_action_channel_migrate_from",
    0x5e1b9124: "message_action_poll",
    0x116fe94e: "message_action_phone_call",
    0xec82e9b7: "message_action_screenshot_taken",
    0x80c177ea: "message_action_custom_action",
    0x2ea2c0d4: "message_action_bot_allowed",
    0x20c0834c: "message_action_channel_create",
    0x9cd32468: "message_action_channel_available_reactions",
    0xc1c70012: "message_entity_mention",
    0xb25011c2: "message_entity_hashtag",
    0x15ee8764: "message_entity_bot_command",
    0x6d342457: "message_entity_url",
    0x46e63635: "message_entity_email",
    0x351713a4: "message_entity_bold",
    0xbfd67696: "message_entity_italic",
    0x767f2b1e: "message_entity_code",
    0x22201e27: "message_entity_pre",
    0x6085542e: "message_entity_text_url",
    0x28a20571: "message_entity_mention_name",
    0x9941a66e: "message_entity_cashtag",
    0x60966c75: "message_entity_phone",
    0x91e9e67a: "message_entity_underline",
    0xd0133f71: "message_entity_strikethrough",
    0xcce08a72: "message_entity_blockquote",
    0xa7322ae8: "message_entity_spoiler",
    0x756e888e: "message_entity_custom_emoji",
    0x10814e45: "input_media_photo",
    0x33473058: "input_media_video",
    0x9c222862: "input_media_document",
    0x0e46215f: "photo",
    0x34a72ef1: "photo_empty",
    0x88f44a45: "photo_size",
    0x4d44c09c: "video",
    0x841b6b22: "document",
    0x4f40484d: "document_attribute_filename",
    0x280a942d: "document_attribute_image_size",
    0x55b5d6c5: "document_attribute_video",
    0x6567690e: "document_attribute_audio",
    0xd80672c5: "document_attribute_sticker",
    0xec9e82f1: "web_page",
    0x81645963: "web_page_empty",
    0xcf4da6df: "web_page_not_modified",
    0x911fbb92: "reply_markup_inline",
    0xa03e8b5b: "reply_markup_keyboard_hide",
    0x24a02c4f: "reply_markup_force_reply",
    0x422a35ef: "reply_markup_keyboard",
    0xc6d17816: "keyboard_button",
    0x86ae7161: "keyboard_button_url",
    0x35bbdb6b: "keyboard_button_callback",
    0xf90c134e: "keyboard_button_switch_inline",
    0xc2726556: "keyboard_button_buy",
    0x34562d8a: "keyboard_button_url_auth",
    0x82847d41: "keyboard_button_callback_game",
    0xca94640b: "keyboard_button_request_poll",
    0xe8808e20: "keyboard_button_request_peer_type",
    0x14a301c5: "keyboard_button_request_users",
    0xa9a65f81: "keyboard_button_request_chat",
    0xbc0fec5f: "true",
    0x379779aa: "false",
    0x1cb5c415: "vector",
    0x2465be17: "null",
    0xb5286e24: "gzip_packed",
    0x5593768e: "message_fwd_header",
    0x359a86e5: "messageReplyHeader",
    0x8a8ef49a: "messageReplyHeader_Layer145",
    0xa7d5e576: "dialogs",
    0x15ba6c40: "dialog",
    0xe6d07f5e: "messages_messages",
    0xa9c29648: "messages_messages_slice",
    0xb0b0d188: "messages_channel_messages",
    0xd0497460: "messages_dialogs",
    0x643e7f81: "messages_dialogs_slice",
    0x39c3b6c2: "rpc_drop_answer",
    0x8e1a1775: "future_salt",
    0x9a2b5a4a: "future_salts",
    0x0949d9dc: "pong",
    0xf35c6d01: "rpc_result",
    0x3072cfa1: "gzip_packed",
    0x5e950cac: "msg_detailed_info",
    0x276d3ec6: "msg_new_detailed_info",
    0x7d861a08: "msg_resend_req",
    0x8e521c09: "msgs_ack",
    0x6e37f723: "msgs_state_info",
    0x516dea31: "msgs_state_req",
    0xda69fb52: "msgs_all_info",
    0x83ae7b20: "msg_resends_req",
    0x19dc4c89: "bad_msg_notification",
    0xedab447b: "bad_server_salt",
    0x6e377ad5: "msgs_state_req",
    0x7f359a7f: "rpc_error",
    0xd6e9181b: "phone_call_requested",
    0x1da3b86e: "phone_call_accepted",
    0x2bbcfe4d: "phone_call",
    0x9978467b: "phone_call_discarded",
    0x6d95d698: "input_phone_call",
    0x509ec160: "phone_call_protocol",
    0x6c3313d2: "phone_connection",
    0x8bfa8e6c: "messages_sticker_set",
    0xb60a24a6: "sticker_set",
    0x12b299d4: "sticker_pack",
    0x3065c7f6: "document_attribute_sticker_layer23",
    0x3e43bf3a: "restricted_content",
    0xbf090e32: "chat_admin_rights",
    0xfadb06e3: "chat_banned_rights",
    0xedf44e5c: "channel_admin_log_event",
    0x5e5fb979: "channel_admin_log_events_list",
}


class TLParser:
    def __init__(self, data: bytes, offset: int = 0):
        self.data = data
        self.offset = offset

    def remaining(self) -> int:
        return len(self.data) - self.offset

    def read(self, length: int) -> bytes:
        if self.offset + length > len(self.data):
            raise ValueError(f"Not enough data: need {length}, have {self.remaining()}")
        result = self.data[self.offset:self.offset + length]
        self.offset += length
        return result

    def read_int(self) -> int:
        return int.from_bytes(self.read(4), "little", signed=True)

    def read_uint(self) -> int:
        return int.from_bytes(self.read(4), "little", signed=False)

    def read_long(self) -> int:
        return int.from_bytes(self.read(8), "little", signed=True)

    def read_ulong(self) -> int:
        return int.from_bytes(self.read(8), "little", signed=False)

    def read_double(self) -> float:
        return struct.unpack("<d", self.read(8))[0]

    def read_string(self) -> str:
        length = self.read(1)[0]
        if length == 254:
            length = int.from_bytes(self.read(3), "little")
            padding = (4 - (length + 3) % 4) % 4
        else:
            padding = (4 - (length + 1) % 4) % 4

        data = self.read(length)
        if padding > 0:
            self.read(padding)

        return data.decode("utf-8", errors="replace")

    def read_bytes(self) -> bytes:
        length = self.read(1)[0]
        if length == 254:
            length = int.from_bytes(self.read(3), "little")
            padding = (4 - (length + 3) % 4) % 4
        else:
            padding = (4 - (length + 1) % 4) % 4

        data = self.read(length)
        if padding > 0:
            self.read(padding)

        return data

    def read_bool(self) -> bool:
        constructor = self.read_uint()
        if constructor == 0xbc0fec5f:
            return True
        elif constructor == 0x379779aa:
            return False
        else:
            self.offset -= 4
            raise ValueError(f"Not a bool constructor: {hex(constructor)}")

    def read_vector(self) -> list:
        constructor = self.read_uint()
        if constructor != 0x1cb5c415:
            self.offset -= 4
            raise ValueError(f"Not a vector constructor: {hex(constructor)}")

        count = self.read_uint()
        result = []
        for _ in range(count):
            result.append(self.read_object())
        return result

    def read_constructor(self) -> Tuple[int, str]:
        constructor_id = self.read_uint()
        name = TL_CONSTRUCTORS.get(constructor_id, f"unknown_{hex(constructor_id)}")
        return constructor_id, name

    def read_object(self) -> Any:
        if self.remaining() < 4:
            return None

        saved_offset = self.offset
        constructor_id, constructor_name = self.read_constructor()

        if constructor_id == 0x1cb5c415:
            count = self.read_uint()
            result = []
            for _ in range(count):
                result.append(self.read_object())
            return {"_": "vector", "items": result}

        if constructor_id == 0xbc0fec5f:
            return True

        if constructor_id == 0x379779aa:
            return False

        if constructor_id == 0x2465be17:
            return None

        if constructor_id == 0xb5286e24:
            import gzip
            packed_data = self.read_bytes()
            try:
                unpacked = gzip.decompress(packed_data)
                sub_parser = TLParser(unpacked)
                return {"_": "gzip_packed", "data": sub_parser.read_object()}
            except Exception:
                return {"_": "gzip_packed", "raw": packed_data.hex()}

        try:
            return self._parse_constructor(constructor_id, constructor_name)
        except Exception as e:
            remaining_data = self.data[saved_offset:]
            return {
                "_": constructor_name,
                "constructor_id": hex(constructor_id),
                "parse_error": str(e),
                "raw": remaining_data.hex()[:200]
            }

    def _parse_constructor(self, constructor_id: int, constructor_name: str) -> dict:
        result = {"_": constructor_name, "constructor_id": hex(constructor_id)}

        if constructor_name == "msg_container":
            count = self.read_uint()
            messages = []
            for _ in range(count):
                msg_id = self.read_ulong()
                seq_no = self.read_uint()
                length = self.read_uint()
                saved_offset = self.offset
                try:
                    inner_obj = self.read_object()
                    messages.append({
                        "msg_id": msg_id,
                        "seq_no": seq_no,
                        "length": length,
                        "body": inner_obj
                    })
                except Exception:
                    self.offset = saved_offset + length
                    messages.append({
                        "msg_id": msg_id,
                        "seq_no": seq_no,
                        "length": length,
                        "raw": self.read(length).hex()[:200]
                    })
            result["messages"] = messages
            return result

        if constructor_name in ["message", "message_service", "message_empty"]:
            return self._parse_message(constructor_id, constructor_name)

        if constructor_name.startswith("update_"):
            return self._parse_update(constructor_id, constructor_name, result)

        if constructor_name.startswith("updates"):
            return self._parse_updates(constructor_id, constructor_name, result)

        if constructor_name == "user":
            return self._parse_user(result)

        if constructor_name == "channel" or constructor_name == "chat":
            return self._parse_chat(constructor_name, result)

        if constructor_name.startswith("peer_"):
            return self._parse_peer(constructor_id, constructor_name, result)

        if constructor_name == "web_page":
            return self._parse_web_page(result)

        if constructor_name == "photo":
            return self._parse_photo(result)

        if constructor_name == "video":
            return self._parse_video(result)

        if constructor_name == "document":
            return self._parse_document(result)

        if constructor_name.startswith("message_media_"):
            return self._parse_message_media(constructor_id, constructor_name, result)

        if constructor_name.startswith("message_action_"):
            return self._parse_message_action(constructor_id, constructor_name, result)

        if constructor_name.startswith("message_entity_"):
            return self._parse_message_entity(constructor_id, constructor_name, result)

        if constructor_name == "message_fwd_header":
            return self._parse_fwd_header(result)

        if constructor_name in ["messageReplyHeader", "messageReplyHeader_Layer145"]:
            return self._parse_reply_header(result)

        if constructor_name.startswith("messages_"):
            return self._parse_messages_result(constructor_id, constructor_name, result)

        if constructor_name in ["rpc_result", "rpc_error"]:
            return self._parse_rpc(constructor_id, constructor_name, result)

        if constructor_name in ["pong", "future_salt", "future_salts"]:
            return self._parse_system(constructor_id, constructor_name, result)

        if constructor_name in ["msgs_ack", "msg_detailed_info", "msg_new_detailed_info",
                                "msg_resend_req", "msg_resends_req",
                                "msgs_state_info", "msgs_state_req", "msgs_all_info",
                                "bad_msg_notification", "bad_server_salt", "rpc_drop_answer"]:
            return self._parse_system(constructor_id, constructor_name, result)

        if constructor_name in ["dialog"]:
            return self._parse_dialog(result)

        return self._read_remaining_fields(result)

    def _parse_message(self, constructor_id: int, constructor_name: str) -> dict:
        result = {"_": constructor_name, "constructor_id": hex(constructor_id)}

        if constructor_name == "message_empty":
            result["id"] = self.read_uint()
            return result

        flags = self.read_uint()
        result["flags"] = flags
        result["out"] = bool(flags & (1 << 1))
        result["mentioned"] = bool(flags & (1 << 4))
        result["media_unread"] = bool(flags & (1 << 5))
        result["silent"] = bool(flags & (1 << 13))
        result["post"] = bool(flags & (1 << 14))
        result["legacy"] = bool(flags & (1 << 19))
        result["edit_hide"] = bool(flags & (1 << 21))
        result["pinned"] = bool(flags & (1 << 24))
        result["noforwards"] = bool(flags & (1 << 26))

        result["id"] = self.read_uint()

        if flags & (1 << 0):
            result["from_id"] = self.read_object()

        result["peer_id"] = self.read_object()

        if flags & (1 << 2):
            result["fwd_from"] = self.read_object()

        if flags & (1 << 11):
            result["via_bot_id"] = self.read_uint()

        if flags & (1 << 3):
            result["reply_to"] = self.read_object()

        result["date"] = self.read_uint()

        if constructor_name == "message":
            result["message"] = self.read_string()

            if flags & (1 << 9):
                result["media"] = self.read_object()

            if flags & (1 << 6):
                result["reply_markup"] = self.read_object()

            if flags & (1 << 7):
                result["entities"] = self.read_vector()

            if flags & (1 << 10):
                result["views"] = self.read_uint()

            if flags & (1 << 10):
                result["forwards"] = self.read_uint()

            if flags & (1 << 23):
                result["replies"] = self.read_object()

            if flags & (1 << 15):
                result["edit_date"] = self.read_uint()

            if flags & (1 << 17):
                result["post_author"] = self.read_string()

            if flags & (1 << 18):
                result["grouped_id"] = self.read_ulong()

            if flags & (1 << 25):
                result["restriction_reason"] = self.read_vector()

            if flags & (1 << 22):
                result["ttl_period"] = self.read_uint()
        else:
            result["action"] = self.read_object()

        return result

    def _parse_update(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name in ["update_short_message", "update_short_chat_message", "update_short_sent_message"]:
            result["flags"] = self.read_uint()
            result["id"] = self.read_uint()
            result["user_id"] = self.read_uint()
            if constructor_name == "update_short_chat_message":
                result["chat_id"] = self.read_uint()
            result["message"] = self.read_string()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            result["date"] = self.read_uint()
            if result["flags"] & (1 << 7):
                result["entities"] = self.read_vector()
            return result

        if constructor_name == "update_new_message" or constructor_name == "update_new_channel_message":
            result["message"] = self.read_object()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            return result

        if constructor_name == "update_edit_message":
            result["message"] = self.read_object()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            return result

        if constructor_name == "update_delete_messages":
            result["messages"] = self.read_vector()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            return result

        if constructor_name == "update_read_history_inbox" or constructor_name == "update_read_history_outbox":
            result["peer"] = self.read_object()
            result["max_id"] = self.read_uint()
            result["still_unread_count"] = self.read_uint()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            return result

        if constructor_name == "update_message_id":
            result["id"] = self.read_uint()
            result["random_id"] = self.read_ulong()
            return result

        if constructor_name == "update_web_page":
            result["web_page"] = self.read_object()
            result["chat_id"] = self.read_uint()
            result["msg_id"] = self.read_uint()
            result["pts"] = self.read_uint()
            result["pts_count"] = self.read_uint()
            return result

        if constructor_name == "update_user_typing":
            result["user_id"] = self.read_uint()
            result["action"] = self.read_object()
            return result

        if constructor_name == "update_chat_user_typing":
            result["chat_id"] = self.read_uint()
            result["user_id"] = self.read_uint()
            result["action"] = self.read_object()
            return result

        if constructor_name == "update_channel_message_views":
            result["channel_id"] = self.read_uint()
            result["id"] = self.read_uint()
            result["views"] = self.read_uint()
            if constructor_id == 0x525c6636:
                result["forwards"] = self.read_uint()
            return result

        if constructor_name == "update_message_poll":
            result["poll"] = self.read_object()
            result["results"] = self.read_object()
            return result

        return self._read_remaining_fields(result)

    def _parse_updates(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "updates" or constructor_name == "updates_combined":
            result["updates"] = self.read_vector()
            result["users"] = self.read_vector()
            result["chats"] = self.read_vector()
            result["date"] = self.read_uint()
            result["seq"] = self.read_uint()
            return result

        if constructor_name == "update_short":
            result["update"] = self.read_object()
            result["date"] = self.read_uint()
            return result

        return self._read_remaining_fields(result)

    def _parse_user(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["self"] = bool(flags & (1 << 10))
        result["contact"] = bool(flags & (1 << 11))
        result["mutual_contact"] = bool(flags & (1 << 12))
        result["deleted"] = bool(flags & (1 << 13))
        result["bot"] = bool(flags & (1 << 14))
        result["bot_chat_history"] = bool(flags & (1 << 15))
        result["bot_nochats"] = bool(flags & (1 << 16))
        result["verified"] = bool(flags & (1 << 17))
        result["restricted"] = bool(flags & (1 << 18))
        result["min"] = bool(flags & (1 << 20))
        result["bot_inline_geo"] = bool(flags & (1 << 21))
        result["support"] = bool(flags & (1 << 23))
        result["scam"] = bool(flags & (1 << 24))
        result["apply_min_photo"] = bool(flags & (1 << 25))
        result["fake"] = bool(flags & (1 << 26))
        result["bot_attach_menu"] = bool(flags & (1 << 27))
        result["premium"] = bool(flags & (1 << 28))
        result["attach_menu_enabled"] = bool(flags & (1 << 29))
        result["bot_can_edit"] = bool(flags & (1 << 30))

        result["id"] = self.read_ulong()

        if flags & (1 << 0):
            result["access_hash"] = self.read_ulong()

        if flags & (1 << 1):
            result["first_name"] = self.read_string()

        if flags & (1 << 2):
            result["last_name"] = self.read_string()

        if flags & (1 << 3):
            result["username"] = self.read_string()

        if flags & (1 << 4):
            result["phone"] = self.read_string()

        if flags & (1 << 5):
            result["photo"] = self.read_object()

        if flags & (1 << 6):
            result["status"] = self.read_object()

        result["bot_info_version"] = self.read_uint() if flags & (1 << 14) else 0

        if flags & (1 << 18):
            result["restriction_reason"] = self.read_vector()

        if flags & (1 << 19):
            result["bot_inline_placeholder"] = self.read_string()

        if flags & (1 << 22):
            result["lang_code"] = self.read_string()

        if flags & (1 << 27):
            result["emoji_status"] = self.read_object()

        if flags & (1 << 31):
            result["color"] = self.read_object()

        return result

    def _parse_chat(self, constructor_name: str, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["creator"] = bool(flags & (1 << 0))
        result["left"] = bool(flags & (1 << 2))
        result["broadcast"] = bool(flags & (1 << 5))
        result["verified"] = bool(flags & (1 << 7))
        result["megagroup"] = bool(flags & (1 << 8))
        result["restricted"] = bool(flags & (1 << 9))
        result["signatures"] = bool(flags & (1 << 11))
        result["min"] = bool(flags & (1 << 12))
        result["scam"] = bool(flags & (1 << 19))
        result["has_link"] = bool(flags & (1 << 20))
        result["has_geo"] = bool(flags & (1 << 21))
        result["slowmode_enabled"] = bool(flags & (1 << 22))
        result["fake"] = bool(flags & (1 << 23))
        result["gigagroup"] = bool(flags & (1 << 24))
        result["join_to_send"] = bool(flags & (1 << 25))
        result["join_request"] = bool(flags & (1 << 26))
        result["forum"] = bool(flags & (1 << 27))
        result["stories_hidden"] = bool(flags & (1 << 28))
        result["stories_hidden_min"] = bool(flags & (1 << 29))

        result["id"] = self.read_ulong()

        if constructor_name == "channel":
            if flags & (1 << 0):
                result["access_hash"] = self.read_ulong()

        result["title"] = self.read_string()

        if constructor_name == "chat":
            result["photo"] = self.read_object() if flags & (1 << 5) else None
            result["participants_count"] = self.read_uint()
            result["date"] = self.read_uint()
            if flags & (1 << 6):
                result["migrated_to"] = self.read_object()
        else:
            result["username"] = self.read_string() if flags & (1 << 6) else None
            result["photo"] = self.read_object() if flags & (1 << 5) else None
            result["date"] = self.read_uint()
            result["restriction_reason"] = self.read_vector() if flags & (1 << 9) else []
            result["admin_rights"] = self.read_object() if flags & (1 << 13) else None
            result["banned_rights"] = self.read_object() if flags & (1 << 14) else None
            result["default_banned_rights"] = self.read_object() if flags & (1 << 15) else None
            if flags & (1 << 16):
                result["participants_count"] = self.read_uint()
            if flags & (1 << 17):
                result["admins_count"] = self.read_uint()
            if flags & (1 << 18):
                result["kicked_count"] = self.read_uint()
            if flags & (1 << 21):
                result["geo"] = self.read_object()
            if flags & (1 << 22):
                result["slowmode_seconds"] = self.read_uint()
            if flags & (1 << 27):
                result["emoji_status"] = self.read_object()
            if flags & (1 << 30):
                result["level"] = self.read_uint()

        return result

    def _parse_peer(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "peer_user":
            result["user_id"] = self.read_ulong()
        elif constructor_name == "peer_chat":
            result["chat_id"] = self.read_ulong()
        elif constructor_name == "peer_channel":
            result["channel_id"] = self.read_ulong()
        return result

    def _parse_web_page(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["id"] = self.read_ulong()
        result["url"] = self.read_string()
        result["display_url"] = self.read_string()
        result["hash"] = self.read_uint()
        result["type"] = self.read_string() if flags & (1 << 0) else None
        result["site_name"] = self.read_string() if flags & (1 << 1) else None
        result["title"] = self.read_string() if flags & (1 << 2) else None
        result["description"] = self.read_string() if flags & (1 << 3) else None
        result["photo"] = self.read_object() if flags & (1 << 4) else None
        result["embed_url"] = self.read_string() if flags & (1 << 5) else None
        result["embed_type"] = self.read_string() if flags & (1 << 5) else None
        if flags & (1 << 6):
            result["embed_width"] = self.read_uint()
        if flags & (1 << 6):
            result["embed_height"] = self.read_uint()
        result["duration"] = self.read_uint() if flags & (1 << 7) else None
        result["author"] = self.read_string() if flags & (1 << 8) else None
        result["document"] = self.read_object() if flags & (1 << 9) else None
        result["cached_page"] = self.read_object() if flags & (1 << 10) else None
        result["attributes"] = self.read_vector() if flags & (1 << 12) else []
        return result

    def _parse_photo(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["has_stickers"] = bool(flags & (1 << 0))
        result["id"] = self.read_ulong()
        result["access_hash"] = self.read_ulong()
        result["file_reference"] = self.read_bytes()
        result["date"] = self.read_uint()
        result["sizes"] = self.read_vector()
        result["video_sizes"] = self.read_vector() if flags & (1 << 1) else []
        result["dc_id"] = self.read_uint()
        return result

    def _parse_video(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["round_message"] = bool(flags & (1 << 0))
        result["supports_streaming"] = bool(flags & (1 << 1))
        result["nosound"] = bool(flags & (1 << 3))
        result["id"] = self.read_ulong()
        result["access_hash"] = self.read_ulong()
        result["file_reference"] = self.read_bytes()
        result["date"] = self.read_uint()
        result["duration"] = self.read_uint()
        result["w"] = self.read_uint()
        result["h"] = self.read_uint()
        result["size"] = self.read_uint()
        result["thumb"] = self.read_object() if flags & (1 << 2) else None
        result["dc_id"] = self.read_uint()
        result["attributes"] = self.read_vector()
        return result

    def _parse_document(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["id"] = self.read_ulong()
        result["access_hash"] = self.read_ulong()
        result["file_reference"] = self.read_bytes()
        result["date"] = self.read_uint()
        result["mime_type"] = self.read_string()
        result["size"] = self.read_uint()
        result["thumbs"] = self.read_vector() if flags & (1 << 0) else []
        result["video_thumbs"] = self.read_vector() if flags & (1 << 1) else []
        result["dc_id"] = self.read_uint()
        result["attributes"] = self.read_vector()
        return result

    def _parse_message_media(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "message_media_empty":
            return result

        if constructor_name == "message_media_photo":
            flags = self.read_uint()
            result["flags"] = flags
            result["photo"] = self.read_object() if flags & (1 << 0) else None
            result["ttl_seconds"] = self.read_uint() if flags & (1 << 2) else None
            return result

        if constructor_name == "message_media_video":
            flags = self.read_uint()
            result["flags"] = flags
            result["video"] = self.read_object() if flags & (1 << 0) else None
            result["ttl_seconds"] = self.read_uint() if flags & (1 << 2) else None
            return result

        if constructor_name == "message_media_document":
            flags = self.read_uint()
            result["flags"] = flags
            result["document"] = self.read_object() if flags & (1 << 0) else None
            result["ttl_seconds"] = self.read_uint() if flags & (1 << 2) else None
            return result

        if constructor_name == "message_media_web_page":
            result["webpage"] = self.read_object()
            return result

        if constructor_name == "message_media_contact":
            result["phone_number"] = self.read_string()
            result["first_name"] = self.read_string()
            result["last_name"] = self.read_string()
            result["user_id"] = self.read_ulong()
            result["vcard"] = self.read_string()
            return result

        if constructor_name == "message_media_geo" or constructor_name == "message_media_geo_live":
            result["geo"] = self.read_object() if constructor_name == "message_media_geo" else None
            if constructor_name == "message_media_geo_live":
                result["geo"] = self.read_object()
                result["heading"] = self.read_uint() if result["flags"] & (1 << 0) else None
                result["period"] = self.read_uint()
                result["proximity_notification_radius"] = self.read_uint() if result["flags"] & (1 << 1) else None
            return result

        if constructor_name == "message_media_poll":
            result["poll"] = self.read_object()
            result["results"] = self.read_object()
            return result

        if constructor_name == "message_media_dice":
            result["emoticon"] = self.read_string()
            result["value"] = self.read_uint()
            return result

        if constructor_name == "message_media_game":
            result["game"] = self.read_object()
            return result

        return self._read_remaining_fields(result)

    def _parse_message_action(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "message_action_chat_create":
            result["title"] = self.read_string()
            result["users"] = self.read_vector()
            return result

        if constructor_name == "message_action_chat_edit_title":
            result["title"] = self.read_string()
            return result

        if constructor_name == "message_action_chat_edit_photo":
            result["photo"] = self.read_object()
            return result

        if constructor_name == "message_action_chat_delete_photo":
            return result

        if constructor_name == "message_action_chat_add_user":
            result["users"] = self.read_vector()
            return result

        if constructor_name == "message_action_chat_delete_user":
            result["user_id"] = self.read_ulong()
            return result

        if constructor_name == "message_action_chat_migrate_to":
            result["channel_id"] = self.read_ulong()
            return result

        if constructor_name == "message_action_channel_migrate_from":
            result["chat_id"] = self.read_ulong()
            return result

        if constructor_name == "message_action_poll":
            result["poll_id"] = self.read_ulong()
            result["results"] = self.read_object()
            return result

        if constructor_name == "message_action_phone_call":
            result["phone_call"] = self.read_object()
            return result

        if constructor_name == "message_action_screenshot_taken":
            return result

        if constructor_name == "message_action_custom_action":
            result["message"] = self.read_string()
            return result

        if constructor_name == "message_action_bot_allowed":
            result["bot"] = self.read_object()
            result["domain"] = self.read_string()
            result["app_id"] = self.read_uint()
            return result

        if constructor_name == "message_action_channel_create":
            result["title"] = self.read_string()
            return result

        return self._read_remaining_fields(result)

    def _parse_message_entity(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        result["offset"] = self.read_uint()
        result["length"] = self.read_uint()

        if constructor_name == "message_entity_text_url":
            result["url"] = self.read_string()
        elif constructor_name == "message_entity_mention_name":
            result["user_id"] = self.read_ulong()
        elif constructor_name == "message_entity_pre":
            result["language"] = self.read_string()
        elif constructor_name == "message_entity_custom_emoji":
            result["document_id"] = self.read_ulong()
        elif constructor_name == "message_entity_bot_command":
            pass
        elif constructor_name in ["message_entity_url", "message_entity_email", "message_entity_phone",
                                  "message_entity_hashtag", "message_entity_cashtag", "message_entity_mention",
                                  "message_entity_bold", "message_entity_italic", "message_entity_underline",
                                  "message_entity_strikethrough", "message_entity_code", "message_entity_blockquote",
                                  "message_entity_spoiler"]:
            pass

        return result

    def _read_remaining_fields(self, result: dict, max_fields: int = 50) -> dict:
        field_count = 0
        while self.remaining() >= 4 and field_count < max_fields:
            try:
                saved_offset = self.offset
                obj = self.read_object()
                result[f"field_{field_count}"] = obj
                field_count += 1
            except Exception:
                self.offset = saved_offset
                break

        if self.remaining() > 0:
            result["remaining_hex"] = self.data[self.offset:].hex()

        return result

    def _parse_fwd_header(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["imported"] = bool(flags & (1 << 7))
        if flags & (1 << 0):
            result["from_id"] = self.read_object()
        if flags & (1 << 1):
            result["date"] = self.read_uint()
        if flags & (1 << 2):
            result["channel_id"] = self.read_ulong()
        if flags & (1 << 3):
            result["channel_post"] = self.read_uint()
        if flags & (1 << 4):
            result["post_author"] = self.read_string()
        if flags & (1 << 5):
            result["saved_from_peer"] = self.read_object()
        if flags & (1 << 5):
            result["saved_from_msg_id"] = self.read_uint()
        if flags & (1 << 6):
            result["psa_type"] = self.read_string()
        return result

    def _parse_reply_header(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["reply_to_msg_id"] = self.read_uint()
        if flags & (1 << 0):
            result["reply_to_peer_id"] = self.read_object()
        if flags & (1 << 1):
            result["reply_to_top_id"] = self.read_uint()
        if flags & (1 << 2):
            result["forum_topic"] = True
        if flags & (1 << 3):
            result["quote"] = True
            result["quote_text"] = self.read_string()
            if flags & (1 << 4):
                result["quote_entities"] = self.read_vector()
            if flags & (1 << 5):
                result["quote_offset"] = self.read_uint()
        return result

    def _parse_messages_result(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name in ["messages_messages", "messages_messages_slice",
                                "messages_channel_messages"]:
            if constructor_name in ["messages_messages_slice", "messages_channel_messages"]:
                result["count"] = self.read_uint()
            if constructor_name == "messages_channel_messages":
                result["pts"] = self.read_uint()
            result["messages"] = self.read_vector()
            result["dialogs"] = self.read_vector()
            result["chats"] = self.read_vector()
            result["users"] = self.read_vector()
            return result

        if constructor_name in ["messages_dialogs", "messages_dialogs_slice"]:
            result["dialogs"] = self.read_vector()
            result["messages"] = self.read_vector()
            result["chats"] = self.read_vector()
            result["users"] = self.read_vector()
            return result

        if constructor_name == "messages_sticker_set":
            result["set"] = self.read_object()
            result["packs"] = self.read_vector()
            result["documents"] = self.read_vector()
            return result

        return self._read_remaining_fields(result)

    def _parse_rpc(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "rpc_result":
            result["req_msg_id"] = self.read_ulong()
            result["result"] = self.read_object()
            return result

        if constructor_name == "rpc_error":
            result["error_code"] = self.read_uint()
            result["error_message"] = self.read_string()
            return result

        return self._read_remaining_fields(result)

    def _parse_system(self, constructor_id: int, constructor_name: str, result: dict) -> dict:
        if constructor_name == "pong":
            result["msg_id"] = self.read_ulong()
            result["ping_id"] = self.read_ulong()
            return result

        if constructor_name == "future_salt":
            result["valid_since"] = self.read_uint()
            result["valid_until"] = self.read_uint()
            result["salt"] = self.read_ulong()
            return result

        if constructor_name == "future_salts":
            result["req_msg_id"] = self.read_ulong()
            result["now"] = self.read_uint()
            count = self.read_uint()
            result["salts"] = []
            for _ in range(count):
                result["salts"].append({
                    "valid_since": self.read_uint(),
                    "valid_until": self.read_uint(),
                    "salt": self.read_ulong()
                })
            return result

        if constructor_name == "msgs_ack":
            result["msg_ids"] = self.read_vector()
            return result

        if constructor_name in ["msg_detailed_info", "msg_new_detailed_info"]:
            result["msg_id"] = self.read_ulong()
            result["answer_msg_id"] = self.read_ulong()
            result["bytes"] = self.read_uint()
            result["status"] = self.read_uint()
            return result

        if constructor_name in ["msg_resend_req", "msg_resends_req"]:
            result["msg_ids"] = self.read_vector()
            return result

        if constructor_name == "bad_msg_notification":
            result["bad_msg_id"] = self.read_ulong()
            result["bad_msg_seqno"] = self.read_uint()
            result["error_code"] = self.read_uint()
            return result

        if constructor_name == "bad_server_salt":
            result["bad_msg_id"] = self.read_ulong()
            result["bad_msg_seqno"] = self.read_uint()
            result["error_code"] = self.read_uint()
            result["new_server_salt"] = self.read_ulong()
            return result

        if constructor_name == "rpc_drop_answer":
            result["req_msg_id"] = self.read_ulong()
            return result

        if constructor_name in ["msgs_state_req", "msgs_state_info"]:
            if constructor_name == "msgs_state_info":
                result["req_msg_id"] = self.read_ulong()
                result["info"] = self.read_bytes()
            else:
                result["msg_ids"] = self.read_vector()
            return result

        if constructor_name == "msgs_all_info":
            result["msg_ids"] = self.read_vector()
            result["info"] = self.read_bytes()
            return result

        return self._read_remaining_fields(result)

    def _parse_dialog(self, result: dict) -> dict:
        flags = self.read_uint()
        result["flags"] = flags
        result["pinned"] = bool(flags & (1 << 2))
        result["unread_mark"] = bool(flags & (1 << 3))
        result["peer"] = self.read_object()
        result["top_message"] = self.read_uint()
        result["read_inbox_max_id"] = self.read_uint()
        result["read_outbox_max_id"] = self.read_uint()
        result["unread_count"] = self.read_uint()
        result["unread_mentions_count"] = self.read_uint()
        if flags & (1 << 1):
            result["notify_settings"] = self.read_object()
        if flags & (1 << 0):
            result["draft"] = self.read_object()
        if flags & (1 << 4):
            result["folder_id"] = self.read_uint()
        return result


class MessageExtractor:
    @staticmethod
    def extract_messages(parsed_data: Any, depth: int = 0, max_depth: int = 20) -> List[Dict[str, Any]]:
        if depth > max_depth:
            return []

        messages = []

        if isinstance(parsed_data, dict):
            msg_type = parsed_data.get("_", "")

            if msg_type == "msg_container":
                for msg in parsed_data.get("messages", []):
                    messages.extend(MessageExtractor.extract_messages(msg.get("body"), depth + 1))

            elif msg_type in ["message", "message_service"]:
                msg_info = MessageExtractor._extract_single_message(parsed_data)
                if msg_info:
                    messages.append(msg_info)

            elif msg_type == "message_empty":
                messages.append({
                    "id": parsed_data.get("id"),
                    "type": "message_empty",
                    "date": None,
                    "message": "(empty message)"
                })

            elif msg_type in ["update_new_message", "update_new_channel_message", "update_edit_message"]:
                messages.extend(MessageExtractor.extract_messages(parsed_data.get("message"), depth + 1))

            elif msg_type in ["update_short_message", "update_short_chat_message", "update_short_sent_message"]:
                msg_info = {
                    "id": parsed_data.get("id"),
                    "message": parsed_data.get("message"),
                    "date": parsed_data.get("date"),
                    "user_id": parsed_data.get("user_id"),
                    "chat_id": parsed_data.get("chat_id"),
                    "entities": MessageExtractor._parse_entities(parsed_data.get("entities", [])),
                    "type": msg_type,
                    "out": bool(parsed_data.get("flags", 0) & (1 << 1)),
                    "fwd_from": None,
                    "reply_to": None,
                    "media": None,
                    "views": None,
                    "forwards": None,
                    "edit_date": None,
                    "post_author": None,
                    "grouped_id": None,
                    "ttl_period": None,
                    "pinned": False,
                    "silent": False,
                    "post": False,
                    "chat": {"type": "peer_user", "user_id": parsed_data.get("user_id")},
                    "sender": None
                }
                if msg_type == "update_short_chat_message":
                    msg_info["chat"] = {"type": "peer_chat", "chat_id": parsed_data.get("chat_id")}
                    msg_info["sender"] = {"type": "peer_user", "user_id": parsed_data.get("user_id")}
                messages.append(msg_info)

            elif msg_type in ["updates", "updates_combined"]:
                for update in parsed_data.get("updates", []):
                    messages.extend(MessageExtractor.extract_messages(update, depth + 1))

            elif msg_type == "update_short":
                messages.extend(MessageExtractor.extract_messages(parsed_data.get("update"), depth + 1))

            elif msg_type == "vector":
                for item in parsed_data.get("items", []):
                    messages.extend(MessageExtractor.extract_messages(item, depth + 1))

            elif msg_type in ["messages_messages", "messages_messages_slice", "messages_channel_messages"]:
                for msg in parsed_data.get("messages", []):
                    messages.extend(MessageExtractor.extract_messages(msg, depth + 1))

            elif msg_type == "rpc_result":
                messages.extend(MessageExtractor.extract_messages(parsed_data.get("result"), depth + 1))

            elif msg_type == "gzip_packed":
                messages.extend(MessageExtractor.extract_messages(parsed_data.get("data"), depth + 1))

            elif msg_type == "dialog":
                pass

        elif isinstance(parsed_data, list):
            for item in parsed_data:
                messages.extend(MessageExtractor.extract_messages(item, depth + 1))

        return messages

    @staticmethod
    def _extract_single_message(msg: dict) -> Optional[Dict[str, Any]]:
        msg_id = msg.get("id")
        msg_date = msg.get("date")
        msg_type = msg.get("_")

        peer_id = msg.get("peer_id", {})
        chat_info = MessageExtractor._parse_peer(peer_id)

        from_id = msg.get("from_id", {})
        sender_info = MessageExtractor._parse_peer(from_id) if from_id else None

        result = {
            "id": msg_id,
            "date": msg_date,
            "type": msg_type,
            "out": msg.get("out", False),
            "post": msg.get("post", False),
            "silent": msg.get("silent", False),
            "pinned": msg.get("pinned", False),
            "chat": chat_info,
            "sender": sender_info
        }

        if msg_type == "message":
            result["message"] = msg.get("message", "")
            result["entities"] = MessageExtractor._parse_entities(msg.get("entities", []))

            media = msg.get("media")
            if media:
                result["media"] = MessageExtractor._parse_media(media)
            else:
                result["media"] = None

            fwd_from = msg.get("fwd_from")
            if fwd_from:
                result["fwd_from"] = MessageExtractor._parse_fwd_from(fwd_from)
            else:
                result["fwd_from"] = None

            reply_to = msg.get("reply_to")
            if reply_to:
                result["reply_to"] = MessageExtractor._parse_reply_to(reply_to)
            else:
                result["reply_to"] = None

            result["views"] = msg.get("views")
            result["forwards"] = msg.get("forwards")
            result["edit_date"] = msg.get("edit_date")
            result["post_author"] = msg.get("post_author")
            result["grouped_id"] = msg.get("grouped_id")
            result["ttl_period"] = msg.get("ttl_period")

        elif msg_type == "message_service":
            action = msg.get("action", {})
            result["action"] = MessageExtractor._parse_action(action)
            result["fwd_from"] = None
            result["reply_to"] = None
            result["media"] = None
            result["views"] = None
            result["forwards"] = None
            result["edit_date"] = None
            result["post_author"] = None
            result["grouped_id"] = None
            result["ttl_period"] = None

        return result

    @staticmethod
    def _parse_peer(peer: dict) -> dict:
        if not peer:
            return {"type": "unknown"}

        peer_type = peer.get("_", "unknown")
        result = {"type": peer_type}

        if peer_type == "peer_user":
            result["user_id"] = peer.get("user_id")
        elif peer_type == "peer_chat":
            result["chat_id"] = peer.get("chat_id")
        elif peer_type == "peer_channel":
            result["channel_id"] = peer.get("channel_id")

        return result

    @staticmethod
    def _parse_entities(entities: list) -> list:
        result = []
        for entity in entities:
            if isinstance(entity, dict):
                result.append({
                    "type": entity.get("_", "unknown"),
                    "offset": entity.get("offset"),
                    "length": entity.get("length"),
                    "url": entity.get("url"),
                    "user_id": entity.get("user_id"),
                    "language": entity.get("language"),
                    "document_id": entity.get("document_id")
                })
        return result

    @staticmethod
    def _parse_media(media: dict) -> dict:
        if not media:
            return {"type": "none"}

        media_type = media.get("_", "unknown")
        result = {"type": media_type}

        if media_type == "message_media_photo":
            photo = media.get("photo", {})
            result["photo_id"] = photo.get("id")
            result["photo_access_hash"] = photo.get("access_hash")
            result["dc_id"] = photo.get("dc_id")
            result["ttl_seconds"] = media.get("ttl_seconds")
        elif media_type == "message_media_video":
            video = media.get("video", {})
            result["video_id"] = video.get("id")
            result["video_access_hash"] = video.get("access_hash")
            result["duration"] = video.get("duration")
            result["size"] = video.get("size")
            result["w"] = video.get("w")
            result["h"] = video.get("h")
            result["mime_type"] = video.get("mime_type")
            result["round_message"] = video.get("round_message", False)
            result["supports_streaming"] = video.get("supports_streaming", False)
            result["ttl_seconds"] = media.get("ttl_seconds")
        elif media_type == "message_media_document":
            document = media.get("document", {})
            result["document_id"] = document.get("id")
            result["document_access_hash"] = document.get("access_hash")
            result["mime_type"] = document.get("mime_type")
            result["size"] = document.get("size")
            result["ttl_seconds"] = media.get("ttl_seconds")
        elif media_type == "message_media_web_page":
            webpage = media.get("webpage", {})
            result["url"] = webpage.get("url")
            result["display_url"] = webpage.get("display_url")
            result["title"] = webpage.get("title")
            result["description"] = webpage.get("description")
            result["type"] = webpage.get("type")
            result["site_name"] = webpage.get("site_name")
        elif media_type == "message_media_contact":
            result["phone_number"] = media.get("phone_number")
            result["first_name"] = media.get("first_name")
            result["last_name"] = media.get("last_name")
            result["user_id"] = media.get("user_id")
            result["vcard"] = media.get("vcard")
        elif media_type == "message_media_geo" or media_type == "message_media_geo_live":
            geo = media.get("geo", {})
            result["geo_type"] = geo.get("_")
            if hasattr(geo, "get"):
                result["lat"] = geo.get("lat")
                result["long"] = geo.get("long")
            result["period"] = media.get("period")
        elif media_type == "message_media_poll":
            poll = media.get("poll", {})
            result["poll_id"] = poll.get("id")
            result["question"] = poll.get("question")
            result["multiple"] = poll.get("multiple", False)
            result["quiz"] = poll.get("quiz", False)
        elif media_type == "message_media_dice":
            result["emoticon"] = media.get("emoticon")
            result["value"] = media.get("value")
        elif media_type == "message_media_game":
            game = media.get("game", {})
            result["game_id"] = game.get("id")
            result["game_title"] = game.get("title")
            result["game_short_name"] = game.get("short_name")

        return result

    @staticmethod
    def _parse_reply_to(reply_to: dict) -> dict:
        if not reply_to:
            return {}

        return {
            "type": reply_to.get("_", "unknown"),
            "reply_to_msg_id": reply_to.get("reply_to_msg_id"),
            "reply_to_peer": MessageExtractor._parse_peer(reply_to.get("reply_to_peer", {})),
            "quote": reply_to.get("quote"),
            "quote_text": reply_to.get("quote_text"),
            "quote_entities": MessageExtractor._parse_entities(reply_to.get("quote_entities", [])),
            "quote_offset": reply_to.get("quote_offset")
        }

    @staticmethod
    def _parse_action(action: dict) -> dict:
        if not action:
            return {"type": "unknown"}

        action_type = action.get("_", "unknown")
        result = {"type": action_type}

        if action_type == "message_action_chat_create":
            result["title"] = action.get("title")
            result["users"] = action.get("users", [])
        elif action_type == "message_action_chat_edit_title":
            result["title"] = action.get("title")
        elif action_type == "message_action_chat_add_user":
            result["users"] = action.get("users", [])
        elif action_type == "message_action_chat_delete_user":
            result["user_id"] = action.get("user_id")
        elif action_type == "message_action_custom_action":
            result["message"] = action.get("message")
        elif action_type == "message_action_bot_allowed":
            result["domain"] = action.get("domain")
            result["app_id"] = action.get("app_id")

        return result

    @staticmethod
    def _parse_fwd_from(fwd_from: dict) -> dict:
        if not fwd_from:
            return {}

        result = {"type": fwd_from.get("_", "unknown")}

        from_id = fwd_from.get("from_id")
        if from_id:
            result["from"] = MessageExtractor._parse_peer(from_id)

        if fwd_from.get("date"):
            result["date"] = fwd_from["date"]
        if fwd_from.get("channel_id"):
            result["channel_id"] = fwd_from["channel_id"]
        if fwd_from.get("channel_post"):
            result["channel_post"] = fwd_from["channel_post"]
        if fwd_from.get("post_author"):
            result["post_author"] = fwd_from["post_author"]
        if fwd_from.get("saved_from_peer"):
            result["saved_from"] = MessageExtractor._parse_peer(fwd_from["saved_from_peer"])
        if fwd_from.get("psa_type"):
            result["psa_type"] = fwd_from["psa_type"]

        return result

    @staticmethod
    def extract_users_chats(parsed_data: Any, depth: int = 0, max_depth: int = 20,
                            users: Optional[Dict] = None, chats: Optional[Dict] = None) -> Tuple[Dict, Dict]:
        if users is None:
            users = {}
        if chats is None:
            chats = {}

        if depth > max_depth:
            return users, chats

        if isinstance(parsed_data, dict):
            msg_type = parsed_data.get("_", "")

            for user in parsed_data.get("users", []):
                if isinstance(user, dict) and user.get("id"):
                    uid = user["id"]
                    users[uid] = {
                        "id": uid,
                        "first_name": user.get("first_name", ""),
                        "last_name": user.get("last_name", ""),
                        "username": user.get("username", ""),
                        "phone": user.get("phone", ""),
                        "bot": user.get("bot", False)
                    }

            for chat in parsed_data.get("chats", []):
                if isinstance(chat, dict) and chat.get("id"):
                    cid = chat["id"]
                    chats[cid] = {
                        "id": cid,
                        "title": chat.get("title", ""),
                        "username": chat.get("username", ""),
                        "broadcast": chat.get("broadcast", False),
                        "megagroup": chat.get("megagroup", False)
                    }

            for key in ["messages", "updates", "items", "result", "data"]:
                child = parsed_data.get(key)
                if child:
                    if isinstance(child, list):
                        for item in child:
                            MessageExtractor.extract_users_chats(item, depth + 1, max_depth, users, chats)
                    elif isinstance(child, dict):
                        MessageExtractor.extract_users_chats(child, depth + 1, max_depth, users, chats)

            for msg in parsed_data.get("messages", []):
                if isinstance(msg, dict):
                    body = msg.get("body")
                    if body:
                        MessageExtractor.extract_users_chats(body, depth + 1, max_depth, users, chats)

        elif isinstance(parsed_data, list):
            for item in parsed_data:
                MessageExtractor.extract_users_chats(item, depth + 1, max_depth, users, chats)

        return users, chats


def parse_tl_message(data: bytes) -> dict:
    parser = TLParser(data)
    parsed = parser.read_object()
    messages = MessageExtractor.extract_messages(parsed)
    users, chats = MessageExtractor.extract_users_chats(parsed)
    return {
        "parsed": parsed,
        "messages": messages,
        "users": users,
        "chats": chats,
        "remaining_bytes": parser.remaining()
    }
