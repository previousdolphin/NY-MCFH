/* Site editor. Plain DOM, no framework. All text goes in through textContent, never innerHTML. */
(function () {
  'use strict';

  var S = null;            // state from the server
  var dirty = false;       // an open form has unsaved edits
  var app = document.getElementById('app');

  // ---------- helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function img(key) { return key ? S.media_base.replace(/\/$/, '') + '/' + encodeURIComponent(key) : ''; }
  function who(email) { return email === S.me ? 'you' : String(email || '').split('@')[0]; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function niceLocal(l) { // "2026-11-16T18:30" -> "Nov 16, 2026, 6:30 PM"
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(l || '');
    if (!m) return '';
    var hr = +m[4];
    return MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] + ', ' + (hr % 12 || 12) + ':' + m[5] + ' ' + (hr < 12 ? 'AM' : 'PM');
  }
  var nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  function niceUtc(ms) {
    var o = {};
    nyFmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return niceLocal(o.year + '-' + o.month + '-' + o.day + 'T' + o.hour + ':' + o.minute);
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = document.getElementById('st-toast');
    t.textContent = msg;
    t.className = 'st-toast st-toast--on' + (bad ? ' st-toast--bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'st-toast'; }, bad ? 7000 : 3500);
  }

  // ---------- server ----------
  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', redirect: 'manual', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch('/studio/api/' + path, opts).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (res.type === 'opaqueredirect' || res.status === 401 || type.indexOf('json') < 0) {
        showSignin();
        var e = new Error('Your sign-in has expired. Sign in again, then press the button once more.');
        e.signin = true;
        throw e;
      }
      return res.json().then(function (data) {
        if (!res.ok) { var err = new Error(data.error || 'That did not work.'); err.status = res.status; err.data = data; throw err; }
        return data;
      });
    }, function () { throw new Error('No connection. Check your internet and try again.'); });
  }
  function showSignin() {
    var b = document.getElementById('st-signin');
    if (b) b.hidden = false;
  }
  function refresh() {
    return api('GET', 'state').then(function (s) { S = s; return s; });
  }

  function go(to) {
    dirty = false;
    if (location.hash === '#' + to) route(); else location.hash = to;
  }

  // ---------- two-step gate: the tick box arms the button, the button acts ----------
  function gate(checkLabel, buttonLabel, cls, act) {
    var id = 'g' + Math.random().toString(36).slice(2);
    var btn = h('button', { type: 'button', class: 'st-btn ' + (cls || ''), disabled: true, text: buttonLabel });
    var box = h('input', { type: 'checkbox', id: id, onchange: function () { btn.disabled = !box.checked; } });
    btn.addEventListener('click', function () {
      if (!box.checked) return;
      btn.disabled = true;
      Promise.resolve(act()).catch(function (e) { toast(e.message, true); }).then(function () {
        box.checked = false; btn.disabled = true;
      });
    });
    return h('div', { class: 'st-gate' }, h('label', { class: 'st-check', for: id }, box, h('span', { text: checkLabel })), btn);
  }

  function disclose(label, cls, content) {
    var panel = h('div', { class: 'st-panel', hidden: true }, content);
    var btn = h('button', { type: 'button', class: cls, 'aria-expanded': 'false', text: label, onclick: function () {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    } });
    return h('div', { class: 'st-disclose' }, btn, panel);
  }

  // ---------- form fields ----------
  function field(label, name, value, o) {
    o = o || {};
    var id = 'f-' + name + '-' + Math.random().toString(36).slice(2, 7);
    var input;
    if (o.rows) input = h('textarea', { id: id, rows: o.rows, maxlength: o.max });
    else if (o.options) {
      input = h('select', { id: id });
      o.options.forEach(function (op) { input.appendChild(h('option', { value: op[0], text: op[1] })); });
    } else input = h('input', { id: id, type: o.type || 'text', maxlength: o.max, placeholder: o.placeholder });
    input.value = value == null ? '' : value;
    input.setAttribute('data-name', name);
    if (o.required) input.required = true;
    input.addEventListener('input', function () { dirty = true; });
    return h('div', { class: 'st-field' + (o.wide ? ' st-field--wide' : '') },
      h('label', { for: id, text: label }), input, o.hint ? h('p', { class: 'st-hint', text: o.hint }) : null);
  }
  function checkField(label, name, value, hint) {
    var id = 'c-' + name;
    var box = h('input', { type: 'checkbox', id: id, checked: value, 'data-name': name, onchange: function () { dirty = true; } });
    return h('div', { class: 'st-field st-field--wide' }, h('label', { class: 'st-check', for: id }, box, h('span', { text: label })),
      hint ? h('p', { class: 'st-hint', text: hint }) : null);
  }
  function imageField(label, name, value, hint) {
    var hidden = h('input', { type: 'hidden', 'data-name': name, value: value || '' });
    var thumb = h('div', { class: 'st-thumb' });
    var chooseBtn = h('button', { type: 'button', class: 'st-btn', onclick: function () { pickImage(function (key) { hidden.value = key; dirty = true; paint(); }); } });
    var removeBtn = h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Remove image', onclick: function () { hidden.value = ''; dirty = true; paint(); } });
    function paint() {
      clear(thumb);
      if (hidden.value) thumb.appendChild(h('img', { src: img(hidden.value), alt: '' }));
      else thumb.appendChild(h('span', { text: 'No image' }));
      chooseBtn.textContent = hidden.value ? 'Change image…' : 'Choose image…';
      removeBtn.hidden = !hidden.value;
    }
    paint();
    return h('div', { class: 'st-field st-field--wide' }, h('span', { class: 'st-label', text: label }),
      h('div', { class: 'st-imagefield' }, thumb, h('div', { class: 'st-row' }, chooseBtn, removeBtn), hidden),
      hint ? h('p', { class: 'st-hint', text: hint }) : null);
  }
  // A list of small rows, e.g. march stops or press links.
  function repeater(label, name, items, cols, addLabel, hint) {
    var wrap = h('div', { class: 'st-rep', 'data-rep': name });
    function row(item) {
      var r = h('div', { class: 'st-rep-row' });
      cols.forEach(function (c) {
        var inp = h('input', { type: 'text', 'data-col': c[0], 'aria-label': c[1], placeholder: c[1], value: (item && item[c[0]]) || '' });
        inp.addEventListener('input', function () { dirty = true; });
        r.appendChild(inp);
      });
      r.appendChild(h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Remove', onclick: function () { r.remove(); dirty = true; } }));
      return r;
    }
    (items || []).forEach(function (it) { wrap.appendChild(row(it)); });
    return h('div', { class: 'st-field st-field--wide' }, h('span', { class: 'st-label', text: label }), wrap,
      h('button', { type: 'button', class: 'st-btn', text: addLabel, onclick: function () { wrap.appendChild(row()); } }),
      hint ? h('p', { class: 'st-hint', text: hint }) : null);
  }
  function collect(form) {
    var d = {};
    form.querySelectorAll('[data-name]').forEach(function (el) {
      d[el.getAttribute('data-name')] = el.type === 'checkbox' ? el.checked : el.value;
    });
    form.querySelectorAll('[data-rep]').forEach(function (rep) {
      d[rep.getAttribute('data-rep')] = Array.prototype.map.call(rep.querySelectorAll('.st-rep-row'), function (r) {
        var o = {};
        r.querySelectorAll('[data-col]').forEach(function (i) { o[i.getAttribute('data-col')] = i.value; });
        return o;
      });
    });
    return d;
  }

  // Shared save flow for every form, including the "someone else changed this" case.
  function formPage(title, back, body, opts) {
    var msg = h('p', { class: 'st-formmsg', role: 'alert' });
    var saveBtn = h('button', { type: 'submit', class: 'st-btn st-btn--primary', text: 'Save to draft' });
    var form = h('form', { class: 'st-form', novalidate: true }, body);
    function save(force) {
      var data = collect(form);
      var visible = 'visible' in data ? data.visible : true;
      delete data.visible;
      saveBtn.disabled = true; msg.textContent = ''; clear(msg);
      var payload = { kind: opts.kind, data: data, visible: visible, rev: opts.rev, force: !!force };
      var req = opts.id ? api('PUT', 'items/' + encodeURIComponent(opts.id), payload) : api('POST', 'items', payload);
      req.then(function () {
        dirty = false;
        return refresh().then(function () { toast('Saved to draft. Publish when you are ready.'); go(back); });
      }).catch(function (e) {
        saveBtn.disabled = false;
        msg.textContent = e.message;
        if (e.status === 409 && e.data && e.data.conflict) {
          msg.appendChild(h('span', { class: 'st-row' },
            h('button', { type: 'button', class: 'st-btn', text: 'Overwrite with my version', onclick: function () { save(true); } }),
            h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Reload theirs', onclick: function () { dirty = false; refresh().then(route); } })));
        }
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); save(false); });
    var actions = h('div', { class: 'st-actions' }, saveBtn,
      h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Cancel', onclick: function () { go(back); } }), msg);
    form.appendChild(actions);
    var out = [h('p', { class: 'st-back' }, h('a', { href: '#' + back, text: '← Back', onclick: function () { dirty = false; } })), h('h2', { text: title }), form];
    if (opts.id && opts.removeLabel) {
      out.push(h('section', { class: 'st-danger' }, h('h3', { text: opts.removeLabel }),
        h('p', { class: 'st-hint', text: 'This takes it out of the draft. The live site keeps it until you publish.' }),
        gate('Yes, remove this', opts.removeLabel, 'st-btn--danger', function () {
          return api('DELETE', 'items/' + encodeURIComponent(opts.id)).then(function () {
            return refresh().then(function () { toast('Removed from the draft.'); go(back); });
          });
        })));
    }
    return out;
  }

  // ---------- image picker dialog ----------
  function pickImage(onPick) {
    var dlg = h('dialog', { class: 'st-dialog', 'aria-label': 'Choose image' });
    var grid = h('div', { class: 'st-grid' });
    function paint() {
      clear(grid);
      var list = S.media.filter(function (m) { return !m.archived_at; });
      if (!list.length) grid.appendChild(h('p', { class: 'st-hint', text: 'No images yet. Upload one to start.' }));
      list.forEach(function (m) {
        grid.appendChild(h('button', { type: 'button', class: 'st-pick', title: m.filename || '', onclick: function () { dlg.close(); onPick(m.key); } },
          h('img', { src: img(m.key), alt: m.alt || m.filename || 'Image', loading: 'lazy' })));
      });
    }
    paint();
    var up = uploadButton(function (row) { dlg.close(); onPick(row.key); });
    dlg.appendChild(h('div', { class: 'st-dialog-head' }, h('h2', { text: 'Choose image' }),
      h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Cancel', onclick: function () { dlg.close(); } })));
    dlg.appendChild(up);
    dlg.appendChild(grid);
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  // ---------- uploads: shrink large images in the browser, then send ----------
  function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve({ blob: file, w: null, h: null });
    return createImageBitmap(file).then(function (bmp) {
      var MAX = 2000, w = bmp.width, hh = bmp.height;
      var scale = Math.min(1, MAX / Math.max(w, hh));
      if (scale === 1 && file.size < 1500000) return { blob: file, w: w, h: hh };
      var c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(hh * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) {
        c.toBlob(function (b) { res(b && b.size < file.size ? { blob: b, w: c.width, h: c.height } : { blob: file, w: w, h: hh }); },
          file.type === 'image/png' ? 'image/png' : file.type, 0.86);
      });
    }).catch(function () { return { blob: file, w: null, h: null }; });
  }
  function sha256(blob) {
    return blob.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); }).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (x) { return pad16(x); }).join('');
    });
  }
  function pad16(x) { return (x < 16 ? '0' : '') + x.toString(16); }
  function uploadOne(file) {
    return shrink(file).then(function (r) {
      return sha256(r.blob).then(function (hash) {
        var fd = new FormData();
        fd.append('file', r.blob, file.name);
        fd.append('sha256', hash);
        if (r.w) { fd.append('width', r.w); fd.append('height', r.h); }
        return api('POST', 'media', fd);
      });
    });
  }
  function uploadButton(done, primary) {
    var input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, class: 'st-file', id: 'up' + Math.random().toString(36).slice(2) });
    var status = h('span', { class: 'st-hint', role: 'status' });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      status.textContent = 'Uploading…';
      var last = null, chain = Promise.resolve();
      files.forEach(function (f) { chain = chain.then(function () { return uploadOne(f).then(function (row) { last = row; }); }); });
      chain.then(function () { return refresh(); }).then(function () {
        status.textContent = '';
        toast(files.length > 1 ? files.length + ' images uploaded.' : (last && last.duplicate ? 'That image was already in the library.' : 'Image uploaded.'));
        input.value = '';
        if (done) done(last);
      }).catch(function (e) { status.textContent = ''; input.value = ''; toast(e.message, true); });
    });
    return h('div', { class: 'st-upload' }, h('label', { class: 'st-btn' + (primary ? ' st-btn--primary' : ''), for: input.id, text: 'Upload image…' }), input, status,
      primary ? null : h('p', { class: 'st-hint', text: 'JPEG, PNG, WebP or GIF, up to 5 MB. Large images are resized before upload.' }));
  }

  // ---------- views ----------
  function changedIds() {
    var o = {};
    S.changes.forEach(function (c) { if (c.id) o[c.kind + ':' + c.id] = c.change; });
    return o;
  }
  function tag(text, cls) { return h('span', { class: 'st-tag ' + (cls || ''), text: text }); }
  function isPast(e) {
    var end = e.end || (e.start.slice(0, 10) + 'T23:59');
    return end < S.now_local;
  }
  function eventTitle(e) { return [e.title, e.accent].filter(Boolean).join(' '); }

  function viewEvents() {
    var ch = changedIds();
    var up = [], past = [];
    S.draft.events.forEach(function (e) { (isPast(e) ? past : up).push(e); });
    up.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    past.sort(function (a, b) { return a.start > b.start ? -1 : 1; });
    function row(e) {
      return h('li', { class: 'st-item' },
        h('div', { class: 'st-thumb st-thumb--sm' }, e.poster ? h('img', { src: img(e.poster), alt: '', loading: 'lazy' }) : null),
        h('div', { class: 'st-item-main' },
          h('a', { class: 'st-item-title', href: '#events/' + e.id, text: eventTitle(e) }),
          h('p', { class: 'st-hint', text: niceLocal(e.start) + (e.venue ? ' · ' + e.venue : '') }),
          h('p', { class: 'st-tags' },
            !e.visible ? tag('Hidden') : null,
            ch['event:' + e.id] ? tag('Not published yet', 'st-tag--warn') : null,
            isPast(e) && !e.blurb && !(e.press || []).length ? tag('Add a summary and press links') : null)),
        h('a', { class: 'st-btn st-btn--sm', href: '#events/' + e.id, text: 'Edit' }));
    }
    function list(title, items, empty) {
      return [h('p', { class: 'st-sub', text: title }), items.length ? h('ul', { class: 'st-list' }, items.map(row)) : h('p', { class: 'st-empty', text: empty })];
    }
    return [
      h('div', { class: 'st-head' }, h('h2', { text: 'Events' }), h('a', { class: 'st-btn st-btn--primary', href: '#events/new', text: 'Add event' })),
      h('p', { class: 'st-lede', text: 'Upcoming events are featured at the top of the home page. Once an event ends it moves to Past Actions on its own.' }),
      list('Upcoming', up, 'No upcoming events. Add one and it will be featured on the home page.'),
      list('Past', past, 'Past events appear here after they end.'),
    ];
  }

  function viewEventForm(id) {
    var e = id === 'new' ? { visible: true, start: '', end: '' } : S.draft.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return [h('p', { class: 'st-empty', text: 'That event is no longer in the draft.' }), h('a', { href: '#events', text: '← Back to events' })];
    var body = [
      h('fieldset', null, h('legend', { text: 'What and when' }),
        field('Title', 'title', e.title, { required: true, max: 140, hint: 'First line of the heading, in black.' }),
        field('Second title line', 'accent', e.accent, { max: 140, hint: 'Optional. Shown in red under the title.' }),
        field('Badge', 'badge', e.badge, { max: 40, hint: 'Optional small label above the title, such as "Forum" or "May Day 2026".' }),
        field('Subtitle', 'subtitle', e.subtitle, { max: 200 }),
        field('Starts (New York time)', 'start', e.start, { type: 'datetime-local', required: true }),
        field('Ends (New York time)', 'end', e.end, { type: 'datetime-local', hint: 'The event moves to Past Actions after this. Leave empty to use the end of the day.' }),
        field('Note beside the time', 'time_note', e.time_note, { max: 200, placeholder: 'Free. Space is limited.' })),
      h('fieldset', null, h('legend', { text: 'Where' }),
        field('Venue', 'venue', e.venue, { max: 160 }),
        field('Address', 'address', e.address, { max: 240 }),
        repeater('Stops', 'stops', e.stops, [['time', 'Time'], ['place', 'Place'], ['address', 'Address'], ['note', 'Note']], 'Add stop',
          'Only for marches or events with several meeting points. When stops are filled in they replace the time and venue lines.')),
      h('fieldset', null, h('legend', { text: 'Details' }),
        field('Description', 'description', e.description, { rows: 7, max: 4000, wide: true, hint: 'Leave a blank line between paragraphs. **bold**, *italic* and [link text](https://…) work.' }),
        field('Short summary', 'blurb', e.blurb, { rows: 2, max: 400, wide: true, hint: 'Shown on the card once the event is in Past Actions. If empty, the first paragraph of the description is used.' }),
        field('Hosted by', 'hosted_by', e.hosted_by, { max: 160 })),
      h('fieldset', null, h('legend', { text: 'Links' }),
        field('Button label', 'cta_label', e.cta_label, { max: 40, placeholder: 'Register Free' }),
        field('Button link', 'cta_url', e.cta_url, { type: 'url', placeholder: 'https://' }),
        field('Note under the button', 'cta_note', e.cta_note, { max: 200 }),
        field('More-info link', 'link_url', e.link_url, { type: 'url', placeholder: 'https://' }),
        field('More-info label', 'link_label', e.link_label, { max: 80, hint: 'Optional. Defaults to the web address.' }),
        repeater('Press coverage', 'press', e.press, [['outlet', 'Outlet, e.g. NY Times'], ['url', 'Link to the article']], 'Add press link', 'Shown on the card in Past Actions.')),
      h('fieldset', null, h('legend', { text: 'Poster' }),
        imageField('Poster', 'poster', e.poster),
        imageField('Back of poster', 'poster_back', e.poster_back, 'Optional. Visitors can flip a two-sided poster.')),
      h('fieldset', null, h('legend', { text: 'Visibility' }),
        checkField('Show on site', 'visible', e.visible, 'Untick to keep this event in the draft without it appearing when you publish.')),
    ];
    return formPage(id === 'new' ? 'Add event' : 'Edit event', 'events', body, { kind: 'event', id: id === 'new' ? null : id, rev: S.revs[id], removeLabel: 'Remove event' });
  }

  function viewOrgs(kind) {
    var plural = kind === 'member' ? 'members' : 'partners';
    var items = S.draft[plural];
    var ch = changedIds();
    function move(i, d) {
      var ids = items.map(function (x) { return x.id; });
      var j = i + d;
      if (j < 0 || j >= ids.length) return;
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      api('PUT', 'order/' + kind, { ids: ids }).then(refresh).then(route).catch(function (e) { toast(e.message, true); });
    }
    var list = h('ul', { class: 'st-list' }, items.map(function (m, i) {
      return h('li', { class: 'st-item' },
        h('div', { class: 'st-thumb st-thumb--sm' + (m.dark || (kind === 'partner' && m.panel !== 'white' && m.panel !== 'cream') ? ' st-thumb--dark' : '') }, m.logo ? h('img', { src: img(m.logo), alt: '', loading: 'lazy' }) : null),
        h('div', { class: 'st-item-main' },
          h('a', { class: 'st-item-title', href: '#' + plural + '/' + m.id, text: m.name }),
          h('p', { class: 'st-tags' }, !m.visible ? tag('Hidden') : null, ch[kind + ':' + m.id] ? tag('Not published yet', 'st-tag--warn') : null)),
        h('div', { class: 'st-row' },
          h('button', { type: 'button', class: 'st-btn st-btn--sm', 'aria-label': 'Move ' + m.name + ' up', text: '↑', disabled: i === 0, onclick: function () { move(i, -1); } }),
          h('button', { type: 'button', class: 'st-btn st-btn--sm', 'aria-label': 'Move ' + m.name + ' down', text: '↓', disabled: i === items.length - 1, onclick: function () { move(i, 1); } }),
          h('a', { class: 'st-btn st-btn--sm', href: '#' + plural + '/' + m.id, text: 'Edit' })));
    }));
    return [
      h('div', { class: 'st-head' }, h('h2', { text: kind === 'member' ? 'Members' : 'Partners' }),
        h('a', { class: 'st-btn st-btn--primary', href: '#' + plural + '/new', text: kind === 'member' ? 'Add member' : 'Add partner' })),
      h('p', { class: 'st-lede', text: kind === 'member'
        ? 'The organisations in the coalition. Their logos fill the Who We Are grid on the home page, in this order.'
        : 'Allied organisations shown as cards on the Partner Organizations page, in this order.' }),
      items.length ? list : h('p', { class: 'st-empty', text: 'Nothing here yet.' }),
    ];
  }

  function viewOrgForm(kind, id) {
    var plural = kind === 'member' ? 'members' : 'partners';
    var m = id === 'new' ? { visible: true, panel: 'white' } : S.draft[plural].filter(function (x) { return x.id === id; })[0];
    if (!m) return [h('p', { class: 'st-empty', text: 'That organisation is no longer in the draft.' }), h('a', { href: '#' + plural, text: '← Back' })];
    var body = kind === 'member'
      ? [h('fieldset', null, h('legend', { text: 'Member' }),
          field('Name', 'name', m.name, { required: true, max: 120 }),
          field('Website', 'link', m.link, { type: 'url', placeholder: 'https://', hint: 'Optional. Makes the logo a link.' }),
          imageField('Logo', 'logo', m.logo),
          field('Text shown without a logo', 'fallback', m.fallback, { rows: 2, max: 120, hint: 'Used if there is no logo. Each line break starts a new line.' }),
          checkField('Dark background behind the logo', 'dark', m.dark, 'For logos drawn in white.'),
          checkField('Show on site', 'visible', m.visible))]
      : [h('fieldset', null, h('legend', { text: 'Partner' }),
          field('Name', 'name', m.name, { required: true, max: 120 }),
          field('Website', 'url', m.url, { type: 'url', placeholder: 'https://' }),
          field('Description', 'description', m.description, { rows: 4, max: 800, wide: true }),
          imageField('Logo', 'logo', m.logo),
          field('Colour behind the logo', 'panel', m.panel, { options: [['white', 'White'], ['cream', 'Cream'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['black', 'Black']] }),
          checkField('Show on site', 'visible', m.visible))];
    var noun = kind === 'member' ? 'member' : 'partner';
    return formPage((id === 'new' ? 'Add ' : 'Edit ') + noun, plural, body, { kind: kind, id: id === 'new' ? null : id, rev: S.revs[id], removeLabel: 'Remove ' + noun });
  }

  function viewText() {
    var b = S.draft.blocks || {};
    var body = [
      h('fieldset', null, h('legend', { text: 'Top of the home page' }),
        field('Ticker', 'ticker', b.ticker, { rows: 3, max: 600, hint: 'The scrolling bar. One phrase per line.' }),
        field('Headline, first line', 'hero_line1', b.hero_line1, { max: 60 }),
        field('Headline, second line', 'hero_line2', b.hero_line2, { max: 60 }),
        field('Tagline', 'hero_tagline', b.hero_tagline, { rows: 3, max: 600, wide: true })),
      h('fieldset', null, h('legend', { text: 'Who We Are' }),
        field('Introduction', 'who_intro', b.who_intro, { rows: 3, max: 1000, wide: true })),
      h('fieldset', null, h('legend', { text: 'Mission' }),
        field('Mission statement', 'mission_body', b.mission_body, { rows: 12, max: 6000, wide: true, hint: 'Leave a blank line between paragraphs.' }),
        field('Highlighted statement', 'mission_callout', b.mission_callout, { rows: 5, max: 1500, wide: true, hint: 'The red box under the mission statement.' }),
        imageField('Photo', 'mission_photo', b.mission_photo)),
      h('fieldset', null, h('legend', { text: 'Get Involved (bottom of every page)' }),
        field('Heading', 'footer_heading', b.footer_heading, { max: 60 }),
        field('Text', 'footer_text', b.footer_text, { rows: 2, max: 600, wide: true }),
        field('Contact email', 'contact_email', b.contact_email, { type: 'email' }),
        field('Button label', 'contact_button', b.contact_button, { max: 40 })),
      h('fieldset', null, h('legend', { text: 'Partners page' }),
        field('Introduction', 'partners_intro', b.partners_intro, { rows: 3, max: 1000, wide: true })),
      h('fieldset', null, h('legend', { text: 'Search results and link previews' }),
        field('Site title', 'site_title', b.site_title, { max: 120 }),
        field('Site description', 'site_description', b.site_description, { rows: 2, max: 300, wide: true, hint: 'One or two sentences shown by search engines and when the site is shared.' }),
        imageField('Share image', 'share_image', b.share_image, 'Shown when the site is shared in messages and on social media. A wide image works best.'),
        imageField('Small logo', 'logo_small', b.logo_small, 'Top-left corner of every page.'),
        imageField('Large logo', 'logo_large', b.logo_large, 'Beside the headline on the home page.')),
    ];
    var page = formPage('Page text', 'text', body, { kind: 'block', id: 'blocks', rev: S.revs.blocks });
    page.shift(); // no Back link: this is a top-level tab
    return page;
  }

  var described = {}; // images whose description is read out on the site (posters, photos)
  function usage() {
    var u = {};
    described = {};
    function note(k, where) { if (k) (u[k] = u[k] || []).push(where); }
    S.draft.events.forEach(function (e) { note(e.poster, eventTitle(e)); note(e.poster_back, eventTitle(e)); described[e.poster] = described[e.poster_back] = true; });
    S.draft.members.forEach(function (m) { note(m.logo, m.name); });
    S.draft.partners.forEach(function (m) { note(m.logo, m.name); });
    var b = S.draft.blocks || {};
    note(b.mission_photo, 'Mission photo'); described[b.mission_photo] = true; note(b.logo_small, 'Small logo'); note(b.logo_large, 'Large logo'); note(b.share_image, 'Share image');
    return u;
  }
  function viewImages() {
    var u = usage();
    var showHidden = sessionGet('showHidden') === '1';
    var list = S.media.filter(function (m) { return showHidden || !m.archived_at; });
    var hiddenCount = S.media.filter(function (m) { return m.archived_at; }).length;
    var grid = h('ul', { class: 'st-tiles' }, list.map(function (m) {
      var used = u[m.key];
      return h('li', null, h('button', { type: 'button', class: 'st-tile' + (m.archived_at ? ' st-tile--hidden' : ''), onclick: function () { imageDetail(m, used); } },
        h('div', { class: 'st-tile-img' }, h('img', { src: img(m.key), alt: m.alt || m.filename || 'Image', loading: 'lazy' })),
        h('div', { class: 'st-tile-body' },
          h('p', { class: 'st-tile-name st-clip', text: m.filename || 'Image' }),
          h('p', { class: 'st-tile-meta st-clip', text: m.archived_at ? 'Hidden' : used ? 'Used by ' + used[0] + (used.length > 1 ? ' +' + (used.length - 1) : '') : 'Not used' }),
          !m.alt && described[m.key] ? h('p', { class: 'st-tags' }, tag('Needs a description', 'st-tag--warn')) : null)));
    }));
    return [
      h('div', { class: 'st-head' }, h('h2', { text: 'Images' }), uploadButton(function () { route(); }, true)),
      h('p', { class: 'st-lede', text: 'Every poster, logo and photo on the site. Select an image to describe it or hide it. To put an image on the site, choose it from the event, member, partner or page text you are editing. Uploads can be JPEG, PNG, WebP or GIF, up to 5 MB.' }),
      list.length ? grid : h('p', { class: 'st-empty', text: 'No images yet. Upload a poster or logo to start.' }),
      hiddenCount ? h('p', null, h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: showHidden ? 'Stop showing hidden images' : 'Show ' + hiddenCount + ' hidden', onclick: function () { sessionSet('showHidden', showHidden ? '0' : '1'); route(); } })) : null,
    ];
  }

  function imageDetail(m, used) {
    var dlg = h('dialog', { class: 'st-dialog', 'aria-label': 'Image details' });
    var alt = h('textarea', { id: 'img-alt', rows: 3, maxlength: 300, placeholder: 'For example: Poster for the November 16 forum at NYU' });
    alt.value = m.alt || '';
    var msg = h('p', { class: 'st-formmsg', role: 'alert' });
    function done(text) { dlg.close(); refresh().then(function () { toast(text); route(); }); }
    function fail(e) { msg.textContent = e.message; }
    add(dlg, [
      h('div', { class: 'st-dialog-head' }, h('h2', { class: 'st-clip', text: m.filename || 'Image' }),
        h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Close', onclick: function () { dlg.close(); } })),
      h('div', { class: 'st-detail' },
        h('div', { class: 'st-detail-img' }, h('img', { src: img(m.key), alt: m.alt || '' })),
        h('div', null,
          h('p', { class: 'st-hint', text: (m.width && m.height ? m.width + ' × ' + m.height + ' px · ' : '') + Math.max(1, Math.round(m.bytes / 1024)) + ' KB' }),
          h('p', { class: 'st-hint', text: used ? 'Used by: ' + used.join(', ') : 'Not used anywhere in the draft.' }),
          h('div', { class: 'st-field' }, h('label', { for: 'img-alt', text: 'Description' }), alt,
            h('p', { class: 'st-hint', text: 'Read aloud to visitors who cannot see the image. Say what it shows in a sentence.' })),
          h('div', { class: 'st-row' },
            h('button', { type: 'button', class: 'st-btn st-btn--primary', text: 'Save description', onclick: function () {
              api('PATCH', 'media/' + m.key, { alt: alt.value }).then(function () { done('Description saved to draft.'); }).catch(fail);
            } }),
            h('button', { type: 'button', class: 'st-btn', text: m.archived_at ? 'Put back in library' : 'Hide from library', onclick: function () {
              api('PATCH', 'media/' + m.key, { archived: !m.archived_at }).then(function () { done(m.archived_at ? 'Image is back in the library.' : 'Image hidden from the library.'); }).catch(fail);
            } })),
          msg,
          h('p', { class: 'st-hint', text: 'Images are never deleted, so older versions of the site keep working. Hiding one only removes it from this page and the image chooser.' }))),
    ]);
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  function sessionGet(k) { try { return sessionStorage.getItem('st-' + k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem('st-' + k, v); } catch (e) {} }

  var CHANGE_WORD = { added: 'New', edited: 'Edited', removed: 'Removed', hidden: 'Hidden', shown: 'Shown again', reordered: 'Reordered' };
  var KIND_WORD = { event: 'Event', member: 'Member', partner: 'Partner', block: 'Page text', media: 'Images' };
  function changeLink(c) {
    if (c.change === 'removed') return null;
    if (c.kind === 'event' && c.id) return '#events/' + c.id;
    if (c.kind === 'member') return c.id ? '#members/' + c.id : '#members';
    if (c.kind === 'partner') return c.id ? '#partners/' + c.id : '#partners';
    if (c.kind === 'block') return '#text';
    if (c.kind === 'media') return '#images';
    return null;
  }
  function changeList(changes, links) {
    return h('ul', { class: 'st-changes' }, changes.map(function (c) {
      var href = links ? changeLink(c) : null;
      return h('li', null,
        tag(CHANGE_WORD[c.change], c.change === 'removed' || c.change === 'hidden' ? '' : 'st-tag--warn'),
        h('span', { class: 'st-grow' }, h('strong', { text: c.name }),
          h('span', { class: 'st-hint', text: ' ' + (c.change === 'reordered' ? '' : KIND_WORD[c.kind]) + (c.hidden ? ' · hidden, will not appear' : '') + (c.by ? ' · by ' + who(c.by) : '') })),
        href ? h('a', { href: href, text: 'Open' }) : null);
    }));
  }
  function previewUrl(scheduled) { return location.origin + '/preview/' + S.preview_token + (scheduled ? '/scheduled' : '') + '/'; }
  function step(n, title, body) {
    return h('section', { class: 'st-card st-step' }, h('div', { class: 'st-step-n', 'aria-hidden': 'true', text: String(n) }),
      h('div', null, h('h3', { text: 'Step ' + n + ': ' + title }), body));
  }
  function retry409(e) {
    if (e.status === 409) return refresh().then(function () { route(); toast(e.message, true); });
    throw e;
  }

  function viewPublish() {
    var n = S.changes.length;
    var out = [h('div', { class: 'st-head' }, h('h2', { text: 'Publish' }))];
    out.push(h('p', { class: 'st-lede', text: 'What you save in the editor is a draft that only editors can see. Publishing puts the draft on the live site.' }));

    if (S.scheduled) {
      var sc = S.scheduled;
      out.push(h('section', { class: 'st-card st-card--note' },
        h('h3', { text: 'Scheduled to publish ' + niceUtc(sc.publish_at) + ' (New York time)' }),
        h('p', { class: 'st-hint', text: 'Set up by ' + who(sc.by) + (sc.note ? ' · ' + sc.note : '') + '. It will make these changes:' }),
        sc.changes.length ? changeList(sc.changes, false) : h('p', { class: 'st-hint', text: 'No difference from the live site.' }),
        sc.draft_ahead ? h('p', { class: 'st-warn', text: 'You have edited the draft since scheduling. Those newer edits are not included. Schedule again below to include them.' }) : null,
        h('p', { class: 'st-row' }, h('a', { class: 'st-btn st-btn--sm', href: previewUrl(true), target: '_blank', rel: 'noopener', text: 'Preview the scheduled version' })),
        gate('Cancel this scheduled publish', 'Cancel schedule', '', function () {
          return api('DELETE', 'schedule').then(refresh).then(function () { toast('Schedule cancelled. Your draft is unchanged.'); route(); });
        })));
    }

    if (!n) {
      out.push(h('section', { class: 'st-card st-hero' }, h('div', { class: 'st-hero-icon', 'aria-hidden': 'true', text: '✓' }),
        h('div', null, h('h3', { text: S.live ? 'The live site is up to date' : 'Nothing has been published yet' }),
          h('p', { class: 'st-hint', text: S.live ? 'Everything in the editor is on the live site. Last published ' + niceUtc(S.live.published_at) + (S.live.by === 'seed' ? '' : ' by ' + who(S.live.by)) + '.' : 'Add some content, then come back here.' }),
          h('p', { class: 'st-row' }, h('a', { class: 'st-btn', href: '/', target: '_blank', rel: 'noopener', text: 'View live site' }), h('a', { class: 'st-btn st-btn--quiet', href: '#history', text: 'See history' })))));
      return out;
    }

    out.push(h('section', { class: 'st-card st-hero' }, h('div', { class: 'st-hero-icon st-hero-icon--warn', 'aria-hidden': 'true', text: String(n) }),
      h('div', null, h('h3', { text: n === 1 ? '1 change is waiting to be published' : n + ' changes are waiting to be published' }),
        h('p', { class: 'st-hint', text: 'Visitors still see the site as it was last published. Follow the three steps below to put your changes live.' }))));

    out.push(step(1, 'Review what will change', [
      h('p', { class: 'st-hint', text: 'Everything listed here goes live together. To hold something back, open it and untick "Show on site".' }),
      changeList(S.changes, true)]));

    out.push(step(2, 'Check the preview', [
      h('p', { class: 'st-hint', text: 'The preview is the whole site with your draft applied. The link also works for people who are not editors, so you can send it to a colleague first.' }),
      h('p', { class: 'st-row' },
        h('a', { class: 'st-btn', href: previewUrl(false), target: '_blank', rel: 'noopener', text: 'Open preview' }),
        h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Copy preview link', onclick: function () {
          navigator.clipboard.writeText(previewUrl(false)).then(function () { toast('Preview link copied.'); }, function () { toast('Copy did not work. Open the preview and copy its address.', true); });
        } }))]));

    var note = h('input', { type: 'text', id: 'pub-note', maxlength: 300, placeholder: 'For example: Added the November forum' });
    var when = h('input', { type: 'datetime-local', id: 'pub-when', min: S.now_local });
    var whenBox = h('div', { class: 'st-inset', hidden: true },
      h('label', { for: 'pub-when', text: 'Date and time (New York time)' }), when,
      h('p', { class: 'st-hint', text: 'The draft is frozen as it is right now and goes live at that time. Anything you edit afterwards is not included unless you schedule again.' + (S.scheduled ? ' This replaces the current schedule.' : '') }));
    var rNow = h('input', { type: 'radio', name: 'pub-mode', id: 'pub-now', checked: true });
    var rLater = h('input', { type: 'radio', name: 'pub-mode', id: 'pub-later' });
    var go = gate('I have checked the preview', 'Publish now', 'st-btn--primary', function () {
      if (rLater.checked) {
        if (!when.value) { toast('Choose a date and time first.', true); return; }
        return api('POST', 'schedule', { draft_rev: S.draft_rev, note: note.value, publish_at: when.value.slice(0, 16) })
          .then(refresh).then(function () { toast('Scheduled. It will publish on its own.'); route(); }).catch(retry409);
      }
      return api('POST', 'publish', { draft_rev: S.draft_rev, note: note.value })
        .then(refresh).then(function () { toast('Published. The live site is updated.'); route(); }).catch(retry409);
    });
    var goBtn = go.querySelector('button');
    function mode() { whenBox.hidden = !rLater.checked; goBtn.textContent = rLater.checked ? 'Schedule publish' : 'Publish now'; }
    rNow.addEventListener('change', mode); rLater.addEventListener('change', mode);
    out.push(step(3, 'Put it live', [
      h('div', { class: 'st-choice', role: 'radiogroup', 'aria-label': 'When to publish' },
        h('label', { for: 'pub-now' }, rNow, h('div', null, h('span', { text: 'Publish now' }), h('small', { text: 'The live site updates within a minute.' + (S.scheduled ? ' This cancels the scheduled publish above.' : '') }))),
        h('label', { for: 'pub-later' }, rLater, h('div', null, h('span', { text: 'Schedule for later' }), h('small', { text: 'Pick a date and time, for example to announce an event on Monday morning.' })))),
      whenBox,
      h('div', { class: 'st-field' }, h('label', { for: 'pub-note', text: 'Note for the history (optional)' }), note),
      go]));

    if (S.live) {
      out.push(disclose('Discard all changes instead…', 'st-btn st-btn--quiet',
        h('section', { class: 'st-danger' },
          h('p', { text: 'This throws away every unpublished change listed in step 1. The draft goes back to matching the live site. It cannot be undone.' }),
          gate('Yes, discard all unpublished changes', 'Discard changes', 'st-btn--danger', function () {
            return api('POST', 'draft/reset', {}).then(refresh).then(function () { toast('Changes discarded.'); route(); });
          }))));
    }
    return out;
  }

  function viewHistory() {
    var box = h('div', null, h('p', { class: 'st-hint', text: 'Loading…' }));
    api('GET', 'releases').then(function (r) {
      clear(box);
      var rows = r.releases.filter(function (v) { return v.status === 'published'; });
      if (!rows.length) { box.appendChild(h('p', { class: 'st-empty', text: 'Each time you publish, that version of the site is kept here so you can go back to it.' })); return; }
      box.appendChild(h('ul', { class: 'st-list' }, rows.map(function (v) {
        var liveNow = S.live && v.id === S.live.id;
        var by = v.created_by === 'seed' ? 'the original site import' : who(v.created_by);
        return h('li', { class: 'st-item st-version' },
          h('div', { class: 'st-item-main' },
            h('p', { class: 'st-item-title', text: niceUtc(v.published_at) }),
            h('p', { class: 'st-hint', text: (v.rolled_back_from ? 'Restored by ' : v.publish_at ? 'Scheduled by ' : 'Published by ') + by + (v.note ? ' · ' + v.note : '') })),
          liveNow ? tag('Live now', 'st-tag--ok') : null,
          liveNow ? null : disclose('Restore…', 'st-btn st-btn--sm', [
            h('p', { class: 'st-hint', text: 'The live site goes back to exactly this version straight away. Your draft is not changed.' }),
            gate('Make this version the live site', 'Restore this version', 'st-btn--primary', function () {
              return api('POST', 'releases/' + v.id + '/rollback', {}).then(refresh).then(function () { toast('Restored. That version is live again.'); route(); });
            })]));
      })));
    }).catch(function (e) { clear(box); box.appendChild(h('p', { class: 'st-warn', text: e.message })); });
    return [
      h('div', { class: 'st-head' }, h('h2', { text: 'History' })),
      h('p', { class: 'st-lede', text: 'Every version of the site that has been published, newest first. If something goes out wrong, restore the version before it.' }),
      box,
    ];
  }

  // ---------- chrome + routing ----------
  var NAV = [
    ['Content', [['events', 'Events'], ['members', 'Members'], ['partners', 'Partners'], ['text', 'Page text'], ['images', 'Images']]],
    ['Site', [['publish', 'Publish'], ['history', 'History']]],
  ];
  var main, nav, bar;

  function renderChrome() {
    var cur = (location.hash.slice(1) || 'events').split('/')[0];
    var n = S.changes.length;
    clear(nav);
    NAV.forEach(function (group) {
      nav.appendChild(h('span', { class: 'st-nav-label', text: group[0] }));
      group[1].forEach(function (t) {
        var a = h('a', { href: '#' + t[0], 'aria-current': cur === t[0] ? 'page' : null }, h('span', { text: t[1] }));
        if (t[0] === 'publish' && n) a.appendChild(h('span', { class: 'st-count', text: String(n), 'aria-label': n + ' not published' }));
        nav.appendChild(a);
      });
    });
    clear(bar);
    var sched = S.scheduled ? h('small', { text: 'Scheduled for ' + niceUtc(S.scheduled.publish_at) }) : null;
    add(bar, [
      h('div', { class: 'st-state', role: 'status' }, h('span', { class: 'st-dot' + (n ? ' st-dot--warn' : ''), 'aria-hidden': 'true' }),
        h('span', { text: n ? (n === 1 ? '1 change not published yet' : n + ' changes not published yet') : 'Everything is published' }), sched),
      h('div', { class: 'st-row' },
        n ? h('a', { class: 'st-btn st-btn--sm', href: previewUrl(false), target: '_blank', rel: 'noopener', text: 'Preview' })
          : h('a', { class: 'st-btn st-btn--sm', href: '/', target: '_blank', rel: 'noopener', text: 'View live site' }),
        n && cur !== 'publish' ? h('a', { class: 'st-btn st-btn--sm st-btn--primary', href: '#publish', text: 'Review and publish' }) : null),
    ]);
  }

  var lastHash = '';
  function route() {
    var hash = location.hash.slice(1) || 'events';
    if (dirty && hash !== lastHash) {
      history.replaceState(null, '', '#' + lastHash);
      toast('Save to draft or cancel this edit before leaving the page.', true);
      return;
    }
    lastHash = hash; dirty = false;
    var p = hash.split('/');
    var view;
    if (p[0] === 'events') view = p[1] ? viewEventForm(p[1]) : viewEvents();
    else if (p[0] === 'members') view = p[1] ? viewOrgForm('member', p[1]) : viewOrgs('member');
    else if (p[0] === 'partners') view = p[1] ? viewOrgForm('partner', p[1]) : viewOrgs('partner');
    else if (p[0] === 'text') view = viewText();
    else if (p[0] === 'images') view = viewImages();
    else if (p[0] === 'publish') view = viewPublish();
    else if (p[0] === 'history') view = viewHistory();
    else view = viewEvents();
    renderChrome();
    clear(main);
    add(main, view);
    window.scrollTo(0, 0);
  }

  function boot() {
    clear(app);
    nav = h('nav', { class: 'st-nav', 'aria-label': 'Sections' });
    bar = h('header', { class: 'st-bar' });
    main = h('main', { class: 'st-main', id: 'main' });
    add(app, h('div', { class: 'st-app' },
      h('aside', { class: 'st-side' },
        h('div', { class: 'st-brand' }, h('img', { src: '/static/favicon.png', alt: '' }),
          h('div', null, h('strong', { text: 'NY Metro Coalition' }), h('span', { text: 'Site editor' }))),
        nav,
        h('div', { class: 'st-side-foot' }, h('p', { text: 'Signed in as ' + S.me }), h('p', null, h('a', { href: '/', target: '_blank', rel: 'noopener', text: 'View live site' })))),
      h('div', { class: 'st-body' },
        bar,
        h('div', { class: 'st-signin', id: 'st-signin', hidden: true, role: 'alert' },
          h('span', { text: 'Your sign-in has expired. Nothing on this page is lost. ' }),
          h('a', { href: '/studio', target: '_blank', rel: 'noopener', text: 'Sign in again' }),
          h('span', { text: ' in a new tab, then come back here and continue.' })),
        main)));
    add(app, h('div', { class: 'st-toast', id: 'st-toast', role: 'status', 'aria-live': 'polite' }));
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    route();
  }

  refresh().then(boot).catch(function (e) {
    clear(app);
    add(app, h('div', { class: 'st-main' }, h('h1', { text: 'Site editor' }), h('p', { class: 'st-warn', text: e.signin ? 'Sign-in is required. Reload this page to sign in.' : e.message }),
      h('p', null, h('a', { href: '/studio', text: 'Reload' }))));
  });
})();
