const dgram = require('dgram');
const os = require('os');
const { create } = require('xmlbuilder2');
const mime = require('mime-types');
const config = require('../config');

class DNAServer {
  constructor(mediaScanner) {
    this.mediaScanner = mediaScanner;
    this.socket = null;
    this.advertisementInterval = null;
    this.usn = `uuid:${config.server.uuid}`;
    this.deviceType = 'urn:schemas-upnp-org:device:MediaServer:1';
    this.serviceType = 'urn:schemas-upnp-org:service:ContentDirectory:1';
  }

  getBaseURL() {
    return `http://${config.server.host}:${config.server.port}`;
  }

  createDeviceDescriptionXML() {
    const baseURL = this.getBaseURL();
    const xml = {
      root: {
        '@xmlns': 'urn:schemas-upnp-org:device-1-0',
        '@xmlns:dlna': 'urn:schemas-dlna-org:device-1-0',
        specVersion: {
          major: 1,
          minor: 0
        },
        device: {
          deviceType: this.deviceType,
          friendlyName: config.server.friendlyName,
          manufacturer: config.server.manufacturer,
          manufacturerURL: 'https://github.com/nodejs',
          modelName: config.server.modelName,
          modelNumber: config.server.modelNumber,
          modelURL: 'https://github.com/nodejs',
          serialNumber: '1.0',
          UDN: this.usn,
          UPC: '000000000000',
          'dlna:X_DLNADOC': 'DMS-1.50',
          iconList: {
            icon: [
              {
                mimetype: 'image/png',
                width: 120,
                height: 120,
                depth: 24,
                url: '/icon.png'
              }
            ]
          },
          serviceList: {
            service: {
              serviceType: this.serviceType,
              serviceId: 'urn:upnp-org:serviceId:ContentDirectory',
              SCPDURL: '/ContentDirectory.xml',
              controlURL: '/control/ContentDirectory',
              eventSubURL: '/event/ContentDirectory'
            }
          },
          presentationURL: baseURL
        }
      }
    };

    return create(xml).end({ prettyPrint: true });
  }

