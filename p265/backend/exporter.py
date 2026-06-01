import csv
import io
import json
from datetime import datetime
from typing import Dict, List, Any, Optional


class ChatExporter:
    @staticmethod
    def to_json(messages: List[Dict[str, Any]], users: Optional[Dict] = None,
                chats: Optional[Dict] = None, metadata: Optional[Dict] = None) -> str:
        export_data = {
            "export_info": {
                "exported_at": datetime.now().isoformat(),
                "version": "1.0",
                "tool": "MTProto Message Parser"
            },
            "metadata": metadata or {},
            "users": users or {},
            "chats": chats or {},
            "messages": []
        }

        for msg in messages:
            msg_data = ChatExporter._normalize_message(msg)
            export_data["messages"].append(msg_data)

        return json.dumps(export_data, ensure_ascii=False, indent=2, default=str)

    @staticmethod
    def to_csv(messages: List[Dict[str, Any]]) -> str:
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "id", "type", "date", "date_iso", "message",
            "out", "post", "pinned", "silent",
            "chat_type", "chat_id",
            "sender_type", "sender_id",
            "forwarded_from", "reply_to_msg_id",
            "views", "forwards", "edit_date",
            "post_author", "media_type",
            "entities"
        ])

        for msg in messages:
            msg_data = ChatExporter._normalize_message(msg)

            chat_type = msg_data.get("chat", {}).get("type", "")
            chat_id = (msg_data.get("chat", {}).get("user_id") or
                       msg_data.get("chat", {}).get("chat_id") or
                       msg_data.get("chat", {}).get("channel_id", ""))

            sender_type = msg_data.get("sender", {}).get("type", "") if msg_data.get("sender") else ""
            sender_id = ""
            if msg_data.get("sender"):
                sender_id = (msg_data["sender"].get("user_id") or
                             msg_data["sender"].get("chat_id") or
                             msg_data["sender"].get("channel_id", ""))

            fwd_from = ""
            if msg_data.get("fwd_from"):
                fwd = msg_data["fwd_from"]
                if fwd.get("from"):
                    fwd_from = f"{fwd['from'].get('type', '')}:{fwd['from'].get('user_id') or fwd['from'].get('chat_id') or fwd['from'].get('channel_id', '')}"
                elif fwd.get("channel_id"):
                    fwd_from = f"channel:{fwd['channel_id']}"

            reply_to_id = ""
            if msg_data.get("reply_to"):
                reply_to_id = msg_data["reply_to"].get("reply_to_msg_id", "")

            media_type = ""
            if msg_data.get("media"):
                media_type = msg_data["media"].get("type", "")

            entities_str = ""
            if msg_data.get("entities"):
                entity_parts = []
                for e in msg_data["entities"]:
                    entity_parts.append(f"{e.get('type', '')}[{e.get('offset', '')}:{e.get('length', '')}]")
                entities_str = "; ".join(entity_parts)

            date_iso = ""
            if msg_data.get("date"):
                try:
                    date_iso = datetime.fromtimestamp(int(msg_data["date"])).isoformat()
                except (ValueError, TypeError, OSError):
                    pass

            writer.writerow([
                msg_data.get("id", ""),
                msg_data.get("type", ""),
                msg_data.get("date", ""),
                date_iso,
                msg_data.get("message", ""),
                msg_data.get("out", False),
                msg_data.get("post", False),
                msg_data.get("pinned", False),
                msg_data.get("silent", False),
                chat_type,
                chat_id,
                sender_type,
                sender_id,
                fwd_from,
                reply_to_id,
                msg_data.get("views", ""),
                msg_data.get("forwards", ""),
                msg_data.get("edit_date", ""),
                msg_data.get("post_author", ""),
                media_type,
                entities_str
            ])

        return output.getvalue()

    @staticmethod
    def to_html(messages: List[Dict[str, Any]], users: Optional[Dict] = None,
                chats: Optional[Dict] = None, metadata: Optional[Dict] = None) -> str:
        users = users or {}
        chats = chats or {}
        metadata = metadata or {}

        chat_title = "Telegram Chat Export"
        if chats:
            first_chat = next(iter(chats.values()), None)
            if first_chat and first_chat.get("title"):
                chat_title = first_chat["title"]

        rows_html = ""
        for msg in messages:
            msg_data = ChatExporter._normalize_message(msg)

            css_class = "outgoing" if msg_data.get("out") else ("post" if msg_data.get("post") else "incoming")

            date_str = ""
            if msg_data.get("date"):
                try:
                    date_str = datetime.fromtimestamp(int(msg_data["date"])).strftime("%Y-%m-%d %H:%M:%S")
                except (ValueError, TypeError, OSError):
                    date_str = str(msg_data["date"])

            sender_name = ChatExporter._resolve_sender(msg_data, users, chats)

            fwd_html = ""
            if msg_data.get("fwd_from"):
                fwd = msg_data["fwd_from"]
                fwd_text = "Forwarded"
                if fwd.get("from"):
                    fwd_peer = fwd["from"]
                    fwd_text = f"Forwarded from {fwd_peer.get('type', '')} {fwd_peer.get('user_id') or fwd_peer.get('chat_id') or fwd_peer.get('channel_id', '')}"
                elif fwd.get("channel_id"):
                    fwd_text = f"Forwarded from channel {fwd['channel_id']}"
                if fwd.get("post_author"):
                    fwd_text += f" ({fwd['post_author']})"
                fwd_html = f'<div class="forwarded">{ChatExporter._esc(fwd_text)}</div>'

            reply_html = ""
            if msg_data.get("reply_to"):
                reply_id = msg_data["reply_to"].get("reply_to_msg_id", "")
                reply_html = f'<div class="reply">↩ Reply to #{ChatExporter._esc(str(reply_id))}</div>'

            media_html = ""
            if msg_data.get("media") and msg_data["media"].get("type", "") != "none":
                media = msg_data["media"]
                media_type = media.get("type", "").replace("message_media_", "")
                media_html = f'<div class="media">📎 {ChatExporter._esc(media_type)}'
                if media.get("mime_type"):
                    media_html += f' ({ChatExporter._esc(media["mime_type"])})'
                if media.get("url"):
                    media_html += f' - <a href="{ChatExporter._esc(media["url"])}">{ChatExporter._esc(media.get("display_url", media["url"]))}</a>'
                if media.get("title"):
                    media_html += f' - {ChatExporter._esc(media["title"])}'
                media_html += '</div>'

            action_html = ""
            if msg_data.get("type") == "message_service" and msg_data.get("action"):
                action = msg_data["action"]
                action_type = action.get("type", "").replace("message_action_", "")
                action_text = action_type
                if action.get("title"):
                    action_text += f": {action['title']}"
                action_html = f'<div class="service-message">⚙️ {ChatExporter._esc(action_text)}</div>'

            content_html = ""
            if msg_data.get("type") == "message_service":
                content_html = action_html
            else:
                text = msg_data.get("message", "")
                content_html = f'<div class="text">{ChatExporter._esc(text)}</div>'

            badges_html = ""
            if msg_data.get("pinned"):
                badges_html += '<span class="badge">📌 Pinned</span>'
            if msg_data.get("edit_date"):
                badges_html += '<span class="badge">✏️ Edited</span>'

            rows_html += f'''
            <div class="message {css_class}">
                <div class="message-header">
                    <span class="sender">{ChatExporter._esc(sender_name)}</span>
                    <span class="date">{ChatExporter._esc(date_str)}</span>
                    {badges_html}
                </div>
                {fwd_html}
                {reply_html}
                {content_html}
                {media_html}
                <div class="meta">
                    #{ChatExporter._esc(str(msg_data.get("id", "")))}
                    {f' · 👁 {msg_data["views"]}' if msg_data.get("views") else ''}
                    {f' · ↗️ {msg_data["forwards"]}' if msg_data.get("forwards") else ''}
                </div>
            </div>'''

        return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ChatExporter._esc(chat_title)}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a1a; padding: 20px; }}
        .container {{ max-width: 800px; margin: 0 auto; }}
        .header {{ background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; padding: 24px; border-radius: 12px 12px 0 0; }}
        .header h1 {{ font-size: 1.4rem; margin-bottom: 8px; }}
        .header .info {{ font-size: 0.85rem; opacity: 0.9; }}
        .messages {{ background: white; border-radius: 0 0 12px 12px; padding: 16px; }}
        .message {{ padding: 10px 14px; margin: 4px 0; border-radius: 12px; max-width: 80%; position: relative; word-wrap: break-word; }}
        .message.incoming {{ background: #f0f2f5; margin-right: auto; }}
        .message.outgoing {{ background: #e8f5e9; margin-left: auto; }}
        .message.post {{ background: #fff3e0; margin-left: auto; }}
        .message-header {{ display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }}
        .sender {{ font-weight: 600; font-size: 0.85rem; color: #6c5ce7; }}
        .date {{ font-size: 0.75rem; color: #888; }}
        .badge {{ font-size: 0.7rem; background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 4px; }}
        .forwarded {{ font-size: 0.8rem; color: #888; font-style: italic; margin-bottom: 4px; padding-left: 8px; border-left: 2px solid #ccc; }}
        .reply {{ font-size: 0.8rem; color: #6c5ce7; margin-bottom: 4px; cursor: pointer; }}
        .text {{ font-size: 0.95rem; line-height: 1.45; white-space: pre-wrap; }}
        .media {{ font-size: 0.85rem; color: #555; margin-top: 6px; padding: 6px 10px; background: rgba(0,0,0,0.03); border-radius: 6px; }}
        .media a {{ color: #6c5ce7; }}
        .service-message {{ font-size: 0.85rem; color: #888; font-style: italic; text-align: center; }}
        .meta {{ font-size: 0.7rem; color: #aaa; margin-top: 4px; }}
        .stats {{ background: white; border-radius: 12px; padding: 16px; margin-top: 12px; }}
        .stats h3 {{ font-size: 0.95rem; margin-bottom: 8px; color: #555; }}
        .stats p {{ font-size: 0.85rem; color: #888; margin: 4px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{ChatExporter._esc(chat_title)}</h1>
            <div class="info">
                Exported: {ChatExporter._esc(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))} ·
                Messages: {len(messages)}
            </div>
        </div>
        <div class="messages">
            {rows_html}
        </div>
        <div class="stats">
            <h3>Export Statistics</h3>
            <p>Total messages: {len(messages)}</p>
            <p>Regular messages: {sum(1 for m in messages if m.get('type') == 'message')}</p>
            <p>Service messages: {sum(1 for m in messages if m.get('type') == 'message_service')}</p>
            <p>Users: {len(users)}</p>
            <p>Chats/Channels: {len(chats)}</p>
        </div>
    </div>
</body>
</html>'''

    @staticmethod
    def _normalize_message(msg: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(msg)
        if "message" not in result:
            if result.get("type") == "message_service":
                result["message"] = ""
            elif result.get("type") == "message_empty":
                result["message"] = ""
            else:
                result["message"] = ""
        return result

    @staticmethod
    def _resolve_sender(msg_data: Dict, users: Dict, chats: Dict) -> str:
        sender = msg_data.get("sender")
        if not sender:
            return "Unknown"

        sender_type = sender.get("type", "")
        if sender_type == "peer_user":
            uid = sender.get("user_id")
            user = ChatExporter._lookup(uid, users)
            if user:
                name = user.get("first_name", "")
                if user.get("last_name"):
                    name += f" {user['last_name']}"
                if user.get("username"):
                    name += f" (@{user['username']})"
                return name or f"User {uid}"
            return f"User {uid}"
        elif sender_type == "peer_chat":
            cid = sender.get("chat_id")
            chat = ChatExporter._lookup(cid, chats)
            if chat:
                return chat.get("title", f"Chat {cid}")
            return f"Chat {cid}"
        elif sender_type == "peer_channel":
            cid = sender.get("channel_id")
            chat = ChatExporter._lookup(cid, chats)
            if chat:
                return chat.get("title", f"Channel {cid}")
            return f"Channel {cid}"

        return "Unknown"

    @staticmethod
    def _lookup(key, dictionary):
        if key is None:
            return None
        if key in dictionary:
            return dictionary[key]
        str_key = str(key)
        if str_key in dictionary:
            return dictionary[str_key]
        int_key = None
        try:
            int_key = int(key)
        except (ValueError, TypeError):
            pass
        if int_key is not None and int_key in dictionary:
            return dictionary[int_key]
        return None

    @staticmethod
    def _esc(text: str) -> str:
        if not text:
            return ""
        return (str(text)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#x27;"))
