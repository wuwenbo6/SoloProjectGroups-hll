from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class SElement:
    t: Optional[str] = None
    d: Optional[str] = None


@dataclass
class SegmentTimeline:
    elements: List[SElement] = field(default_factory=list)


@dataclass
class SegmentTemplate:
    media: Optional[str] = None
    index: Optional[str] = None
    initialization: Optional[str] = None
    timescale: Optional[str] = None
    startNumber: Optional[str] = None
    duration: Optional[str] = None
    segment_timeline: Optional[SegmentTimeline] = None


@dataclass
class ContentProtection:
    schemeIdUri: Optional[str] = None


@dataclass
class ContentComponent:
    contentType: Optional[str] = None


@dataclass
class BaseURL:
    text: str = ""


@dataclass
class Representation:
    id: Optional[str] = None
    bandwidth: Optional[str] = None
    width: Optional[str] = None
    height: Optional[str] = None
    frameRate: Optional[str] = None
    audioSamplingRate: Optional[str] = None
    codecs: Optional[str] = None
    mimeType: Optional[str] = None
    segment_template: Optional[SegmentTemplate] = None
    base_urls: List[BaseURL] = field(default_factory=list)
    content_protections: List[ContentProtection] = field(default_factory=list)


@dataclass
class AdaptationSet:
    id: Optional[str] = None
    mimeType: Optional[str] = None
    contentType: Optional[str] = None
    codecs: Optional[str] = None
    par: Optional[str] = None
    representations: List[Representation] = field(default_factory=list)
    segment_template: Optional[SegmentTemplate] = None
    base_urls: List[BaseURL] = field(default_factory=list)
    content_components: List[ContentComponent] = field(default_factory=list)
    content_protections: List[ContentProtection] = field(default_factory=list)
    segment_lists: int = 0
    segment_bases: int = 0


@dataclass
class Period:
    start: Optional[str] = None
    duration: Optional[str] = None
    adaptation_sets: List[AdaptationSet] = field(default_factory=list)
    base_urls: List[BaseURL] = field(default_factory=list)


@dataclass
class MPDData:
    type: str = "static"
    mediaPresentationDuration: Optional[str] = None
    minimumUpdatePeriod: Optional[str] = None
    profiles: Optional[str] = None
    periods: List[Period] = field(default_factory=list)
    base_urls: List[BaseURL] = field(default_factory=list)
    content_protections: List[ContentProtection] = field(default_factory=list)

    def get_effective_mime(self, rep: Representation, aset: AdaptationSet) -> str:
        return (rep.mimeType or aset.mimeType or "").lower()

    def get_effective_codecs(self, rep: Representation, aset: AdaptationSet) -> str:
        return rep.codecs or aset.codecs or ""
