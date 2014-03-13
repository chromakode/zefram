// mock page init callback so main JS can be loaded async
page = {
  init: function() {
    this._init = arguments
  }
}
