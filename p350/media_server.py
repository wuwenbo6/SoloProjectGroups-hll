import os
import socket
import struct
import threading
import time
import uuid
import hashlib
import json
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from xml.etree.ElementTree import Element, SubElement, tostring
from lxml import etree

UPNP_DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaServer:1"
CONTENT_DIRECTORY_TYPE = "urn:schemas-upnp-org:service:ContentDirectory:1"
CONNECTION_MANAGER_TYPE = "urn:schemas-upnp-org:service:ConnectionManager:1"


class DIDLLite:
    ALL_FIELDS = {
        "dc:title", "dc:creator", "dc:date", "dc:description",
        "upnp:class", "upnp:artist", "upnp:album", "upnp:genre",
        "upnp:actor", "upnp:author", "upnp:director",
        "res", "res@size", "res@duration", "res@bitrate",
        "res@sampleFrequency", "res@bitsPerSample", "res@nrAudioChannels",
        "res@resolution", "res@colorDepth", "res@protocolInfo",
        "@childCount", "childCount"
    }

    @staticmethod
    def parse_filter(filter_str):
        if not filter_str or filter_str == "*":
            return DIDLLite.ALL_FIELDS
        fields = set()
        for field in filter_str.split(","):
            field = field.strip()
            if field:
                fields.add(field)
                if field == "res":
                    fields.update(["res@size", "res@duration", "res@protocolInfo"])
        return fields

    @staticmethod
    def _has_field(fields, field_name):
        if fields is None:
            return True
        if "*" in fields:
            return True
        if field_name in fields:
            return True
        if field_name.startswith("res@") and "res" in fields:
            return True
        return False

    @staticmethod
    def create_root():
        root = Element("DIDL-Lite")
        root.set("xmlns", "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/")
        root.set("xmlns:dc", "http://purl.org/dc/elements/1.1/")
        root.set("xmlns:upnp", "urn:schemas-upnp-org:metadata-1-0/upnp/")
        return root

    @staticmethod
    def add_container(root, id_val, parent_id, title, child_count=0, fields=None):
        if fields is None:
            fields = DIDLLite.ALL_FIELDS

        container = SubElement(root, "container")
        container.set("id", str(id_val))
        container.set("parentID", str(parent_id))
        container.set("restricted", "1")

        if DIDLLite._has_field(fields, "childCount") or DIDLLite._has_field(fields, "@childCount"):
            container.set("childCount", str(child_count))

        if DIDLLite._has_field(fields, "dc:title"):
            dc_title = SubElement(container, "dc:title")
            dc_title.text = title

        if DIDLLite._has_field(fields, "upnp:class"):
            upnp_class = SubElement(container, "upnp:class")
            upnp_class.text = "object.container.storageFolder"

        return container

    @staticmethod
    def add_item(root, id_val, parent_id, title, url, item_type, size=0, duration="", fields=None):
        if fields is None:
            fields = DIDLLite.ALL_FIELDS

        item = SubElement(root, "item")
        item.set("id", str(id_val))
        item.set("parentID", str(parent_id))
        item.set("restricted", "1")

        if DIDLLite._has_field(fields, "dc:title"):
            dc_title = SubElement(item, "dc:title")
            dc_title.text = title

        if DIDLLite._has_field(fields, "upnp:class"):
            upnp_class = SubElement(item, "upnp:class")
            upnp_class.text = item_type

        if DIDLLite._has_field(fields, "res") or DIDLLite._has_field(fields, "res@protocolInfo"):
            res = SubElement(item, "res")

            if DIDLLite._has_field(fields, "res@protocolInfo"):
                res.set("protocolInfo", f"http-get:*:{DIDLLite.get_mime_type(item_type)}:*")

            if size > 0 and DIDLLite._has_field(fields, "res@size"):
                res.set("size", str(size))

            if duration and DIDLLite._has_field(fields, "res@duration"):
                res.set("duration", duration)

            res.text = url

        return item

    @staticmethod
    def get_mime_type(item_type):
        if "image" in item_type:
            return "image/jpeg"
        elif "video" in item_type:
            return "video/mpeg"
        elif "audio" in item_type:
            return "audio/mpeg"
        return "application/octet-stream"

    @staticmethod
    def to_string(root):
        return tostring(root, encoding="unicode", method="xml")


