const xml = require('@xmpp/xml');

const NS_ARCHIVE = 'urn:xmpp:archive';

class XEP0136Handler {
  constructor(database) {
    this.db = database;
  }

  handleStanza(stanza) {
    if (stanza.is('iq')) {
      return this.handleIQ(stanza);
    } else if (stanza.is('message')) {
      return this.handleMessage(stanza);
    }
    return null;
  }

  handleIQ(stanza) {
    const type = stanza.attrs.type;
    const id = stanza.attrs.id;
    const from = stanza.attrs.from;
    const to = stanza.attrs.to;

    const child = stanza.getChild('pref', NS_ARCHIVE) ||
                  stanza.getChild('query', NS_ARCHIVE) ||
                  stanza.getChild('retrieve', NS_ARCHIVE) ||
                  stanza.getChild('remove', NS_ARCHIVE);

    if (!child) return null;

    switch (child.name) {
      case 'pref':
        return type === 'get' ? this.handlePrefGet(from, id) : this.handlePrefSet(from, id, child);
      case 'query':
        return this.handleListCollections(from, id, child);
      case 'retrieve':
        return this.handleRetrieveCollection(from, id, child);
      case 'remove':
        return this.handleRemoveCollection(from, id, child);
      default:
        return this.buildError(from, to, id, 'cancel', 'feature-not-implemented');
    }
  }

  handlePrefGet(from, id) {
    const prefs = this.db.getPreferences(from) || { save: 'body', expire: null, otr: 'approve' };
    
    return xml('iq', { type: 'result', id, to: from },
      xml('pref', { xmlns: NS_ARCHIVE },
        xml('auto', { save: prefs.save }),
        prefs.expire ? xml('expire', { seconds: prefs.expire }) : null,
        xml('default', { otr: prefs.otr, save: prefs.save }),
        xml('item', { jid: 'default', otr: prefs.otr, save: prefs.save })
      )
    );
  }

  handlePrefSet(from, id, prefElement) {
    const auto = prefElement.getChild('auto');
    const expire = prefElement.getChild('expire');
    const defaultEl = prefElement.getChild('default');

    const prefs = {
      save: auto?.attrs?.save || defaultEl?.attrs?.save || 'body',
      expire: expire?.attrs?.seconds ? parseInt(expire.attrs.seconds) : null,
      otr: defaultEl?.attrs?.otr || 'approve'
    };

    this.db.setPreferences(from, prefs);
    
    return xml('iq', { type: 'result', id, to: from });
  }

  handleListCollections(from, id, query) {
    const withAttr = query.getChild('with')?.attrs?.jid;
    const startEl = query.getChild('start');
    const endEl = query.getChild('end');
    const max = query.getChild('set', 'http://jabber.org/protocol/rsm')?.getChildText('max');

    const options = {
      with: withAttr,
      max: max ? parseInt(max) : 50
    };

    if (startEl) {
      options.start = this.parseXmppDateTime(startEl.attrs.seconds || startEl.getText());
    }
    if (endEl) {
      options.end = this.parseXmppDateTime(endEl.attrs.seconds || endEl.getText());
    }

    const collections = this.db.listCollections(from, options);

    const result = xml('iq', { type: 'result', id, to: from },
      xml('query', { xmlns: NS_ARCHIVE },
        ...collections.map(c => this.buildChatElement(c))
      )
    );

    return result;
  }

  handleRetrieveCollection(from, id, retrieve) {
    const withJid = retrieve.attrs.with;
    const startAttr = retrieve.attrs.start;
    const keyword = retrieve.getChild('keyword')?.getText();

    const options = {};
    if (startAttr) {
      options.start = this.parseXmppDateTime(startAttr);
    }

    const set = retrieve.getChild('set', 'http://jabber.org/protocol/rsm');
    if (set) {
      const max = set.getChildText('max');
      if (max) options.max = parseInt(max);
    }

    if (keyword) {
      options.keyword = keyword;
    }

    const messages = this.db.retrieveCollection(from, withJid, options);

    const chat = xml('chat', {
      xmlns: NS_ARCHIVE,
      with: withJid,
      start: startAttr || this.formatXmppDateTime(messages[0]?.utc_time || Date.now())
    },
      ...messages.map(m => this.buildMessageElement(m))
    );

    return xml('iq', { type: 'result', id, to: from }, chat);
  }

  handleRemoveCollection(from, id, remove) {
    const withJid = remove.attrs.with;
    this.db.removeCollection(from, withJid);
    
    return xml('iq', { type: 'result', id, to: from });
  }

  handleMessage(stanza) {
    const from = stanza.attrs.from;
    const to = stanza.attrs.to;
    const body = stanza.getChildText('body');
    const type = stanza.attrs.type || 'chat';

    if (!body) return null;

    this.db.archiveMessage(from, from, to, body, type);
    this.db.archiveMessage(to, from, to, body, type);

    return null;
  }

  buildChatElement(collection) {
    return xml('chat', {
      with: `${collection.with_user}@${collection.with_server}`,
      start: this.formatXmppDateTime(collection.start_time),
      subject: collection.subject || ''
    },
      xml('count', {}, collection.message_count || 0),
      xml('last', {}, this.formatXmppDateTime(collection.last_activity))
    );
  }

  buildMessageElement(message) {
    const element = message.direction === 'from' 
      ? xml('from', { name: message.name || message.with_user })
      : xml('to', {});

    element.append(
      xml('utc', {}, this.formatXmppDateTime(message.utc_time)),
      xml('body', {}, message.body || '')
    );

    return element;
  }

  buildError(from, to, id, type, condition) {
    return xml('iq', { type: 'error', id, to: from },
      xml('error', { type },
        xml(condition, { xmlns: 'urn:ietf:params:xml:ns:xmpp-stanzas' })
      )
    );
  }

  parseXmppDateTime(str) {
    if (str && !isNaN(str)) {
      return parseInt(str) * 1000;
    }
    return new Date(str).getTime();
  }

  formatXmppDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().replace(/\.\d+Z$/, 'Z');
  }
}

module.exports = XEP0136Handler;
