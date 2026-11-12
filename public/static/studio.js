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
  function uploadButton(done) {
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
    return h('div', { class: 'st-upload' }, h('label', { class: 'st-btn', for: input.id, text: 'Upload image…' }), input, status,
      h('p', { class: 'st-hint', text: 'JPEG, PNG, WebP or GIF, up to 5 MB. Large images are resized before upload.' }));
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
        h('a', { class: 'st-btn', href: '#events/' + e.id, text: 'Edit' }));
    }
    function list(title, items, empty) {
      return [h('h3', { text: title }), items.length ? h('ul', { class: 'st-list' }, items.map(row)) : h('p', { class: 'st-empty', text: empty })];
    }
    return [
      h('div', { class: 'st-head' }, h('h2', { text: 'Events' }), h('a', { class: 'st-btn st-btn--primary', href: '#events/new', text: 'Add event' })),
      h('p', { class: 'st-hint', text: 'Upcoming events are featured at the top of the home page. Once an event ends it moves to Past Actions on its own.' }),
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
          h('button', { type: 'button', class: 'st-btn st-btn--quiet', 'aria-label': 'Move ' + m.name + ' up', text: '↑', disabled: i === 0, onclick: function () { move(i, -1); } }),
          h('button', { type: 'button', class: 'st-btn st-btn--quiet', 'aria-label': 'Move ' + m.name + ' down', text: '↓', disabled: i === items.length - 1, onclick: function () { move(i, 1); } }),
          h('a', { class: 'st-btn', href: '#' + plural + '/' + m.id, text: 'Edit' })));
    }));
    return [
      h('div', { class: 'st-head' }, h('h2', { text: kind === 'member' ? 'Members' : 'Partners' }),
        h('a', { class: 'st-btn st-btn--primary', href: '#' + plural + '/new', text: kind === 'member' ? 'Add member' : 'Add partner' })),
      h('p', { class: 'st-hint', text: kind === 'member'
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

  function usage() {
    var u = {};
    function note(k, where) { if (k) (u[k] = u[k] || []).push(where); }
    S.draft.events.forEach(function (e) { note(e.poster, eventTitle(e)); note(e.poster_back, eventTitle(e)); });
    S.draft.members.forEach(function (m) { note(m.logo, m.name); });
    S.draft.partners.forEach(function (m) { note(m.logo, m.name); });
    var b = S.draft.blocks || {};
    note(b.mission_photo, 'Mission photo'); note(b.logo_small, 'Small logo'); note(b.logo_large, 'Large logo'); note(b.share_image, 'Share image');
    return u;
  }
  function viewImages() {
    var u = usage();
    var showHidden = sessionGet('showHidden') === '1';
    var list = S.media.filter(function (m) { return showHidden || !m.archived_at; });
    var grid = h('ul', { class: 'st-media' }, list.map(function (m) {
      var alt = h('input', { type: 'text', value: m.alt || '', maxlength: 300, id: 'alt-' + m.key.slice(0, 12), placeholder: 'What the image shows' });
      var save = h('button', { type: 'button', class: 'st-btn', text: 'Save description', onclick: function () {
        api('PATCH', 'media/' + m.key, { alt: alt.value }).then(refresh).then(function () { toast('Description saved to draft.'); renderChrome(); }).catch(function (e) { toast(e.message, true); });
      } });
      var used = u[m.key];
      return h('li', { class: 'st-media-item' },
        h('div', { class: 'st-thumb' }, h('img', { src: img(m.key), alt: m.alt || '', loading: 'lazy' })),
        h('div', { class: 'st-media-body' },
          h('p', { class: 'st-hint st-clip', text: m.filename || m.key.slice(0, 16) }),
          h('p', { class: 'st-hint', text: used ? 'Used by: ' + used.slice(0, 3).join(', ') + (used.length > 3 ? ' and ' + (used.length - 3) + ' more' : '') : 'Not used in the draft' }),
          h('label', { for: alt.id, text: 'Description for screen readers' }), alt,
          h('div', { class: 'st-row' }, save,
            h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: m.archived_at ? 'Put back in library' : 'Hide from library', onclick: function () {
              api('PATCH', 'media/' + m.key, { archived: !m.archived_at }).then(refresh).then(route).catch(function (e) { toast(e.message, true); });
            } }))));
    }));
    var hiddenCount = S.media.filter(function (m) { return m.archived_at; }).length;
    return [
      h('div', { class: 'st-head' }, h('h2', { text: 'Images' })),
      h('p', { class: 'st-hint', text: 'Every poster, logo and photo on the site. Images are never deleted, so older versions of the site keep working. Hiding one only removes it from this list and the image chooser.' }),
      uploadButton(function () { route(); }),
      hiddenCount ? h('p', null, h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: showHidden ? 'Stop showing hidden images' : 'Show ' + hiddenCount + ' hidden', onclick: function () { sessionSet('showHidden', showHidden ? '0' : '1'); route(); } })) : null,
      list.length ? grid : h('p', { class: 'st-empty', text: 'No images yet. Upload a poster or logo to start.' }),
    ];
  }
  function sessionGet(k) { try { return sessionStorage.getItem('st-' + k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem('st-' + k, v); } catch (e) {} }

  var CHANGE_WORD = { added: 'Added', edited: 'Edited', removed: 'Removed', hidden: 'Hidden', shown: 'Shown again', reordered: 'Reordered' };
  var KIND_WORD = { event: 'Event', member: 'Member', partner: 'Partner', block: 'Page text', media: 'Images' };
  function changeList(changes) {
    return h('ul', { class: 'st-changes' }, changes.map(function (c) {
      return h('li', null, h('strong', { text: CHANGE_WORD[c.change] + ': ' }),
        (c.change === 'reordered' ? '' : KIND_WORD[c.kind] + ' · ') + c.name + (c.hidden ? ' (hidden, will not appear)' : '') + (c.by ? ' (by ' + who(c.by) + ')' : ''));
    }));
  }
  function previewUrl(scheduled) { return location.origin + '/preview/' + S.preview_token + (scheduled ? '/scheduled' : '') + '/'; }

  function viewPublish() {
    var out = [h('div', { class: 'st-head' }, h('h2', { text: 'Publish' }))];
    var n = S.changes.length;

    // Pending schedule
    if (S.scheduled) {
      var sc = S.scheduled;
      out.push(h('section', { class: 'st-card st-card--note' },
        h('h3', { text: 'Scheduled for ' + niceUtc(sc.publish_at) + ' (New York time)' }),
        h('p', { text: 'Set up by ' + who(sc.by) + (sc.note ? '. Note: ' + sc.note : '.') + ' It will publish these changes:' }),
        sc.changes.length ? changeList(sc.changes) : h('p', { class: 'st-hint', text: 'No difference from the live site.' }),
        sc.draft_ahead ? h('p', { class: 'st-warn', text: 'The draft has been edited since this was scheduled. Those newer edits are not included. Schedule again to include them.' }) : null,
        h('p', null, h('a', { href: previewUrl(true), target: '_blank', rel: 'noopener', text: 'Preview the scheduled version' })),
        gate('Yes, cancel the schedule', 'Cancel schedule', '', function () {
          return api('DELETE', 'schedule').then(refresh).then(function () { toast('Schedule cancelled. The draft is unchanged.'); route(); });
        })));
    }

    // What is waiting
    out.push(h('section', { class: 'st-card' },
      h('h3', { text: n ? (n === 1 ? '1 unpublished change' : n + ' unpublished changes') : 'Nothing to publish' }),
      n ? changeList(S.changes) : h('p', { class: 'st-hint', text: S.live ? 'The draft matches the live site.' : 'Nothing has been published yet.' }),
      h('p', { class: 'st-row' },
        h('a', { class: 'st-btn', href: previewUrl(false), target: '_blank', rel: 'noopener', text: 'Open preview' }),
        h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Copy preview link', onclick: function () {
          navigator.clipboard.writeText(previewUrl(false)).then(function () { toast('Preview link copied.'); }, function () { toast('Copy did not work. Open the preview and copy its address.', true); });
        } })),
      h('p', { class: 'st-hint', text: 'The preview shows the whole site with your draft applied. Anyone with the link can see it, so you can send it to colleagues before publishing.' })));

    if (n) {
      var note = h('input', { type: 'text', id: 'pub-note', maxlength: 300, placeholder: 'Optional, e.g. "Added the November forum"' });
      var when = h('input', { type: 'datetime-local', id: 'pub-when', min: S.now_local });
      out.push(h('section', { class: 'st-card' },
        h('div', { class: 'st-field st-field--wide' }, h('label', { for: 'pub-note', text: 'Note for the history' }), note),
        h('h3', { text: 'Publish now' }),
        S.scheduled ? h('p', { class: 'st-warn', text: 'Publishing now cancels the scheduled publish above.' }) : null,
        gate('I have checked the preview', 'Publish now', 'st-btn--primary', function () {
          return api('POST', 'publish', { draft_rev: S.draft_rev, note: note.value }).then(refresh).then(function () { toast('Published. The live site is updated.'); route(); })
            .catch(function (e) { if (e.status === 409) return refresh().then(function () { route(); toast(e.message, true); }); throw e; });
        }),
        h('h3', { text: 'Or schedule it' }),
        h('div', { class: 'st-field' }, h('label', { for: 'pub-when', text: 'Publish at (New York time)' }), when),
        h('p', { class: 'st-hint', text: 'The draft is frozen as it is now and goes live at that time. Edits you make afterwards are not included.' + (S.scheduled ? ' This replaces the current schedule.' : '') }),
        gate('I have checked the preview', 'Schedule', '', function () {
          if (!when.value) { toast('Choose a date and time first.', true); return; }
          return api('POST', 'schedule', { draft_rev: S.draft_rev, note: note.value, publish_at: when.value.slice(0, 16) }).then(refresh).then(function () { toast('Scheduled.'); route(); })
            .catch(function (e) { if (e.status === 409) return refresh().then(function () { route(); toast(e.message, true); }); throw e; });
        })));
      if (S.live) {
        out.push(h('section', { class: 'st-card st-danger' }, h('h3', { text: 'Discard changes' }),
          h('p', { class: 'st-hint', text: 'Throws away every unpublished change listed above. The draft goes back to matching the live site. This cannot be undone.' }),
          gate('Yes, discard all unpublished changes', 'Discard changes', 'st-btn--danger', function () {
            return api('POST', 'draft/reset', {}).then(refresh).then(function () { toast('Changes discarded.'); route(); });
          })));
      }
    }

    // History
    var hist = h('section', { class: 'st-card' }, h('h3', { text: 'History' }), h('p', { class: 'st-hint', text: 'Loading…' }));
    out.push(hist);
    api('GET', 'releases').then(function (r) {
      clear(hist);
      hist.appendChild(h('h3', { text: 'History' }));
      var rows = r.releases.filter(function (v) { return v.status === 'published'; });
      if (!rows.length) { hist.appendChild(h('p', { class: 'st-empty', text: 'Each time you publish, the version is kept here so you can go back to it.' })); return; }
      hist.appendChild(h('p', { class: 'st-hint', text: 'Every published version. Restoring one makes it the live site again; your draft is left as it is.' }));
      hist.appendChild(h('ul', { class: 'st-list' }, rows.map(function (v) {
        var liveNow = S.live && v.id === S.live.id;
        var li = h('li', { class: 'st-item st-item--col' },
          h('div', { class: 'st-item-main' },
            h('p', { class: 'st-item-title', text: niceUtc(v.published_at) }),
            h('p', { class: 'st-hint', text: (v.rolled_back_from ? 'Restored by ' : v.publish_at ? 'Scheduled by ' : 'Published by ') + (v.created_by === 'seed' ? 'the site import' : who(v.created_by)) + (v.note ? ' · ' + v.note : '') }),
            liveNow ? h('p', { class: 'st-tags' }, tag('Live now', 'st-tag--ok')) : null));
        if (!liveNow) {
          li.appendChild(gate('Make this version live again', 'Restore this version', '', function () {
            return api('POST', 'releases/' + v.id + '/rollback', {}).then(refresh).then(function () { toast('Restored. That version is live again.'); route(); });
          }));
        }
        return li;
      })));
    }).catch(function (e) { clear(hist); hist.appendChild(h('p', { class: 'st-warn', text: e.message })); });
    return out;
  }

  // ---------- chrome + routing ----------
  var TABS = [['events', 'Events'], ['members', 'Members'], ['partners', 'Partners'], ['text', 'Page text'], ['images', 'Images'], ['publish', 'Publish']];
  var main, nav, statusBar;

  function renderChrome() {
    var cur = (location.hash.slice(1) || 'events').split('/')[0];
    clear(nav);
    TABS.forEach(function (t) {
      var a = h('a', { href: '#' + t[0], text: t[1], 'aria-current': cur === t[0] ? 'page' : null });
      if (t[0] === 'publish' && S.changes.length) a.appendChild(h('span', { class: 'st-count', text: String(S.changes.length), 'aria-label': S.changes.length + ' unpublished' }));
      nav.appendChild(a);
    });
    clear(statusBar);
    var n = S.changes.length;
    statusBar.className = 'st-status' + (n ? ' st-status--pending' : '');
    statusBar.appendChild(h('span', { text: n ? (n === 1 ? '1 unpublished change in the draft.' : n + ' unpublished changes in the draft.') : 'The draft matches the live site.' }));
    if (S.scheduled) statusBar.appendChild(h('span', { text: ' A publish is scheduled for ' + niceUtc(S.scheduled.publish_at) + '.' }));
    if (n && cur !== 'publish') statusBar.appendChild(h('a', { href: '#publish', text: 'Review and publish' }));
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
    else view = viewEvents();
    renderChrome();
    clear(main);
    add(main, view);
    window.scrollTo(0, 0);
  }

  function boot() {
    clear(app);
    nav = h('nav', { class: 'st-nav', 'aria-label': 'Sections' });
    statusBar = h('div', { class: 'st-status', role: 'status' });
    main = h('main', { class: 'st-main', id: 'main' });
    add(app, [
      h('header', { class: 'st-top' },
        h('div', { class: 'st-top-row' },
          h('h1', { text: 'Site editor' }),
          h('p', { class: 'st-me' }, h('span', { text: S.me }), ' · ', h('a', { href: '/', target: '_blank', rel: 'noopener', text: 'View live site' }))),
        nav),
      h('div', { class: 'st-signin', id: 'st-signin', hidden: true, role: 'alert' },
        h('span', { text: 'Your sign-in has expired. Nothing on this page is lost. ' }),
        h('a', { href: '/studio', target: '_blank', rel: 'noopener', text: 'Sign in again' }),
        h('span', { text: ' in a new tab, then come back here and continue. ' }),
        h('button', { type: 'button', class: 'st-btn st-btn--quiet', text: 'Dismiss', onclick: function () { document.getElementById('st-signin').hidden = true; } })),
      statusBar, main,
      h('div', { class: 'st-toast', id: 'st-toast', role: 'status', 'aria-live': 'polite' }),
    ]);
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
