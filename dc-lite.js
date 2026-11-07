// Small runtime that renders the prototype's HTML templates with React.
(function () {
  var R = window.React;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var EVENTS = { onclick: 'onClick', onchange: 'onChange', onkeydown: 'onKeyDown', onsubmit: 'onSubmit' };
  var VOID = { input: 1, img: 1, br: 1, hr: 1, path: 1, circle: 1, rect: 1 };
  var templates = {};
  var logic = {};
  var classes = {};
  var helmetDone = {};

  document.querySelectorAll('template[data-dc]').forEach(function (t) { templates[t.dataset.dc] = t; });
  document.querySelectorAll('script[data-dc-logic]').forEach(function (s) { logic[s.dataset.dcLogic] = s.textContent; });

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    return path.split('.').reduce(function (value, key) {
      return value === undefined || value === null ? undefined : value[key];
    }, scope);
  }

  function interpolate(text, scope) {
    return text.replace(HOLE, function (_, path) {
      var value = lookup(path, scope);
      return value === undefined || value === null ? '' : String(value);
    });
  }

  function attrValue(raw, scope) {
    var whole = raw.match(WHOLE);
    if (whole) return lookup(whole[1], scope);
    return raw.indexOf('{{') >= 0 ? interpolate(raw, scope) : raw;
  }

  function camel(name) {
    return name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }

  function styleObject(text) {
    var out = {};
    text.split(';').forEach(function (part) {
      var i = part.indexOf(':');
      if (i > 0) out[camel(part.slice(0, i).trim())] = part.slice(i + 1).trim();
    });
    return out;
  }

  function propsOf(el, scope) {
    var props = {};
    Array.prototype.forEach.call(el.attributes, function (attr) {
      var name = attr.name;
      var value = attrValue(attr.value, scope);
      if (name.indexOf('hint-') === 0) return;
      if (name === 'class') props.className = value;
      else if (name === 'style') props.style = styleObject(String(value));
      else if (name === 'autofocus') props.autoFocus = value;
      else if (EVENTS[name]) props[EVENTS[name]] = value;
      else if (name.indexOf('aria-') === 0 || name.indexOf('data-') === 0) props[name] = value;
      else props[camel(name)] = value;
    });
    return props;
  }

  function renderChildren(parent, scope) {
    var out = [];
    parent.childNodes.forEach(function (node) {
      var rendered = renderNode(node, scope);
      if (rendered !== null && rendered !== undefined) out.push(rendered);
    });
    return out;
  }

  function fragment(key, children) {
    return R.createElement.apply(R, [R.Fragment, { key: key }].concat(children));
  }

  function renderNode(node, scope) {
    if (node.nodeType === 3) {
      if (!node.nodeValue.trim() && node.nodeValue.indexOf('\n') >= 0) return null;
      return interpolate(node.nodeValue.replace(/\s+/g, ' '), scope);
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    if (tag === 'helmet') return null;
    if (tag === 'sc-if') {
      if (!attrValue(node.getAttribute('value'), scope)) return null;
      return fragment(null, renderChildren(node, scope));
    }
    if (tag === 'sc-for') {
      var list = attrValue(node.getAttribute('list'), scope) || [];
      var as = node.getAttribute('as');
      return fragment(null, list.map(function (item, index) {
        var child = Object.create(scope);
        child[as] = item;
        child.$index = index;
        return fragment(index, renderChildren(node, child));
      }));
    }
    if (tag === 'dc-import') {
      var importProps = {};
      Array.prototype.forEach.call(node.attributes, function (attr) {
        if (attr.name !== 'name' && attr.name.indexOf('hint-') !== 0) importProps[camel(attr.name)] = attrValue(attr.value, scope);
      });
      return R.createElement(componentFor(node.getAttribute('name')), importProps);
    }
    var props = propsOf(node, scope);
    if (VOID[tag]) return R.createElement(tag, props);
    return R.createElement.apply(R, [tag, props].concat(renderChildren(node, scope)));
  }

  function loadHelmet(name) {
    if (helmetDone[name]) return;
    helmetDone[name] = true;
    var helmet = templates[name].content.querySelector('helmet');
    if (helmet) helmet.childNodes.forEach(function (n) { if (n.nodeType === 1) document.head.appendChild(n.cloneNode(true)); });
  }

  function componentFor(name) {
    if (classes[name]) return classes[name];
    loadHelmet(name);
    var Base = class DCLogic extends R.Component {};
    var Logic = new Function('DCLogic', logic[name] + '\nreturn Component;')(Base);
    var content = templates[name].content;
    classes[name] = class extends Logic {
      render() { return fragment(null, renderChildren(content, this.renderVals())); }
    };
    return classes[name];
  }

  // A dc-import inside a template needs its helmet loaded before it first opens.
  Object.keys(templates).forEach(loadHelmet);
  var entry = document.body.dataset.entry;
  window.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(componentFor(entry)));
})();
