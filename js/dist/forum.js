(function () {
  function unwrapModule(module) {
    if (!module) return null;
    return module.default || module;
  }

  var reg = flarum.reg;
  var ext = null;
  var TagSelectionModal = null;
  var TagLinkButton = null;
  var TagLabel = null;
  var booted = false;
  var bootedLinks = false;

  function normalizeIdArray(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var v = value[i];
      var n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (isFinite(n) && n > 0) out.push(String(n));
    }
    // unique
    out.sort();
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      if (j === 0 || out[j] !== out[j - 1]) uniq.push(out[j]);
    }
    return uniq;
  }

  function getSecondaryPrimaryIds(tag) {
    try {
      var attrs = tag && tag.data && tag.data.attributes ? tag.data.attributes : null;
      return normalizeIdArray(attrs && attrs.secondaryPrimaryTagIds ? attrs.secondaryPrimaryTagIds : []);
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
      var attrs = tag && tag.data && tag.data.attributes ? tag.data.attributes : null;
      var v = attrs ? attrs.secondaryListed : undefined;
      return v === undefined || v === null ? true : !!v;
    } catch (_e) {
      return true;
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

        // If no primary selected anymore, drop restricted secondary tags.
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

  function tryBoot() {
    if (booted) return;
    if (!ext || !TagSelectionModal) return;

    booted = true;

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

    ext.override(TagSelectionModal.prototype, 'toggleTag', function (original, tag) {
      original(tag);

      // If primary selection changed, remove restricted secondaries that are no longer allowed.
      var changed = pruneDisallowedSelectedSecondaries(this);
      if (changed && typeof m !== 'undefined' && m.redraw) {
        m.redraw();
      }
    });

    ext.override(TagSelectionModal.prototype, 'removeTag', function (original, tag) {
      original(tag);

      // Covers removing a selected tag via clicking its "pill".
      var changed = pruneDisallowedSelectedSecondaries(this);
      if (changed && typeof m !== 'undefined' && m.redraw) {
        m.redraw();
      }
    });
  }

  function tryBootLinks() {
    if (bootedLinks) return;
    if (!ext || !TagLinkButton || !TagLabel) return;

    bootedLinks = true;

    // Hide unlisted secondary tags from tag lists (sidebar, /tags, etc.).
    ext.override(TagLinkButton.prototype, 'view', function (original, vnode) {
      try {
        var tag = (vnode && vnode.attrs && vnode.attrs.tag) || (this.attrs && this.attrs.tag);
        if (tag && !isPrimary(tag) && !isSecondaryListed(tag)) return null;
      } catch (_e) {}
      return original(vnode);
    });

    // Make unlisted secondary tags non-clickable everywhere they appear as labels.
    ext.override(TagLabel.prototype, 'view', function (original, vnode) {
      try {
        var tag = (vnode && vnode.attrs && vnode.attrs.tag) || (this.attrs && this.attrs.tag);
        if (tag && !isPrimary(tag) && !isSecondaryListed(tag)) {
          // TagLabel respects attrs.link; force it off for this render.
          if (this.attrs) {
            var prev = this.attrs.link;
            this.attrs.link = false;
            var out = original(vnode);
            this.attrs.link = prev;
            return out;
          }
        }
      } catch (_e) {}
      return original(vnode);
    });
  }

  function loadModule(namespace, id, assign) {
    var current = unwrapModule(reg.get(namespace, id));
    if (current) {
      assign(current);
      tryBoot();
      tryBootLinks();
      return;
    }

    reg.onLoad(namespace, id, function (module) {
      assign(unwrapModule(module));
      tryBoot();
      tryBootLinks();
    });
  }

  loadModule('core', 'common/extend', function (module) {
    ext = module;
  });

  loadModule('flarum-tags', 'common/components/TagSelectionModal', function (module) {
    TagSelectionModal = module;
  });

  loadModule('flarum-tags', 'common/components/TagLinkButton', function (module) {
    TagLinkButton = module;
  });

  loadModule('flarum-tags', 'common/components/TagLabel', function (module) {
    TagLabel = module;
  });
})();

module.exports = { extend: [] };
