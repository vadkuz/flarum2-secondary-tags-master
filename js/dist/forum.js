(function () {
  function unwrapModule(module) {
    if (!module) return null;
    return module.default || module;
  }

  var reg = flarum.reg;
  var ext = null;
  var TagSelectionModal = null;
  var booted = false;

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

  function loadModule(namespace, id, assign) {
    var current = unwrapModule(reg.get(namespace, id));
    if (current) {
      assign(current);
      tryBoot();
      return;
    }

    reg.onLoad(namespace, id, function (module) {
      assign(unwrapModule(module));
      tryBoot();
    });
  }

  loadModule('core', 'common/extend', function (module) {
    ext = module;
  });

  loadModule('flarum-tags', 'common/components/TagSelectionModal', function (module) {
    TagSelectionModal = module;
  });
})();

module.exports = { extend: [] };
