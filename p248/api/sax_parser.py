from __future__ import annotations
from io import BytesIO
import xml.sax
import xml.sax.handler
from mpd_data import (
    MPDData, Period, AdaptationSet, Representation,
    SegmentTemplate, SegmentTimeline, SElement,
    ContentProtection, ContentComponent, BaseURL
)

NS = "urn:mpeg:dash:schema:mpd:2011"
NS_PREFIX = "{" + NS + "}"


class MPDHandler(xml.sax.handler.ContentHandler):
    def __init__(self):
        super().__init__()
        self.mpd_data = MPDData()
        self._stack = []
        self._current_text = []

    def startElementNS(self, name, qname, attrs):
        if name[0] != NS:
            return

        local = name[1]
        attr_map = {}
        for attr_name, value in attrs.items():
            if isinstance(attr_name, tuple):
                attr_map[attr_name[1]] = value
            else:
                attr_map[attr_name] = value

        self._current_text = []

        if local == "MPD":
            self.mpd_data.type = attr_map.get("type", "static")
            self.mpd_data.mediaPresentationDuration = attr_map.get("mediaPresentationDuration")
            self.mpd_data.minimumUpdatePeriod = attr_map.get("minimumUpdatePeriod")
            self.mpd_data.profiles = attr_map.get("profiles")
            self._stack.append(("MPD", self.mpd_data))

        elif local == "Period":
            period = Period(
                start=attr_map.get("start"),
                duration=attr_map.get("duration")
            )
            self.mpd_data.periods.append(period)
            self._stack.append(("Period", period))

        elif local == "AdaptationSet":
            aset = AdaptationSet(
                id=attr_map.get("id"),
                mimeType=attr_map.get("mimeType"),
                contentType=attr_map.get("contentType"),
                codecs=attr_map.get("codecs"),
                par=attr_map.get("par")
            )
            if self._stack and self._stack[-1][0] == "Period":
                self._stack[-1][1].adaptation_sets.append(aset)
            self._stack.append(("AdaptationSet", aset))

        elif local == "Representation":
            rep = Representation(
                id=attr_map.get("id"),
                bandwidth=attr_map.get("bandwidth"),
                width=attr_map.get("width"),
                height=attr_map.get("height"),
                frameRate=attr_map.get("frameRate"),
                audioSamplingRate=attr_map.get("audioSamplingRate"),
                codecs=attr_map.get("codecs"),
                mimeType=attr_map.get("mimeType")
            )
            if self._stack and self._stack[-1][0] == "AdaptationSet":
                self._stack[-1][1].representations.append(rep)
            self._stack.append(("Representation", rep))

        elif local == "SegmentTemplate":
            st = SegmentTemplate(
                media=attr_map.get("media"),
                index=attr_map.get("index"),
                initialization=attr_map.get("initialization"),
                timescale=attr_map.get("timescale"),
                startNumber=attr_map.get("startNumber"),
                duration=attr_map.get("duration")
            )
            for item in reversed(self._stack):
                if item[0] in ("Representation", "AdaptationSet"):
                    item[1].segment_template = st
                    break
            self._stack.append(("SegmentTemplate", st))

        elif local == "SegmentTimeline":
            tl = SegmentTimeline()
            for item in reversed(self._stack):
                if item[0] == "SegmentTemplate":
                    item[1].segment_timeline = tl
                    break
            self._stack.append(("SegmentTimeline", tl))

        elif local == "S":
            se = SElement(
                t=attr_map.get("t"),
                d=attr_map.get("d")
            )
            for item in reversed(self._stack):
                if item[0] == "SegmentTimeline":
                    item[1].elements.append(se)
                    break
            self._stack.append(("S", se))

        elif local == "ContentProtection":
            cp = ContentProtection(
                schemeIdUri=attr_map.get("schemeIdUri")
            )
            for item in reversed(self._stack):
                if item[0] == "Representation":
                    item[1].content_protections.append(cp)
                elif item[0] == "AdaptationSet":
                    item[1].content_protections.append(cp)
                elif item[0] == "MPD":
                    item[1].content_protections.append(cp)
                else:
                    continue
                break
            self._stack.append(("ContentProtection", cp))

        elif local == "ContentComponent":
            cc = ContentComponent(
                contentType=attr_map.get("contentType")
            )
            for item in reversed(self._stack):
                if item[0] == "AdaptationSet":
                    item[1].content_components.append(cc)
                    break
            self._stack.append(("ContentComponent", cc))

        elif local == "BaseURL":
            bu = BaseURL()
            for item in reversed(self._stack):
                if item[0] == "Representation":
                    item[1].base_urls.append(bu)
                elif item[0] == "AdaptationSet":
                    item[1].base_urls.append(bu)
                elif item[0] == "Period":
                    item[1].base_urls.append(bu)
                elif item[0] == "MPD":
                    item[1].base_urls.append(bu)
                else:
                    continue
                break
            self._stack.append(("BaseURL", bu))

        elif local == "SegmentList":
            for item in reversed(self._stack):
                if item[0] == "AdaptationSet":
                    item[1].segment_lists += 1
                    break
            self._stack.append(("SegmentList", None))

        elif local == "SegmentBase":
            for item in reversed(self._stack):
                if item[0] == "AdaptationSet":
                    item[1].segment_bases += 1
                    break
            self._stack.append(("SegmentBase", None))

        else:
            self._stack.append((local, None))

    def endElementNS(self, name, qname):
        if name[0] != NS:
            return

        local = name[1]

        if self._stack and self._stack[-1][0] == "BaseURL":
            bu = self._stack[-1][1]
            if bu is not None:
                bu.text = "".join(self._current_text).strip()

        if self._stack:
            self._stack.pop()

        self._current_text = []

    def characters(self, content):
        self._current_text.append(str(content))


class ParseError(Exception):
    pass


def parse_mpd_sax(content: bytes) -> MPDData:
    handler = MPDHandler()
    parser = xml.sax.make_parser()
    parser.setFeature(xml.sax.handler.feature_namespaces, True)
    parser.setContentHandler(handler)

    try:
        parser.parse(BytesIO(content))
    except Exception as e:
        raise ParseError(str(e)) from e

    return handler.mpd_data
