var _ = require('lodash')
var Q = require('q')
var Backbone = require('backbone')

if (typeof window != 'undefined') {
  var $ = Backbone.$ = require('jquery')
} else {
  var $ = Backbone.$ = require('cheerio')
  // Add noop on/off methods so event hookups are ignored server side
  Backbone.$.prototype.on = function() {}
  Backbone.$.prototype.off = function() {}
}

module.exports = {
  _: _,
  $: $,
  Backbone: Backbone
}


var ModelCache = module.exports.ModelCache = function(config) {
  this.models = config.models
  this.index = {}
}
_.extend(ModelCache.prototype, {
  _key: function(clsName, options) {
    var pairs = _.pairs(options)
    pairs.sort()
    return JSON.stringify([clsName, pairs])
  },

  read: function(clsName, options) {
    // todo: add caching options like ttl
    var key = this._key(clsName, options)
    var existing = _.has(this.index, key)
    var model = this.index[key] = this.index[key] || new this.models[clsName](null, options)

    if (existing) {
      return Q(model)
    } else {
      return model.fetch().then(function() { return model })
    }
  },

  create: function(clsName, options, data) {
    var key = this._key(clsName, options)
    this.index[key] = new this.models[clsName](data, options)
  }
})


var Page = module.exports.Page = function() {
  this.clientLoaded = false
  this.views = []
}
_.extend(Page.prototype, Backbone.Events, {
  setup: function(config) {
    this.modelCache = new ModelCache({models: config.models})
    this.routes = config.routes
    this.layouts = config.layouts
  },

  change: function(layoutName, params) {
    var self = this

    function load(clsName, options) {
      return self.modelCache.read(clsName, options)
    }

    function present(view) {
      self.views.push(view)
      view.render().$el.appendTo('body')
      view.clientPresent()
    }

    _.each(self.views, function(view) {
      view.remove()
    })
    this.views = []

    Q.all(self.layouts[layoutName](load, present, params)).done()
  },

  init: function(layoutName, params, modelData) {
    var self = this

    function load(clsName, options) {
      return self.modelCache.read(clsName, options)
    }

    function present(view, parentEl) {
      // hook up views by finding existing elements

      // build selector from view
      // XXX can be optimized by doing filtering instead of creating selector
      var selector = []
      if (view.tagName) {
        selector.push(view.tagName)
      }
      if (view.id) {
        selector.push('#' + view.id)
      }
      if (view.className) {
        selector.push('.' + view.className.split(' ').join('.'))
      }
      if (view.attributes) {
        _.each(_.result(view, 'attributes'), function(value, name) {
          selector.push('[' + name + '="' + value + '"]')
        })
      }
      selector = selector.join('')

      if (!parentEl) {
        view.render()
        self.views.push(view)
      }
      view.setElement($(selector, parentEl))

      if (!parentEl) {
        view.clientPresent()
      }

      _.each(view.nestedViews, function(nestedView) {
        present(nestedView, view.el)
      })
    }

    _.each(modelData, function(modelDetails) {
      self.modelCache.create.apply(self.modelCache, modelDetails)
    })

    Q.all(self.layouts[layoutName](load, present, params)).done(function() {
      self.clientLoaded = true
    })

    this.router = new Backbone.Router()
    _.each(self.routes, function(routeData, route) {
      self.router.route(route, route, function() {
        if (_.isFunction(routeData)) {
          routeData = routeData.apply(this, arguments)
        }
        self.change(routeData.layout, routeData.params)
      })
    })

    $('body').on('click', 'a', function(ev) {
      var dest = $(ev.target).attr('href')
      dest = dest.replace(/\/$/, '')  // strip trailing slash

      // skip external links
      if (/^\w+:\/\//.test(dest)) {
        return
      }

      // don't reload the current page
      if (dest == Backbone.history.getFragment()) {
        ev.preventDefault()
        return
      }

      if (Backbone.history.navigate(dest, {trigger: true}) !== false) {
        ev.preventDefault()
      }
    })

    Backbone.history.start({pushState: true, silent: true})
    this.trigger('init')
  }
})
