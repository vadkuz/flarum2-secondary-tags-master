(function () {
  function unwrapModule(module) {
    if (!module) return null;
    return module.default || module;
  }

  var reg = flarum.reg;

  var app = null;
  var ext = null;
  var TagSelectionModal = null;
  var TagListState = null;
  var tagLabel = null;

  var bootedSelection = false;
  var bootedLists = false;
  var bootedLabel = false;

  var routePatched = false;
  var styleInjected = false;

  function normalizeIdArray(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var v = value[i];
      var n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (isFinite(n) && n > 0) out.push(String(n));
    }
    out.sort();
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      if (j === 0 || out[j] !== out[j - 1]) uniq.push(out[j]);
    }
    return uniq;
  }

  function getAttr(tag, key) {
    try {
      if (tag && typeof tag.attribute === 'function') return tag.attribute(key);
    } catch (_e) {}

    try {
      var attrs = tag && tag.data && tag.data.attributes ? tag.data.attributes : null;
      return attrs ? attrs[key] : undefined;
    } catch (_e2) {}

    return undefined;
  }

  function boolDefaultTrue(v) {
    if (v === undefined || v === null) return true;
    if (v === false) return false;
    if (v === 0) return false;
    if (v === '0') return false;
    return !!v;
  }

  function getSecondaryPrimaryIds(tag) {
    try {
      return normalizeIdArray(getAttr(tag, 'secondaryPrimaryTagIds') || []);
    } catch (_e) {
      return [];
    }
  }

  function isPrimary(tag) {
    try {
      if (!tag) return false;
      if (typeof tag.isPrimaryParent === 'function') return !!tag.isPrimaryParent();
      if (typeof tag.isPrimary === 'function') return !!tag.isPrimary();
    } catch (_e) {}
    return false;
  }

  function isSecondaryListed(tag) {
    try {
      if (!tag) return true;
      if (isPrimary(tag)) return true;
      return boolDefaultTrue(getAttr(tag, 'secondaryListed'));
    } catch (_e) {
      return true;
    }
  }

  function isUnlistedSecondary(tag) {
    try {
      return !!tag && !isPrimary(tag) && !isSecondaryListed(tag);
    } catch (_e) {
      return false;
    }
  }

  function isGlobalSecondaryTag(tag) {
    try {
      if (!tag) return false;
      // Global secondary = not primary parent AND no parent.
      if (typeof tag.isPrimaryParent === 'function' && tag.isPrimaryParent()) return false;
      if (typeof tag.isChild === 'function' && tag.isChild()) return false;
      return true;
    } catch (_e) {}
    return false;
  }

  function selectedPrimaryIds(modal) {
    try {
      var selected = modal && modal.selected ? modal.selected : [];
      return normalizeIdArray(
        selected
          .filter(function (t) {
            try {
              return typeof t.isPrimaryParent === 'function' && t.isPrimaryParent();
            } catch (_e) {
              return false;
            }
          })
          .map(function (t) {
            return t.id && t.id();
          })
      );
    } catch (_e) {
      return [];
    }
  }

  function isAllowedSecondaryForSelection(modal, tag) {
    if (!isGlobalSecondaryTag(tag)) return true;

    var allowedPrimaries = getSecondaryPrimaryIds(tag);
    if (!allowedPrimaries.length) return true; // cross-cutting

    var selectedPrimaries = selectedPrimaryIds(modal);
    if (!selectedPrimaries.length) return false;

    for (var i = 0; i < allowedPrimaries.length; i++) {
      if (selectedPrimaries.indexOf(allowedPrimaries[i]) !== -1) return true;
    }

    return false;
  }

  function pruneDisallowedSelectedSecondaries(modal) {
    if (!modal || !Array.isArray(modal.selected)) return false;

    var selectedPrimaries = selectedPrimaryIds(modal);
    var changed = false;

    modal.selected = modal.selected.filter(function (t) {
      try {
        if (!isGlobalSecondaryTag(t)) return true;

        var allowedPrimaries = getSecondaryPrimaryIds(t);
        if (!allowedPrimaries.length) return true;

        if (!selectedPrimaries.length) {
          changed = true;
          return false;
        }

        for (var i = 0; i < allowedPrimaries.length; i++) {
          if (selectedPrimaries.indexOf(allowedPrimaries[i]) !== -1) return true;
        }

        changed = true;
        return false;
      } catch (_e) {
        return true;
      }
    });

    return changed;
  }

  function filterListedTags(tags) {
    if (!Array.isArray(tags)) return tags;

    return tags.filter(function (t) {
      try {
        return isPrimary(t) || isSecondaryListed(t);
      } catch (_e) {
        return true;
      }
    });
  }

  function tryBootSelection() {
    if (bootedSelection) return;
    if (!ext || !TagSelectionModal) return;

    bootedSelection = true;

    ext.override(TagSelectionModal.prototype, 'getFilteredTags', function (original) {
      var tags = original();
      var modal = this;

      return tags.filter(function (t) {
        // Never hide currently selected tags from the list.
        try {
          if (modal.selected && modal.selected.indexOf(t) !== -1) return true;
        } catch (_e) {}

        return isAllowedSecondaryForSelection(modal, t);
      });
    });

    function redraw() {
      if (typeof m !== 'undefined' && m.redraw) m.redraw();
    }

    ext.override(TagSelectionModal.prototype, 'toggleTag', function (original, tag) {
      original(tag);

      if (pruneDisallowedSelectedSecondaries(this)) redraw();
    });

    ext.override(TagSelectionModal.prototype, 'removeTag', function (original, tag) {
      original(tag);

      if (pruneDisallowedSelectedSecondaries(this)) redraw();
    });
  }

  function tryBootLists() {
    if (bootedLists) return;
    if (!ext || !TagListState) return;

    bootedLists = true;

    // Filter unlisted secondary tags from the data returned by TagListState,
    // without removing them from the store (so they can still appear on discussions).
    ext.override(TagListState.prototype, 'load', function (original, includes) {
      var res = original(includes);
      if (res && typeof res.then === 'function') {
        return res.then(filterListedTags);
      }
      return filterListedTags(res);
    });

    ext.override(TagListState.prototype, 'query', function (original, includes) {
      var res = original(includes);
      if (res && typeof res.then === 'function') {
        return res.then(filterListedTags);
      }
      return filterListedTags(res);
    });
  }

  function tryBootLabel() {
    if (bootedLabel) return;
    if (!tagLabel) return;

    bootedLabel = true;

    // Try to make unlisted secondary tags non-clickable when tagLabel is resolved via flarum.reg.
    // Note: some call sites import the helper directly, so we also patch route helpers + CSS below.
    var original = tagLabel;
    var wrapped = function (tag, attrs) {
      try {
        if (isUnlistedSecondary(tag)) {
          attrs = attrs || {};
          // Ensure we don't mutate caller's attrs.
          var copy = {};
          for (var k in attrs) copy[k] = attrs[k];
          var baseClass = copy.className ? String(copy.className) : '';
          copy.className = (baseClass + ' SecondaryTagsMaster-unlisted').trim();
          copy.link = false;
          return original(tag, copy);
        }
      } catch (_e) {}

      return original(tag, attrs);
    };

    reg.add('flarum-tags', 'common/helpers/tagLabel', wrapped);
  }

  function injectStyle() {
    if (styleInjected) return;
    if (typeof document === 'undefined') return;

    styleInjected = true;

    var id = 'secondary-tags-master-rules';
    if (document.getElementById(id)) return;

    var css =
      // Disable navigation for unlisted tags wherever they are rendered as TagLabel/TagLinkButton links.
      '.TagLabel[href=\"#\"],.TagLinkButton[href=\"#\"]{pointer-events:none;cursor:default;text-decoration:none;}' +
      '.TagLabel[href=\"#\"]:hover,.TagLinkButton[href=\"#\"]:hover{text-decoration:none;}' +
      // Hide from sidebar lists.
      '.IndexPage-nav .TagLinkButton[href=\"#\"]{display:none !important;}' +
      '.IndexPage-nav .TagLinkButton.SecondaryTagsMaster-unlisted{display:none !important;}' +
      // Hide from /tags and FoF Categories tag clouds (rendered as <a> or <span>).
      '.TagsPage .TagLabel[href=\"#\"],.TagsPage .TagCloud .TagLabel:not([href]),.TagsPage .TagCloud .TagLabel.SecondaryTagsMaster-unlisted{display:none !important;}' +
      '.CategoriesPage .TagCloud .TagLabel:not([href]),.CategoriesPage .TagCloud .TagLabel.SecondaryTagsMaster-unlisted{display:none !important;}' +
      '';

    var style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));

    if (document.head) document.head.appendChild(style);
  }

  function findTagBySlug(slug) {
    try {
      if (!app || !app.store) return null;
      var all = app.store.all('tags') || [];
      for (var i = 0; i < all.length; i++) {
        var t = all[i];
        if (!t) continue;
        if (typeof t.slug === 'function' && t.slug() === slug) return t;
        // Fallback for safety.
        var s = getAttr(t, 'slug');
        if (s && String(s) === slug) return t;
      }
    } catch (_e) {}

    return null;
  }

  function isUnlistedSlug(slug) {
    var tag = findTagBySlug(slug);
    return isUnlistedSecondary(tag);
  }

  function patchAppRoute() {
    if (routePatched) return;
    if (!app || typeof app.route !== 'function') return;

    routePatched = true;

    var originalRoute = app.route;

    var wrappedRoute = function (name, params) {
      try {
        if (name === 'tag' && params && typeof params.tags === 'string') {
          var slugs = String(params.tags || '').split('+');
          for (var i = 0; i < slugs.length; i++) {
            var slug = slugs[i];
            if (slug && isUnlistedSlug(slug)) return '#';
          }
        }
      } catch (_e) {}

      return originalRoute.apply(app, arguments);
    };

    // Preserve helper methods like app.route.user / app.route.tag, etc.
    try {
      var props = Object.getOwnPropertyNames(originalRoute);
      for (var p = 0; p < props.length; p++) {
        var key = props[p];
        if (key === 'length' || key === 'name' || key === 'prototype') continue;
        try {
          Object.defineProperty(wrappedRoute, key, Object.getOwnPropertyDescriptor(originalRoute, key));
        } catch (_e2) {}
      }
    } catch (_e3) {}

    // Also wrap the route helper used by some call sites: app.route.tag(tag)
    try {
      if (typeof originalRoute.tag === 'function') {
        var originalTagHelper = originalRoute.tag;
        wrappedRoute.tag = function (tag) {
          try {
            if (isUnlistedSecondary(tag)) return '#';
          } catch (_e4) {}

          return originalTagHelper.apply(originalRoute, arguments);
        };
      }
    } catch (_e5) {}

    app.route = wrappedRoute;
  }

  function loadModule(namespace, id, assign) {
    var current = unwrapModule(reg.get(namespace, id));
    if (current) {
      assign(current);
      tryBootSelection();
      tryBootLists();
      tryBootLabel();
      return;
    }

    reg.onLoad(namespace, id, function (module) {
      assign(unwrapModule(module));
      tryBootSelection();
      tryBootLists();
      tryBootLabel();
    });
  }

  loadModule('core', 'forum/app', function (module) {
    app = module;
  });

  loadModule('core', 'common/extend', function (module) {
    ext = module;
  });

  loadModule('flarum-tags', 'common/components/TagSelectionModal', function (module) {
    TagSelectionModal = module;
  });

  loadModule('flarum-tags', 'common/states/TagListState', function (module) {
    TagListState = module;
  });

  loadModule('flarum-tags', 'common/helpers/tagLabel', function (module) {
    tagLabel = module;
  });

  // Run after extensions boot, when app.route helpers are present.
  loadModule('core', 'forum/app', function () {
    if (app && app.initializers && typeof app.initializers.add === 'function') {
      app.initializers.add(
        'vadkuz-flarum2-secondary-tags-master',
        function () {
          injectStyle();
          patchAppRoute();
        },
        -100
      );
    }
  });
})();

module.exports = { extend: [] };
