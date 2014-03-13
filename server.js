var fs = require('fs')
var _ = require('lodash')
var Q = require('q')
var cheerio = require('cheerio')


module.exports = {}

/* config should contain: {
 *   routes: a mapping of route -> route data
 *   layouts: a mapping of layout id -> layout function
 *   models: a mapping of model id -> model constructor
 *   pageStart: a template function to output at the beginning of the page
 *   pageEnd: a template function to output at the end of the page
 *   initCSS: initial CSS to send quickly to the client
 *   initJS: initial JS to send quickly to the client
 * }
 */
module.exports.setup = function(app, config) {
  _.each(config.routes, function(routeData, route) {
    app.get('/' + route, function(req, res) {
      if (_.isFunction(routeData)) {
        routeData = routeData.apply(this, req.params)
      }
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      sendPage(routeData, config, res)
    })
  })
}

function sendPage(routeData, config, res) {
  var modelData = []

  function load(clsName, options) {
    var model = new config.models[clsName](null, options)
    return model.fetch().then(function(result) {
      modelData.push([
        clsName,
        options,
        model.toJSON()
      ])
      return model
    })
  }

  function present(view) {
    res.write(cheerio.html(view.render().$el))
  }

  res.write(config.pageStart({
    title: routeData.title,
    css: config.initCSS,
    js: config.initJS,
  }))

  var tasks = config.layouts[routeData.layout](load, present, routeData.params)

  Q.all(tasks).done(function() {
    res.write(config.pageEnd({
      layout_name: routeData.layout,
      layout_params: routeData.params,
      preload_data: modelData,
    }))
    res.end()
  })
}