  createServiceDescriptionXML() {
    const xml = {
      scpd: {
        '@xmlns': 'urn:schemas-upnp-org:service-1-0',
        specVersion: {
          major: 1,
          minor: 0
        },
        actionList: {
          action: [
            {
              name: 'Browse',
              argumentList: {
                argument: [
                  { name: 'ObjectID', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_ObjectID' },
                  { name: 'BrowseFlag', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_BrowseFlag' },
                  { name: 'Filter', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_Filter' },
                  { name: 'StartingIndex', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_Index' },
                  { name: 'RequestedCount', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_Count' },
                  { name: 'SortCriteria', direction: 'in', relatedStateVariable: 'A_ARG_TYPE_SortCriteria' },
                  { name: 'Result', direction: 'out', relatedStateVariable: 'A_ARG_TYPE_Result' },
                  { name: 'NumberReturned', direction: 'out', relatedStateVariable: 'A_ARG_TYPE_Count' },
                  { name: 'TotalMatches', direction: 'out', relatedStateVariable: 'A_ARG_TYPE_Count' },
                  { name: 'UpdateID', direction: 'out', relatedStateVariable: 'A_ARG_TYPE_UpdateID' }
                ]
              }
            },
            {
              name: 'GetSystemUpdateID',
              argumentList: {
                argument: {
                  name: 'Id',
                  direction: 'out',
                  relatedStateVariable: 'SystemUpdateID'
                }
              }
            }
          ]
        },
        serviceStateTable: {
          stateVariable: [
            { '@sendEvents': 'yes', name: 'SystemUpdateID', dataType: 'ui4' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_ObjectID', dataType: 'string' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_Result', dataType: 'string' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_BrowseFlag', dataType: 'string', allowedValueList: { allowedValue: ['BrowseMetadata', 'BrowseDirectChildren'] } },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_Filter', dataType: 'string' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_SortCriteria', dataType: 'string' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_Index', dataType: 'ui4' },
            { '@sendEvents': 'no', name: 'A_ARG_TYPE_Count', dataType: 'ui4' }
          ]
        }
      }
    };

    return create(xml).end({ prettyPrint: true });
  }

  createDIDLLite(items) {
    const baseURL = this.getBaseURL();
    const xml = {
      'DIDL-Lite': {
        '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        '@xmlns:dlna': 'urn:schemas-dlna-org:metadata-1-0/',
        item: items.map(item => {
          const mimeType = mime.lookup(item.extension) || 'application/octet-stream';
          const upnpClass = this.getUPnPClass(item.type);
          const resURL = `${baseURL}/stream/${item.id}`;

          const resElements = [];
          
          resElements.push({
            '@protocolInfo': this.getProtocolInfo(mimeType, item.type),
            '@size': item.size,
            '#text': resURL
          });

          if (item.extension === 'flac') {
            resElements.push({
              '@protocolInfo': 'http-get:*:audio/L16;rate=44100;channels=2:DLNA.ORG_PN=LPCM;DLNA.ORG_OP=01;DLNA.ORG_CI=1;DLNA.ORG_FLAGS=01500000000000000000000000000000',
              '#text': `${baseURL}/transcode/${item.id}/lpcm`
            });
          }

          const itemResult = {
            '@id': item.id,
            '@parentID': '0',
            '@restricted': 1,
            'dc:title': item.title,
            'dc:creator': 'Unknown',
            'upnp:class': upnpClass,
            'upnp:genre': item.directory,
            res: resElements
          };

          return itemResult;
        })
      }
    };

    return create(xml).end({ prettyPrint: true });
  }

  getUPnPClass(type) {
    switch (type) {
      case 'video':
        return 'object.item.videoItem';
      case 'audio':
        return 'object.item.audioItem.musicTrack';
      case 'image':
        return 'object.item.imageItem.photo';
      default:
        return 'object.item';
    }
  }

  getProtocolInfo(mimeType, type) {
    const dlnaProfile = this.getDLNAProfile(mimeType);
    return `http-get:*:${mimeType}:${dlnaProfile}`;
  }

  getDLNAProfile(mimeType) {
    const profiles = {
      'video/mp4': 'DLNA.ORG_PN=AVC_MP4_BL_CIF15_AAC_520;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'video/x-matroska': 'DLNA.ORG_PN=AVC_MKV_HP_HD_AAC_MULT5;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'video/avi': 'DLNA.ORG_PN=AVI;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'video/mpeg': 'DLNA.ORG_PN=MPEG_PS_PAL;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'audio/mpeg': 'DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'audio/mp4': 'DLNA.ORG_PN=AAC_ISO;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'audio/x-flac': 'DLNA.ORG_PN=FLAC;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'audio/wav': 'DLNA.ORG_PN=LPCM;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'image/jpeg': 'DLNA.ORG_PN=JPEG_LRG;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00D00000000000000000000000000000',
      'image/png': 'DLNA.ORG_PN=PNG_LRG;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00D00000000000000000000000000000',
      'image/gif': 'DLNA.ORG_PN=GIF_LRG;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=00D00000000000000000000000000000'
    };
    return profiles[mimeType] || 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000';
  }

  handleBrowse(objectId, browseFlag, startingIndex, requestedCount) {
    const allItems = this.mediaScanner.getAllMedia();
    let items = allItems;
    let totalMatches = allItems.length;

    if (objectId !== '0') {
      if (objectId === 'video') {
        items = allItems.filter(f => f.type === 'video');
        totalMatches = items.length;
      } else if (objectId === 'audio') {
        items = allItems.filter(f => f.type === 'audio');
        totalMatches = items.length;
      } else if (objectId === 'image') {
        items = allItems.filter(f => f.type === 'image');
        totalMatches = items.length;
      } else {
        const item = allItems.find(f => f.id === objectId);
        if (item) {
          items = [item];
          totalMatches = 1;
        }
      }
    }

    if (browseFlag === 'BrowseMetadata') {
      if (objectId === '0') {
        return this.createRootContainer(totalMatches);
      }
      if (objectId === 'video' || objectId === 'audio' || objectId === 'image') {
        return this.createTypeContainer(objectId, totalMatches);
      }
    }

    const start = parseInt(startingIndex) || 0;
    const count = parseInt(requestedCount) || 0;
    const end = count > 0 ? start + count : items.length;
    const pagedItems = items.slice(start, end);

    return {
      result: this.createDIDLLite(pagedItems),
      numberReturned: pagedItems.length,
      totalMatches: totalMatches,
      updateId: 1
    };
  }

  createRootContainer(totalMatches) {
    const xml = {
      'DIDL-Lite': {
        '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        container: [
          {
            '@id': 'video',
            '@parentID': '0',
            '@restricted': 1,
            '@childCount': this.mediaScanner.getStats().video,
            'dc:title': 'Video',
            'upnp:class': 'object.container.storageFolder'
          },
          {
            '@id': 'audio',
            '@parentID': '0',
            '@restricted': 1,
            '@childCount': this.mediaScanner.getStats().audio,
            'dc:title': 'Audio',
            'upnp:class': 'object.container.storageFolder'
          },
          {
            '@id': 'image',
            '@parentID': '0',
            '@restricted': 1,
            '@childCount': this.mediaScanner.getStats().image,
            'dc:title': 'Pictures',
            'upnp:class': 'object.container.storageFolder'
          }
        ]
      }
    };

    return {
      result: create(xml).end({ prettyPrint: true }),
      numberReturned: 3,
      totalMatches: 3,
      updateId: 1
    };
  }

  createTypeContainer(type, totalMatches) {
    const titles = { video: 'Video', audio: 'Audio', image: 'Pictures' };
    const items = this.mediaScanner.getAllMedia(type);
    const xml = {
      'DIDL-Lite': {
        '@xmlns': 'urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/',
        '@xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@xmlns:upnp': 'urn:schemas-upnp-org:metadata-1-0/upnp/',
        container: {
          '@id': type,
          '@parentID': '0',
          '@restricted': 1,
          '@childCount': items.length,
          'dc:title': titles[type],
          'upnp:class': 'object.container.storageFolder'
        }
      }
    };

    return {
      result: create(xml).end({ prettyPrint: true }),
      numberReturned: 1,
      totalMatches: 1,
      updateId: 1
    };
  }

  handleSOAPAction(action, body) {
    const match = action.match(/\"([^\"]+)#([^\"]+)\"/);
    if (!match) return null;

    const [, serviceType, actionName] = match;

    if (serviceType !== 'urn:schemas-upnp-org:service:ContentDirectory:1') {
      return null;
    }

    if (actionName === 'Browse') {
      const objectIdMatch = body.match(/<ObjectID>([^<]*)<\/ObjectID>/);
      const browseFlagMatch = body.match(/<BrowseFlag>([^<]*)<\/BrowseFlag>/);
      const startingIndexMatch = body.match(/<StartingIndex>([^<]*)<\/StartingIndex>/);
      const requestedCountMatch = body.match(/<RequestedCount>([^<]*)<\/RequestedCount>/);

      const objectId = objectIdMatch ? objectIdMatch[1] : '0';
      const browseFlag = browseFlagMatch ? browseFlagMatch[1] : 'BrowseDirectChildren';
      const startingIndex = startingIndexMatch ? startingIndexMatch[1] : '0';
      const requestedCount = requestedCountMatch ? requestedCountMatch[1] : '0';

      return this.handleBrowse(objectId, browseFlag, startingIndex, requestedCount);
    }

    if (actionName === 'GetSystemUpdateID') {
      return { Id: 1 };
    }

    return null;
  }

  createSOAPResponse(serviceType, actionName, result) {
    const body = Object.entries(result)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${actionName}Response xmlns:u="${serviceType}">
      ${body}
    </u:${actionName}Response>
  </s:Body>
</s:Envelope>`;
  }

  async startSSDP() {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.socket.on('message', (msg, rinfo) => {
      const message = msg.toString();
      
      if (message.includes('M-SEARCH') && 
          (message.includes(this.deviceType) || 
           message.includes(this.serviceType) ||
           message.includes('ssdp:all') ||
           message.includes('upnp:rootdevice'))) {
        this.sendSSDPResponse(rinfo.address, rinfo.port);
      }
    });

    this.socket.on('listening', () => {
      this.socket.addMembership('239.255.255.250');
      console.log('SSDP server listening on port 1900');
      this.sendSSDPAdvertisement();
      this.advertisementInterval = setInterval(() => {
        this.sendSSDPAdvertisement();
      }, config.dlna.maxAge * 1000 / 2);
    });

    this.socket.bind(config.dlna.ssdpPort);
  }

  sendSSDPResponse(address, port) {
    const baseURL = this.getBaseURL();
    const maxAge = config.dlna.maxAge;

    const responses = [
      { st: 'upnp:rootdevice', usn: `${this.usn}::upnp:rootdevice` },
      { st: this.usn, usn: this.usn },
      { st: this.deviceType, usn: `${this.usn}::${this.deviceType}` },
      { st: this.serviceType, usn: `${this.usn}::${this.serviceType}` }
    ];

    responses.forEach(({ st, usn }) => {
      const response = [
        'HTTP/1.1 200 OK',
        `CACHE-CONTROL: max-age = ${maxAge}`,
        `DATE: ${new Date().toUTCString()}`,
        'EXT:',
        `LOCATION: ${baseURL}/device.xml`,
        `SERVER: Node.js/${process.version} UPnP/1.0 DLNADOC/1.50`,
        `ST: ${st}`,
        `USN: ${usn}`,
        '',
        ''
      ].join('\r\n');

      this.socket.send(response, port, address, (err) => {
        if (err) console.error('Error sending SSDP response:', err);
      });
    });
  }

  sendSSDPAdvertisement() {
    const baseURL = this.getBaseURL();
    const maxAge = config.dlna.maxAge;

    const notifications = [
      { nt: 'upnp:rootdevice', usn: `${this.usn}::upnp:rootdevice` },
      { nt: this.usn, usn: this.usn },
      { nt: this.deviceType, usn: `${this.usn}::${this.deviceType}` },
      { nt: this.serviceType, usn: `${this.usn}::${this.serviceType}` }
    ];

    notifications.forEach(({ nt, usn }) => {
      const notification = [
        'NOTIFY * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'NTS: ssdp:alive',
        `CACHE-CONTROL: max-age = ${maxAge}`,
        `LOCATION: ${baseURL}/device.xml`,
        `SERVER: Node.js/${process.version} UPnP/1.0 DLNADOC/1.50`,
        `NT: ${nt}`,
        `USN: ${usn}`,
        '',
        ''
      ].join('\r\n');

      this.socket.send(notification, 1900, '239.255.255.250', (err) => {
        if (err) console.error('Error sending SSDP advertisement:', err);
      });
    });
  }

  sendByeBye() {
    if (!this.socket) return;

    const notifications = [
      { nt: 'upnp:rootdevice', usn: `${this.usn}::upnp:rootdevice` },
      { nt: this.usn, usn: this.usn },
      { nt: this.deviceType, usn: `${this.usn}::${this.deviceType}` },
      { nt: this.serviceType, usn: `${this.usn}::${this.serviceType}` }
    ];

    notifications.forEach(({ nt, usn }) => {
      const notification = [
        'NOTIFY * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'NTS: ssdp:byebye',
        `NT: ${nt}`,
        `USN: ${usn}`,
        '',
        ''
      ].join('\r\n');

      this.socket.send(notification, 1900, '239.255.255.250');
    });
  }

  async start() {
    await this.startSSDP();
    console.log('DLNA Server started, sending SSDP NOTIFY announcements');
    this.sendSSDPAdvertisement();
    setTimeout(() => this.sendSSDPAdvertisement(), 1000);
    setTimeout(() => this.sendSSDPAdvertisement(), 2000);
  }

  async stop() {
    if (this.advertisementInterval) {
      clearInterval(this.advertisementInterval);
    }

    this.sendByeBye();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    console.log('DLNA Server stopped');
  }
}

module.exports = DNAServer;
