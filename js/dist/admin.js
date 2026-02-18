(function () {
  function unwrapModule(module) {
    if (!module) return null;
    return module.default || module;
  }

  var reg = flarum.reg;
  var app = null;
  var ext = null;
  var Stream = null;
  var EditTagModal = null;
  var booted = false;

  function normalizeIdArray(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    for (var i = 0; i < value.length; i++) {
      var v = value[i];
      var n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (isFinite(n) && n > 0) out.push(n);
    }
    // unique
    out.sort(function (a, b) { return a - b; });
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      if (j === 0 || out[j] !== out[j - 1]) uniq.push(out[j]);
    }
    return uniq;
  }

  function getSecondaryPrimaryIdsFromTag(tag) {
    try {
      var attrs = tag && tag.data && tag.data.attributes ? tag.data.attributes : null;
      return normalizeIdArray(attrs && attrs.secondaryPrimaryTagIds ? attrs.secondaryPrimaryTagIds : []);
    } catch (_e) {
      return [];
    }
  }

  function isGlobalSecondaryTag(tag) {
    // "Global secondary" in Flarum tags = not primary AND not a child (no parent_id).
    try {
      if (!tag) return false;
      if (typeof tag.isPrimary === 'function' && tag.isPrimary()) return false;
      if (typeof tag.isChild === 'function' && tag.isChild()) return false;
      return true;
    } catch (_e) {}
    return false;
  }

  function tryBoot() {
    if (booted) return;
    if (!app || !ext || !Stream || !EditTagModal) return;

    booted = true;

    ext.extend(EditTagModal.prototype, 'oninit', function () {
      if (!this.secondaryPrimaryTagIds) {
        this.secondaryPrimaryTagIds = Stream(getSecondaryPrimaryIdsFromTag(this.tag));
      }
    });

    ext.extend(EditTagModal.prototype, 'fields', function (items) {
      // For secondary tags: show a clearer "Show in All Discussions" checkbox.
      if (this.tag && typeof this.tag.isPrimary === 'function' && !this.tag.isPrimary()) {
        items.remove('hidden');
        items.add(
          'showInAllDiscussions',
          m('div', { className: 'Form-group' }, [
            m('label', { className: 'checkbox' }, [
              m('input', {
                type: 'checkbox',
                checked: !this.isHidden(),
                onchange: function (e) {
                  var checked = !!(e && e.target && e.target.checked);
                  // core isHidden = inverse of "show"
                  this.isHidden(!checked);
                }.bind(this),
              }),
              app.translator.trans('vadkuz-flarum2-secondary-tags-master.admin.edit_tag.show_in_all_discussions_label'),
            ]),
            m('div', { className: 'helpText' }, app.translator.trans('vadkuz-flarum2-secondary-tags-master.admin.edit_tag.show_in_all_discussions_help')),
          ]),
          10
        );
      }

      // Only for global secondary tags (secondary tags without a parent_id): allowed primary tags list.
      if (!isGlobalSecondaryTag(this.tag)) return;

      // Allowed primary tags list.
      var primaryTags = app.store
        .all('tags')
        .filter(function (t) {
          try {
            return typeof t.isPrimary === 'function' && t.isPrimary() && (typeof t.isChild !== 'function' || !t.isChild());
          } catch (_e) {
            return false;
          }
        })
        .slice()
        .sort(function (a, b) {
          var ap = typeof a.position === 'function' ? a.position() : null;
          var bp = typeof b.position === 'function' ? b.position() : null;
          if (ap === null && bp === null) return String(a.name && a.name()).localeCompare(String(b.name && b.name()));
          if (ap === null) return 1;
          if (bp === null) return -1;
          return ap - bp;
        });

      items.add(
        'allowedPrimaryTags',
        m('div', { className: 'Form-group' }, [
          m('label', app.translator.trans('vadkuz-flarum2-secondary-tags-master.admin.edit_tag.allowed_primary_label')),
          m('div', { className: 'helpText' }, app.translator.trans('vadkuz-flarum2-secondary-tags-master.admin.edit_tag.allowed_primary_help')),
          m(
            'div',
            { style: { marginTop: '8px' } },
            primaryTags.map(
              function (t) {
                var selected = normalizeIdArray(this.secondaryPrimaryTagIds ? this.secondaryPrimaryTagIds() : []);
                var id = parseInt(String(t.id && t.id()), 10);
                var isChecked = selected.indexOf(id) !== -1;

                return m('label', { className: 'checkbox', style: { display: 'block', margin: '6px 0' } }, [
                  m('input', {
                    type: 'checkbox',
                    checked: isChecked,
                    onchange: function (e) {
                      var checked = !!(e && e.target && e.target.checked);
                      var current = normalizeIdArray(this.secondaryPrimaryTagIds ? this.secondaryPrimaryTagIds() : []);
                      var idx = current.indexOf(id);

                      if (checked && idx === -1) current.push(id);
                      if (!checked && idx !== -1) current.splice(idx, 1);

                      if (this.secondaryPrimaryTagIds) this.secondaryPrimaryTagIds(normalizeIdArray(current));
                    }.bind(this),
                  }),
                  String(t.name && t.name()),
                ]);
              }.bind(this)
            )
          ),
        ]),
        9
      );
    });

    ext.override(EditTagModal.prototype, 'submitData', function (original) {
      var data = original();

      // Only send this attribute for global secondary tags.
      if (isGlobalSecondaryTag(this.tag) && this.secondaryPrimaryTagIds) {
        data.secondaryPrimaryTagIds = normalizeIdArray(this.secondaryPrimaryTagIds());
      }

      return data;
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

  loadModule('core', 'admin/app', function (module) {
    app = module;
  });

  loadModule('core', 'common/extend', function (module) {
    ext = module;
  });

  loadModule('core', 'common/utils/Stream', function (module) {
    Stream = module;
  });

  loadModule('flarum-tags', 'admin/components/EditTagModal', function (module) {
    EditTagModal = module;
  });
})();

module.exports = { extend: [] };