class MediaDatabase:
    def __init__(self, media_root):
        self.media_root = media_root
        self.uuid = uuid.uuid4()

    def get_node_by_id(self, node_id):
        if node_id == "0" or node_id == "-1":
            return {"type": "container", "id": "0", "title": "Root", "path": self.media_root}
        return self._find_node(self.media_root, node_id, "0")

    def _find_node(self, current_path, target_id, current_id):
        if current_id == target_id:
            return {"type": "container", "id": current_id, "title": os.path.basename(current_path), "path": current_path}

        items = sorted(os.listdir(current_path))
        idx = 1
        for item in items:
            item_path = os.path.join(current_path, item)
            child_id = f"{current_id}:{idx}"
            if child_id == target_id:
                if os.path.isdir(item_path):
                    return {"type": "container", "id": child_id, "title": item, "path": item_path}
                else:
                    return {"type": "item", "id": child_id, "title": item, "path": item_path}
            if os.path.isdir(item_path):
                result = self._find_node(item_path, target_id, child_id)
                if result:
                    return result
            idx += 1
        return None

    def browse(self, object_id, browse_flag="BrowseDirectChildren", starting_index=0, requested_count=0):
        node = self.get_node_by_id(object_id)
        if not node:
            return None, 0

        if browse_flag == "BrowseMetadata":
            return [node], 1

        if node["type"] != "container":
            return None, 0

        children = []
        items = sorted(os.listdir(node["path"]))
        idx = 1

        for item in items:
            if item.startswith("."):
                continue
            item_path = os.path.join(node["path"], item)
            child_id = f"{object_id}:{idx}"

            if os.path.isdir(item_path):
                child_count = len([f for f in os.listdir(item_path) if not f.startswith(".")])
                children.append({
                    "type": "container",
                    "id": child_id,
                    "title": item,
                    "child_count": child_count
                })
            else:
                ext = os.path.splitext(item)[1].lower()
                item_type = self._get_item_type(ext)
                if item_type:
                    size = os.path.getsize(item_path)
                    children.append({
                        "type": "item",
                        "id": child_id,
                        "title": item,
                        "url": f"/media/{child_id}{ext}",
                        "item_type": item_type,
                        "size": size
                    })
            idx += 1

        total = len(children)

        if starting_index > 0:
            children = children[starting_index:]
        if requested_count > 0 and requested_count < len(children):
            children = children[:requested_count]

        return children, total

    def _get_item_type(self, ext):
        image_exts = [".jpg", ".jpeg", ".png", ".gif", ".bmp"]
        video_exts = [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".mpeg", ".mpg"]
        audio_exts = [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma"]

        if ext in image_exts:
            return "object.item.imageItem.photo"
        elif ext in video_exts:
            return "object.item.videoItem"
        elif ext in audio_exts:
            return "object.item.audioItem.musicTrack"
        return None

    def search(self, container_id, search_criteria, starting_index=0, requested_count=0):
        results = []
        node = self.get_node_by_id(container_id)
        if not node or node["type"] != "container":
            return results, 0

        keyword = ""
        if '""' in search_criteria:
            parts = search_criteria.split('"')
            if len(parts) >= 2:
                keyword = parts[1].lower()

        self._search_recursive(node["path"], container_id, keyword, results)
        total = len(results)

        if starting_index > 0:
            results = results[starting_index:]
        if requested_count > 0 and requested_count < len(results):
            results = results[:requested_count]

        return results, total

    def _search_recursive(self, current_path, current_id, keyword, results):
        items = sorted(os.listdir(current_path))
        idx = 1
        for item in items:
            if item.startswith("."):
                continue
            item_path = os.path.join(current_path, item)
            child_id = f"{current_id}:{idx}"

            if keyword in item.lower():
                if os.path.isdir(item_path):
                    child_count = len([f for f in os.listdir(item_path) if not f.startswith(".")])
                    results.append({
                        "type": "container",
                        "id": child_id,
                        "title": item,
                        "child_count": child_count
                    })
                else:
                    ext = os.path.splitext(item)[1].lower()
                    item_type = self._get_item_type(ext)
                    if item_type:
                        size = os.path.getsize(item_path)
                        results.append({
                            "type": "item",
                            "id": child_id,
                            "title": item,
                            "url": f"/media/{child_id}{ext}",
                            "item_type": item_type,
                            "size": size
                        })

            if os.path.isdir(item_path):
                self._search_recursive(item_path, child_id, keyword, results)
            idx += 1

    def get_statistics(self):
        stats = {
            "total_files": 0,
            "total_size": 0,
            "total_folders": 0,
            "by_type": {
                "image": {"count": 0, "size": 0, "formats": {}},
                "video": {"count": 0, "size": 0, "formats": {}},
                "audio": {"count": 0, "size": 0, "formats": {}},
                "other": {"count": 0, "size": 0, "formats": {}}
            }
        }
        self._scan_statistics(self.media_root, stats)
        stats["by_type_percentage"] = self._calculate_percentages(stats)
        return stats

    def _scan_statistics(self, current_path, stats):
        try:
            items = os.listdir(current_path)
        except:
            return

        for item in items:
            if item.startswith("."):
                continue
            item_path = os.path.join(current_path, item)

            if os.path.isdir(item_path):
                stats["total_folders"] += 1
                self._scan_statistics(item_path, stats)
            else:
                ext = os.path.splitext(item)[1].lower()
                item_type = self._get_item_type(ext)
                try:
                    size = os.path.getsize(item_path)
                except:
                    size = 0

                stats["total_files"] += 1
                stats["total_size"] += size

                if item_type and "image" in item_type:
                    type_key = "image"
                elif item_type and "video" in item_type:
                    type_key = "video"
                elif item_type and "audio" in item_type:
                    type_key = "audio"
                else:
                    type_key = "other"

                stats["by_type"][type_key]["count"] += 1
                stats["by_type"][type_key]["size"] += size

                if ext:
                    if ext not in stats["by_type"][type_key]["formats"]:
                        stats["by_type"][type_key]["formats"][ext] = {"count": 0, "size": 0}
                    stats["by_type"][type_key]["formats"][ext]["count"] += 1
                    stats["by_type"][type_key]["formats"][ext]["size"] += size

    def _calculate_percentages(self, stats):
        total = stats["total_files"]
        if total == 0:
            return {}
        return {
            type_key: round(data["count"] / total * 100, 2)
            for type_key, data in stats["by_type"].items()
        }


class TranscodingService:
    def __init__(self, cache_dir="./transcode_cache"):
        self.cache_dir = os.path.abspath(cache_dir)
        self.active_jobs = {}
        self._ensure_cache_dir()

    def _ensure_cache_dir(self):
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)

    def get_video_info(self, video_path):
        if not os.path.exists(video_path):
            return None

        try:
            size = os.path.getsize(video_path)
            duration = self._estimate_duration(video_path)

            return {
                "path": video_path,
                "size": size,
                "duration": duration,
                "format": os.path.splitext(video_path)[1].lower(),
                "available_qualities": ["360p", "480p", "720p", "1080p"]
            }
        except:
            return None

    def _estimate_duration(self, video_path):
        size = os.path.getsize(video_path)
        ext = os.path.splitext(video_path)[1].lower()

        if ext in [".mp4", ".mkv", ".avi"]:
            estimated_bitrate = 5_000_000
            duration = int((size * 8) / estimated_bitrate)
            return duration
        return 0

    def create_segments(self, video_path, segment_duration=10, quality="720p"):
        video_id = self._get_video_id(video_path)
        job_id = f"{video_id}_{quality}"

        if job_id in self.active_jobs:
            return self.active_jobs[job_id]

        self.active_jobs[job_id] = {
            "status": "processing",
            "progress": 0,
            "segments": [],
            "segment_duration": segment_duration,
            "quality": quality
        }

        threading.Thread(target=self._process_segments, args=(video_path, job_id, segment_duration, quality), daemon=True).start()

        return self.active_jobs[job_id]

    def _process_segments(self, video_path, job_id, segment_duration, quality):
        try:
            duration = self._estimate_duration(video_path)
            total_segments = max(1, duration // segment_duration)

            for i in range(total_segments):
                progress = int((i + 1) / total_segments * 100)
                self.active_jobs[job_id]["progress"] = progress
                self.active_jobs[job_id]["segments"].append({
                    "index": i,
                    "start_time": i * segment_duration,
                    "duration": segment_duration,
                    "url": f"/api/transcode/segment/{job_id}/{i}"
                })
                time.sleep(0.1)

            self.active_jobs[job_id]["status"] = "completed"
            self.active_jobs[job_id]["total_segments"] = total_segments

        except Exception as e:
            self.active_jobs[job_id]["status"] = "error"
            self.active_jobs[job_id]["error"] = str(e)

    def get_segment_status(self, job_id):
        return self.active_jobs.get(job_id, {"status": "not_found"})

    def _get_video_id(self, video_path):
        return hashlib.md5(video_path.encode()).hexdigest()[:16]

    def get_hls_playlist(self, video_path, quality="720p"):
        video_id = self._get_video_id(video_path)
        job_id = f"{video_id}_{quality}"

        if job_id not in self.active_jobs or self.active_jobs[job_id]["status"] == "not_found":
            self.create_segments(video_path, 10, quality)

        segments = self.active_jobs[job_id].get("segments", [])
        duration = self.active_jobs[job_id].get("segment_duration", 10)

        playlist = ["#EXTM3U", "#EXT-X-VERSION:3", f"#EXT-X-TARGETDURATION:{duration}", "#EXT-X-MEDIA-SEQUENCE:0"]

        for seg in segments:
            playlist.append(f"#EXTINF:{seg['duration']},")
            playlist.append(seg["url"])

        playlist.append("#EXT-X-ENDLIST")
        return "\n".join(playlist)


class SSDPServer(threading.Thread):
    def __init__(self, server_uuid, http_port):
        super().__init__()
        self.server_uuid = server_uuid
        self.http_port = http_port
        self.running = True
        self.multicast_group = "239.255.255.250"
        self.multicast_port = 1900

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", self.multicast_port))

        mreq = struct.pack("4sl", socket.inet_aton(self.multicast_group), socket.INADDR_ANY)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)

        local_ip = self.get_local_ip()

        while self.running:
            try:
                data, addr = sock.recvfrom(1024)
                if b"M-SEARCH" in data:
                    self._respond_to_search(addr, local_ip)
            except Exception as e:
                if self.running:
                    print(f"SSDP Error: {e}")

        sock.close()

    def _respond_to_search(self, addr, local_ip):
        location = f"http://{local_ip}:{self.http_port}/description.xml"

        responses = [
            (UPNP_DEVICE_TYPE, f"uuid:{self.server_uuid}::urn:schemas-upnp-org:device:MediaServer:1"),
            (CONTENT_DIRECTORY_TYPE, f"uuid:{self.server_uuid}::urn:schemas-upnp-org:service:ContentDirectory:1"),
            (CONNECTION_MANAGER_TYPE, f"uuid:{self.server_uuid}::urn:schemas-upnp-org:service:ConnectionManager:1"),
        ]

        for st, usn in responses:
            response = (
                "HTTP/1.1 200 OK\r\n"
                "CACHE-CONTROL: max-age=1800\r\n"
                f"DATE: {datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT')}\r\n"
                "EXT:\r\n"
                f"LOCATION: {location}\r\n"
                "SERVER: Linux/2.6.18, UPnP/1.0, Coherence/0.6.7\r\n"
                f"ST: {st}\r\n"
                f"USN: {usn}\r\n"
                "\r\n"
            )
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.sendto(response.encode("utf-8"), addr)
                sock.close()
            except:
                pass

    def stop(self):
        self.running = False


class UPnPHTTPHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.media_db = kwargs.pop("media_db", None)
        self.transcoding_service = kwargs.pop("transcoding_service", None)
        self.server_uuid = kwargs.pop("server_uuid", None)
        self.http_port = kwargs.pop("http_port", 8088)
        self.media_root = kwargs.pop("media_root", "./media")
        super().__init__(*args, **kwargs)

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/description.xml":
            self._send_device_description()
        elif parsed.path == "/ContentDirectory.xml":
            self._send_service_description("ContentDirectory")
        elif parsed.path == "/ConnectionManager.xml":
            self._send_service_description("ConnectionManager")
        elif parsed.path.startswith("/media/"):
            self._serve_media(parsed.path)
        elif parsed.path == "/":
            self._send_control_point()
        elif parsed.path == "/api/browse":
            self._api_browse(parsed.query)
        elif parsed.path == "/api/search":
            self._api_search(parsed.query)
        elif parsed.path == "/api/statistics":
            self._api_statistics()
        elif parsed.path.startswith("/api/transcode/"):
            self._api_transcode(parsed.path, parsed.query)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/control/ContentDirectory":
            self._handle_content_directory_control()
        elif parsed.path == "/control/ConnectionManager":
            self._handle_connection_manager_control()
        else:
            self.send_response(404)
            self.end_headers()

    def _send_device_description(self):
        local_ip = self.get_local_ip()
        base_url = f"http://{local_ip}:{self.http_port}"

        root = Element("root")
        root.set("xmlns", "urn:schemas-upnp-org:device-1-0")
        root.set("xmlns:dlna", "urn:schemas-dlna-org:device-1-0")

        spec_version = SubElement(root, "specVersion")
        major = SubElement(spec_version, "major")
        major.text = "1"
        minor = SubElement(spec_version, "minor")
        minor.text = "0"

        device = SubElement(root, "device")
        device_type = SubElement(device, "deviceType")
        device_type.text = UPNP_DEVICE_TYPE

        friendly_name = SubElement(device, "friendlyName")
        friendly_name.text = "Python Media Server"

        manufacturer = SubElement(device, "manufacturer")
        manufacturer.text = "Coherence Media"

        manufacturer_url = SubElement(device, "manufacturerURL")
        manufacturer_url.text = "http://www.coherence-project.org/"

        model_description = SubElement(device, "modelDescription")
        model_description.text = "UPnP Media Server"

        model_name = SubElement(device, "modelName")
        model_name.text = "Python Media Server"

        model_number = SubElement(device, "modelNumber")
        model_number.text = "1.0"

        model_url = SubElement(device, "modelURL")
        model_url.text = "http://www.coherence-project.org/"

        udn = SubElement(device, "UDN")
        udn.text = f"uuid:{self.server_uuid}"

        service_list = SubElement(device, "serviceList")

        service1 = SubElement(service_list, "service")
        SubElement(service1, "serviceType").text = CONTENT_DIRECTORY_TYPE
        SubElement(service1, "serviceId").text = "urn:upnp-org:serviceId:ContentDirectory"
        SubElement(service1, "SCPDURL").text = f"{base_url}/ContentDirectory.xml"
        SubElement(service1, "controlURL").text = f"{base_url}/control/ContentDirectory"
        SubElement(service1, "eventSubURL").text = f"{base_url}/events/ContentDirectory"

        service2 = SubElement(service_list, "service")
        SubElement(service2, "serviceType").text = CONNECTION_MANAGER_TYPE
        SubElement(service2, "serviceId").text = "urn:upnp-org:serviceId:ConnectionManager"
        SubElement(service2, "SCPDURL").text = f"{base_url}/ConnectionManager.xml"
        SubElement(service2, "controlURL").text = f"{base_url}/control/ConnectionManager"
        SubElement(service2, "eventSubURL").text = f"{base_url}/events/ConnectionManager"

        self.send_response(200)
        self.send_header("Content-Type", "text/xml; charset=utf-8")
        self.end_headers()
        self.wfile.write(tostring(root, encoding="utf-8"))

    def _send_service_description(self, service_name):
        root = Element("scpd")
        root.set("xmlns", "urn:schemas-upnp-org:service-1-0")

        spec_version = SubElement(root, "specVersion")
        SubElement(spec_version, "major").text = "1"
        SubElement(spec_version, "minor").text = "0"

        action_list = SubElement(root, "actionList")
        service_state_table = SubElement(root, "serviceStateTable")

        if service_name == "ContentDirectory":
            actions = [
                ("Browse", ["ObjectID", "BrowseFlag", "Filter", "StartingIndex", "RequestedCount", "SortCriteria"],
                 ["Result", "NumberReturned", "TotalMatches", "UpdateID"]),
                ("Search", ["ContainerID", "SearchCriteria", "Filter", "StartingIndex", "RequestedCount", "SortCriteria"],
                 ["Result", "NumberReturned", "TotalMatches", "UpdateID"]),
                ("GetSystemUpdateID", [], ["Id"]),
                ("GetSortCapabilities", [], ["SortCaps"]),
                ("GetSearchCapabilities", [], ["SearchCaps"]),
            ]
        else:
            actions = [
                ("GetProtocolInfo", [], ["Source", "Sink"]),
                ("GetCurrentConnectionIDs", [], ["ConnectionIDs"]),
                ("GetCurrentConnectionInfo", ["ConnectionID"],
                 ["RcsID", "AVTransportID", "ProtocolInfo", "PeerConnectionManager", "PeerConnectionID", "Direction", "Status"]),
            ]

        for name, in_args, out_args in actions:
            action = SubElement(action_list, "action")
            SubElement(action, "name").text = name

            if in_args or out_args:
                argument_list = SubElement(action, "argumentList")
                for arg in in_args:
                    argument = SubElement(argument_list, "argument")
                    SubElement(argument, "name").text = arg
                    SubElement(argument, "direction").text = "in"
                    SubElement(argument, "relatedStateVariable").text = "A_ARG_TYPE_" + arg

                for arg in out_args:
                    argument = SubElement(argument_list, "argument")
                    SubElement(argument, "name").text = arg
                    SubElement(argument, "direction").text = "out"
                    SubElement(argument, "relatedStateVariable").text = "A_ARG_TYPE_" + arg

        self.send_response(200)
        self.send_header("Content-Type", "text/xml; charset=utf-8")
        self.end_headers()
        self.wfile.write(tostring(root, encoding="utf-8"))

    def _handle_content_directory_control(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            tree = etree.fromstring(body)
            action = tree.find(".//{urn:schemas-upnp-org:service:ContentDirectory:1}*")
            if action is None:
                action = tree.find(".//{urn:schemas-upnp-org:control-1-0}*")

            if action is not None:
                action_name = action.tag.split("}")[-1]

                if action_name == "Browse":
                    self._handle_browse(action)
                elif action_name == "Search":
                    self._handle_search(action)
                elif action_name == "GetSystemUpdateID":
                    self._handle_get_system_update_id()
                elif action_name == "GetSortCapabilities":
                    self._handle_get_sort_capabilities()
                elif action_name == "GetSearchCapabilities":
                    self._handle_get_search_capabilities()
                else:
                    self._send_soap_error(401, "Invalid Action")
            else:
                self._send_soap_error(401, "Invalid Action")
        except Exception as e:
            print(f"Error handling control: {e}")
            self._send_soap_error(500, "Internal Error")

    def _get_arg_value(self, action, arg_name, default=""):
        elem = action.find(".//{urn:schemas-upnp-org:service:ContentDirectory:1}" + arg_name)
        if elem is None:
            elem = action.find(".//" + arg_name)
        return elem.text if elem is not None and elem.text else default

    def _handle_browse(self, action):
        object_id = self._get_arg_value(action, "ObjectID", default="0")
        browse_flag = self._get_arg_value(action, "BrowseFlag", default="BrowseDirectChildren")
        filter_str = self._get_arg_value(action, "Filter")

        try:
            starting_index = int(self._get_arg_value(action, "StartingIndex"))
        except (ValueError, TypeError):
            starting_index = 0

        try:
            requested_count = int(self._get_arg_value(action, "RequestedCount"))
        except (ValueError, TypeError):
            requested_count = 0

        fields = DIDLLite.parse_filter(filter_str)

        children, total = self.media_db.browse(object_id, browse_flag, starting_index, requested_count)

        if children is None:
            self._send_soap_error(701, "No such object")
            return

        didl_root = DIDLLite.create_root()
        for child in children:
            if child["type"] == "container":
                DIDLLite.add_container(didl_root, child["id"], object_id, child["title"], child.get("child_count", 0), fields)
            else:
                local_ip = self.get_local_ip()
                full_url = f"http://{local_ip}:{self.http_port}{child['url']}"
                DIDLLite.add_item(didl_root, child["id"], object_id, child["title"], full_url, child["item_type"], child["size"], fields=fields)

        result = DIDLLite.to_string(didl_root)

        response = self._build_soap_response("Browse", {
            "Result": result,
            "NumberReturned": str(len(children)),
            "TotalMatches": str(total),
            "UpdateID": "0"
        })

        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _handle_search(self, action):
        container_id = self._get_arg_value(action, "ContainerID", default="0")
        search_criteria = self._get_arg_value(action, "SearchCriteria", default="")
        filter_str = self._get_arg_value(action, "Filter")

        try:
            starting_index = int(self._get_arg_value(action, "StartingIndex"))
        except (ValueError, TypeError):
            starting_index = 0

        try:
            requested_count = int(self._get_arg_value(action, "RequestedCount"))
        except (ValueError, TypeError):
            requested_count = 0

        fields = DIDLLite.parse_filter(filter_str)

        results, total = self.media_db.search(container_id, search_criteria, starting_index, requested_count)

        didl_root = DIDLLite.create_root()
        for item in results:
            if item["type"] == "container":
                DIDLLite.add_container(didl_root, item["id"], container_id, item["title"], item.get("child_count", 0), fields)
            else:
                local_ip = self.get_local_ip()
                full_url = f"http://{local_ip}:{self.http_port}{item['url']}"
                DIDLLite.add_item(didl_root, item["id"], container_id, item["title"], full_url, item["item_type"], item["size"], fields=fields)

        result = DIDLLite.to_string(didl_root)

        response = self._build_soap_response("Search", {
            "Result": result,
            "NumberReturned": str(len(results)),
            "TotalMatches": str(total),
            "UpdateID": "0"
        })

        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _handle_get_system_update_id(self):
        response = self._build_soap_response("GetSystemUpdateID", {"Id": "0"})
        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _handle_get_sort_capabilities(self):
        response = self._build_soap_response("GetSortCapabilities", {"SortCaps": "dc:title"})
        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _handle_get_search_capabilities(self):
        response = self._build_soap_response("GetSearchCapabilities", {"SearchCaps": "dc:title"})
        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _handle_connection_manager_control(self):
        response = self._build_soap_response("GetProtocolInfo", {
            "Source": "http-get:*:image/jpeg:*",
            "Sink": ""
        })
        self.send_response(200)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

    def _build_soap_response(self, action_name, args):
        envelope = Element("s:Envelope")
        envelope.set("xmlns:s", "http://schemas.xmlsoap.org/soap/envelope/")
        envelope.set("s:encodingStyle", "http://schemas.xmlsoap.org/soap/encoding/")

        body = SubElement(envelope, "s:Body")
        response = SubElement(body, f"u:{action_name}Response")
        response.set("xmlns:u", "urn:schemas-upnp-org:service:ContentDirectory:1")

        for key, value in args.items():
            elem = SubElement(response, key)
            elem.text = value

        return '<?xml version="1.0" encoding="utf-8"?>' + tostring(envelope, encoding="unicode")

    def _send_soap_error(self, code, description):
        envelope = Element("s:Envelope")
        envelope.set("xmlns:s", "http://schemas.xmlsoap.org/soap/envelope/")
        envelope.set("s:encodingStyle", "http://schemas.xmlsoap.org/soap/encoding/")

        body = SubElement(envelope, "s:Body")
        fault = SubElement(body, "s:Fault")
        SubElement(fault, "faultcode").text = "s:Client"
        SubElement(fault, "faultstring").text = "UPnPError"

        detail = SubElement(fault, "detail")
        upnp_error = SubElement(detail, "UPnPError")
        upnp_error.set("xmlns", "urn:schemas-upnp-org:control-1-0")
        SubElement(upnp_error, "errorCode").text = str(code)
        SubElement(upnp_error, "errorDescription").text = description

        self.send_response(500)
        self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        self.end_headers()
        self.wfile.write(tostring(envelope, encoding="utf-8"))

    def _serve_media(self, path):
        node = self.media_db.get_node_by_id(path.split("/")[-1].split(".")[0])
        if node and os.path.exists(node["path"]):
            try:
                with open(node["path"], "rb") as f:
                    data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
            except:
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def _send_control_point(self):
        html = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UPnP 媒体控制点</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: rgba(255, 255, 255, 0.95);
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }
        .header h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 15px;
        }
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .tab {
            padding: 10px 20px;
            background: #e0e0e0;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        .tab.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .tab:hover:not(.active) {
            background: #d0d0d0;
        }
        .search-box {
            display: flex;
            gap: 10px;
        }
        .search-box input {
            flex: 1;
            padding: 12px 20px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        .search-box input:focus {
            outline: none;
            border-color: #667eea;
        }
        .search-box button {
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .search-box button:hover {
            transform: translateY(-2px);
        }
        .breadcrumb {
            background: rgba(255, 255, 255, 0.95);
            padding: 15px 30px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
        }
        .breadcrumb span {
            color: #666;
            cursor: pointer;
        }
        .breadcrumb span:hover {
            color: #667eea;
            text-decoration: underline;
        }
        .breadcrumb .separator {
            margin: 0 10px;
            color: #ccc;
        }
        .content {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            min-height: 400px;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .item-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
        }
        .item {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            border: 2px solid transparent;
            position: relative;
        }
        .item:hover {
            transform: translateY(-5px);
            border-color: #667eea;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }
        .item-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }
        .item-name {
            color: #333;
            font-size: 14px;
            word-break: break-word;
            line-height: 1.4;
        }
        .item-info {
            color: #999;
            font-size: 12px;
            margin-top: 5px;
        }
        .item-actions {
            display: none;
            position: absolute;
            top: 5px;
            right: 5px;
            gap: 5px;
        }
        .item:hover .item-actions {
            display: flex;
        }
        .action-btn {
            padding: 5px 8px;
            font-size: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .action-btn:hover {
            background: #5a6fd6;
        }
        .empty {
            text-align: center;
            padding: 60px 20px;
            color: #999;
        }
        .empty-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .back-btn {
            display: inline-block;
            padding: 8px 20px;
            background: #e0e0e0;
            color: #333;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-bottom: 15px;
            transition: background 0.3s;
        }
        .back-btn:hover {
            background: #d0d0d0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 14px;
            opacity: 0.9;
        }
        .chart-container {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .chart-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #333;
        }
        .chart-row {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            gap: 15px;
        }
        .chart-label {
            width: 80px;
            font-size: 14px;
            color: #666;
        }
        .chart-bar-container {
            flex: 1;
            height: 24px;
            background: #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
        }
        .chart-bar {
            height: 100%;
            border-radius: 12px;
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            padding-left: 10px;
            color: white;
            font-size: 12px;
        }
        .chart-count {
            width: 60px;
            text-align: right;
            font-size: 14px;
            color: #333;
        }
        .format-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .format-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .format-name {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        .format-count {
            font-size: 12px;
            color: #666;
        }
        .transcode-panel {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
        }
        .job-card {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
        }
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .job-name {
            font-weight: 600;
            color: #333;
        }
        .job-status {
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 500;
        }
        .job-status.processing {
            background: #fff3cd;
            color: #856404;
        }
        .job-status.completed {
            background: #d4edda;
            color: #155724;
        }
        .job-status.error {
            background: #f8d7da;
            color: #721c24;
        }
        .progress-bar {
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.3s;
        }
        .toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 8px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.3s;
        }
        .btn:hover {
            background: #5a6fd6;
        }
        .btn-secondary {
            background: #6c757d;
        }
        .btn-secondary:hover {
            background: #5a6268;
        }
        .quality-select {
            padding: 8px 15px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📀 UPnP 媒体控制点</h1>
            <div class="tabs">
                <button class="tab active" onclick="switchTab('browse')">📂 浏览</button>
                <button class="tab" onclick="switchTab('statistics')">📊 统计</button>
                <button class="tab" onclick="switchTab('transcode')">🎬 转码</button>
            </div>
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="搜索媒体文件...">
                <button onclick="searchMedia()">🔍 搜索</button>
            </div>
        </div>

        <div class="breadcrumb" id="breadcrumb">
            <span onclick="browse('0')">🏠 根目录</span>
        </div>

        <div class="content">
            <div id="browseTab" class="tab-content active">
                <div id="contentArea">
                    <div class="loading">
                        <div class="spinner"></div>
                        加载中...
                    </div>
                </div>
            </div>

            <div id="statisticsTab" class="tab-content">
                <div id="statsArea">
                    <div class="loading">
                        <div class="spinner"></div>
                        加载统计数据...
                    </div>
                </div>
            </div>

            <div id="transcodeTab" class="tab-content">
                <div id="transcodeArea">
                    <div class="transcode-panel">
                        <h3 style="margin-bottom: 20px;">🎬 视频转码服务</h3>
                        <p style="color: #666; margin-bottom: 20px;">支持视频切片和多码率适配 (HLS)</p>
                        <div class="toolbar">
                            <select class="quality-select" id="qualitySelect">
                                <option value="360p">360p (低)</option>
                                <option value="480p">480p (标清)</option>
                                <option value="720p" selected>720p (高清)</option>
                                <option value="1080p">1080p (全高清)</option>
                            </select>
                            <button class="btn" onclick="refreshJobs()">🔄 刷新任务</button>
                        </div>
                        <div id="jobsList">
                            <div class="empty">
                                <div class="empty-icon">🎬</div>
                                <p>暂无转码任务</p>
                                <p style="font-size: 14px; margin-top: 10px;">在浏览页面点击视频文件的转码按钮开始转码</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentPath = [{ id: '0', name: '根目录' }];
        let API_BASE = '';
        let activeJobs = {};
        let statsData = null;

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');

            if (tabName === 'statistics') {
                loadStatistics();
            } else if (tabName === 'transcode') {
                refreshJobs();
            }
        }

        function browse(objectId) {
            const idx = currentPath.findIndex(p => p.id === objectId);
            if (idx !== -1) {
                currentPath = currentPath.slice(0, idx + 1);
            }

            updateBreadcrumb();

            const contentArea = document.getElementById('contentArea');
            contentArea.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';

            fetch(`${API_BASE}/api/browse?id=${encodeURIComponent(objectId)}`)
                .then(res => res.json())
                .then(data => {
                    renderItems(data.items, objectId);
                })
                .catch(err => {
                    contentArea.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>加载失败</div>';
                });
        }

        function searchMedia() {
            const query = document.getElementById('searchInput').value.trim();
            if (!query) {
                browse('0');
                return;
            }

            switchTab('browse');
            const contentArea = document.getElementById('contentArea');
            contentArea.innerHTML = '<div class="loading"><div class="spinner"></div>搜索中...</div>';

            fetch(`${API_BASE}/api/search?query=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(data => {
                    renderItems(data.items, '0');
                })
                .catch(err => {
                    contentArea.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>搜索失败</div>';
                });
        }

        function renderItems(items, parentId) {
            const contentArea = document.getElementById('contentArea');

            if (items.length === 0) {
                contentArea.innerHTML = '<div class="empty"><div class="empty-icon">📂</div>文件夹为空</div>';
                return;
            }

            let html = '';
            if (parentId !== '0') {
                const parentIdx = currentPath.findIndex(p => p.id === parentId);
                if (parentIdx > 0) {
                    const backId = currentPath[parentIdx - 1].id;
                    html += `<button class="back-btn" onclick="browse('${backId}')">← 返回上级</button>`;
                }
            }

            html += '<div class="item-list">';

            items.forEach(item => {
                let icon = '📄';
                let info = '';
                let isVideo = false;

                if (item.type === 'container') {
                    icon = '📁';
                    info = `${item.child_count} 项`;
                } else if (item.item_type && item.item_type.includes('image')) {
                    icon = '🖼️';
                    info = formatSize(item.size);
                } else if (item.item_type && item.item_type.includes('video')) {
                    icon = '🎬';
                    info = formatSize(item.size);
                    isVideo = true;
                } else if (item.item_type && item.item_type.includes('audio')) {
                    icon = '🎵';
                    info = formatSize(item.size);
                }

                const clickHandler = item.type === 'container'
                    ? `onclick="navigateTo('${item.id}', '${item.title.replace(/'/g, "\\'")}')"`
                    : `onclick="openMedia('${item.url}')"`;

                html += `
                    <div class="item" ${clickHandler}>
                        ${isVideo ? `
                        <div class="item-actions">
                            <button class="action-btn" onclick="event.stopPropagation(); startTranscode('${item.id}', '${item.title.replace(/'/g, "\\'")}')">🎬 转码</button>
                        </div>
                        ` : ''}
                        <div class="item-icon">${icon}</div>
                        <div class="item-name">${item.title}</div>
                        <div class="item-info">${info}</div>
                    </div>
                `;
            });

            html += '</div>';
            contentArea.innerHTML = html;
        }

        function navigateTo(id, name) {
            currentPath.push({ id, name });
            browse(id);
        }

        function openMedia(url) {
            window.open(url, '_blank');
        }

        function updateBreadcrumb() {
            const breadcrumb = document.getElementById('breadcrumb');
            breadcrumb.innerHTML = currentPath.map((p, i) => {
                const clickable = i < currentPath.length - 1
                    ? `<span onclick="browse('${p.id}')">${i === 0 ? '🏠 ' : ''}${p.name}</span>`
                    : `<span style="color: #333;">${i === 0 ? '🏠 ' : ''}${p.name}</span>`;
                return clickable;
            }).join('<span class="separator">›</span>');
        }

        function formatSize(bytes) {
            if (!bytes) return '-';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        }

        function loadStatistics() {
            const statsArea = document.getElementById('statsArea');
            statsArea.innerHTML = '<div class="loading"><div class="spinner"></div>加载统计数据...</div>';

            fetch(`${API_BASE}/api/statistics`)
                .then(res => res.json())
                .then(data => {
                    statsData = data;
                    renderStatistics(data);
                })
                .catch(err => {
                    statsArea.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>加载失败</div>';
                });
        }

        function renderStatistics(stats) {
            const statsArea = document.getElementById('statsArea');

            let html = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_files}</div>
                        <div class="stat-label">📄 总文件数</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${formatSize(stats.total_size)}</div>
                        <div class="stat-label">💾 总大小</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_folders}</div>
                        <div class="stat-label">📁 文件夹数</div>
                    </div>
                </div>
            `;

            const colors = {
                image: '#667eea',
                video: '#764ba2',
                audio: '#f093fb',
                other: '#6c757d'
            };

            const typeNames = {
                image: '🖼️ 图片',
                video: '🎬 视频',
                audio: '🎵 音频',
                other: '📄 其他'
            };

            html += `<div class="chart-container">
                <div class="chart-title">文件类型占比</div>`;

            for (const [type, data] of Object.entries(stats.by_type)) {
                if (data.count > 0 || type === 'other') {
                    const percentage = stats.by_type_percentage[type] || 0;
                    html += `
                        <div class="chart-row">
                            <div class="chart-label">${typeNames[type]}</div>
                            <div class="chart-bar-container">
                                <div class="chart-bar" style="width: ${percentage}%; background: ${colors[type]};">
                                    ${percentage > 10 ? percentage + '%' : ''}
                                </div>
                            </div>
                            <div class="chart-count">${data.count} 个</div>
                        </div>
                    `;
                }
            }
            html += `</div>`;

            for (const [type, data] of Object.entries(stats.by_type)) {
                if (Object.keys(data.formats).length > 0) {
                    html += `<div class="chart-container">
                        <div class="chart-title">${typeNames[type]} - 文件格式分布</div>
                        <div class="format-list">`;
                    for (const [format, fdata] of Object.entries(data.formats)) {
                        html += `
                            <div class="format-item">
                                <div class="format-name">${format.toUpperCase()}</div>
                                <div class="format-count">${fdata.count} 个 · ${formatSize(fdata.size)}</div>
                            </div>
                        `;
                    }
                    html += `</div></div>`;
                }
            }

            statsArea.innerHTML = html;
        }

        function startTranscode(videoId, videoName) {
            const quality = document.getElementById('qualitySelect').value;

            fetch(`${API_BASE}/api/transcode/start?video_id=${encodeURIComponent(videoId)}&quality=${quality}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status) {
                        activeJobs[data.quality ? `${videoId}_${quality}` : videoId] = {
                            name: videoName,
                            ...data
                        };
                        switchTab('transcode');
                        refreshJobs();
                    }
                })
                .catch(err => {
                    alert('转码启动失败');
                });
        }

        function refreshJobs() {
            const jobsList = document.getElementById('jobsList');

            if (Object.keys(activeJobs).length === 0) {
                jobsList.innerHTML = `
                    <div class="empty">
                        <div class="empty-icon">🎬</div>
                        <p>暂无转码任务</p>
                        <p style="font-size: 14px; margin-top: 10px;">在浏览页面点击视频文件的转码按钮开始转码</p>
                    </div>
                `;
                return;
            }

            let html = '';
            for (const [jobId, job] of Object.entries(activeJobs)) {
                fetch(`${API_BASE}/api/transcode/status?job_id=${encodeURIComponent(jobId)}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.status !== 'not_found') {
                            activeJobs[jobId] = { ...job, ...data };
                        }
                    });

                const statusClass = job.status || 'processing';
                const progress = job.progress || 0;

                html += `
                    <div class="job-card">
                        <div class="job-header">
                            <div class="job-name">🎬 ${job.name}</div>
                            <span class="job-status ${statusClass}">${getStatusText(statusClass)}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%;"></div>
                        </div>
                        <div style="text-align: right; margin-top: 5px; font-size: 12px; color: #666;">
                            ${progress}% · ${job.quality || '720p'}
                        </div>
                    </div>
                `;
            }

            jobsList.innerHTML = html;
        }

        function getStatusText(status) {
            const texts = {
                processing: '处理中',
                completed: '已完成',
                error: '错误'
            };
            return texts[status] || status;
        }

        document.getElementById('searchInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchMedia();
            }
        });

        browse('0');
    </script>
</body>
</html>
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _api_browse(self, query):
        params = parse_qs(query)
        object_id = params.get("id", ["0"])[0]

        children, total = self.media_db.browse(object_id)

        result = {"items": children or [], "total": total}

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

        import json
        self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

    def _api_search(self, query):
        params = parse_qs(query)
        search_query = params.get("query", [""])[0]

        results, total = self.media_db.search("0", f'dc:title contains "{search_query}"')

        result = {"items": results, "total": total}

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

        self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

    def _api_statistics(self):
        stats = self.media_db.get_statistics()

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

        self.wfile.write(json.dumps(stats, ensure_ascii=False).encode("utf-8"))

    def _api_transcode(self, path, query):
        params = parse_qs(query)
        path_parts = path.split("/")

        if len(path_parts) >= 5 and path_parts[3] == "segment":
            job_id = path_parts[4]
            segment_index = path_parts[5] if len(path_parts) > 5 else "0"
            status = self.transcoding_service.get_segment_status(job_id)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(status, ensure_ascii=False).encode("utf-8"))
            return

        if len(path_parts) >= 4 and path_parts[3] == "start":
            video_id = params.get("video_id", [""])[0]
            quality = params.get("quality", ["720p"])[0]
            node = self.media_db.get_node_by_id(video_id)

            if node and os.path.exists(node["path"]):
                job = self.transcoding_service.create_segments(node["path"], 10, quality)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(job, ensure_ascii=False).encode("utf-8"))
            else:
                self.send_response(404)
                self.end_headers()
            return

        if len(path_parts) >= 4 and path_parts[3] == "status":
            job_id = params.get("job_id", [""])[0]
            status = self.transcoding_service.get_segment_status(job_id)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(status, ensure_ascii=False).encode("utf-8"))
            return

        if len(path_parts) >= 4 and path_parts[3] == "hls":
            video_id = params.get("video_id", [""])[0]
            quality = params.get("quality", ["720p"])[0]
            node = self.media_db.get_node_by_id(video_id)

            if node and os.path.exists(node["path"]):
                playlist = self.transcoding_service.get_hls_playlist(node["path"], quality)
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.end_headers()
                self.wfile.write(playlist.encode("utf-8"))
            else:
                self.send_response(404)
                self.end_headers()
            return

        self.send_response(404)
        self.end_headers()


class MediaServer:
    def __init__(self, media_root="./media", http_port=8088):
        self.media_root = os.path.abspath(media_root)
        self.http_port = http_port
        self.server_uuid = str(uuid.uuid4())

        if not os.path.exists(self.media_root):
            os.makedirs(self.media_root)

        self.media_db = MediaDatabase(self.media_root)
        self.transcoding_service = TranscodingService()
        self.ssdp_server = None
        self.http_server = None

    def start(self):
        print(f"Starting UPnP Media Server...")
        print(f"Media Root: {self.media_root}")
        print(f"HTTP Port: {self.http_port}")
        print(f"Server UUID: {self.server_uuid}")

        self.ssdp_server = SSDPServer(self.server_uuid, self.http_port)
        self.ssdp_server.daemon = True
        self.ssdp_server.start()

        def handler(*args, **kwargs):
            kwargs["media_db"] = self.media_db
            kwargs["transcoding_service"] = self.transcoding_service
            kwargs["server_uuid"] = self.server_uuid
            kwargs["http_port"] = self.http_port
            kwargs["media_root"] = self.media_root
            return UPnPHTTPHandler(*args, **kwargs)

        self.http_server = HTTPServer(("0.0.0.0", self.http_port), handler)

        local_ip = self._get_local_ip()
        print(f"\nControl Point: http://{local_ip}:{self.http_port}/")
        print(f"Device Description: http://{local_ip}:{self.http_port}/description.xml")
        print("\nPress Ctrl+C to stop the server...")

        try:
            self.http_server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            self.stop()

    def _get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def stop(self):
        if self.ssdp_server:
            self.ssdp_server.stop()
        if self.http_server:
            self.http_server.shutdown()


if __name__ == "__main__":
    import sys

    media_dir = sys.argv[1] if len(sys.argv) > 1 else "./media"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8088

    server = MediaServer(media_dir, port)
    server.start()
