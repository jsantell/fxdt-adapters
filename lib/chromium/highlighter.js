const {emit} = require("../devtools/sdk/event/core"); // Needs to share a loader with protocol.js, boo.
const task = require("../util/task");

const protocol = require("../devtools/server/protocol");
const {asyncMethod} = require("../util/protocol-extra");
const {Actor, ActorClass, Pool, method, Arg, Option, RetVal, types} = protocol;

const timers = require("sdk/timers");
const HIGHLIGHTER_PICKED_TIMER = 1000;

var ChromiumHighlighterActor = protocol.ActorClass({
  typeName: "chromium_highlighter",

  initialize: function(inspector, autohide) {
    Actor.prototype.initialize.call(this, null);
    this.inspector = inspector;

    var blue = {
      r: 0,
      g: 0,
      b: 255,
    };
    this.highlightConfig = {
      showInfo: true,
      contentColor: { r: 0x80, g: 0xd4, b: 0xff, a: 0.4 },
      paddingColor: { r: 0x66, g: 0xcc, b: 0x52, a: 0.4 },
      borderColor: { r: 0xff, g: 0xe4, b: 0x31, a: 0.4 },
      marginColor: { r: 0xd8, g: 0x9b, b: 0x28, a: 0.4 },
      eventTargetColor: blue
    }
  },

  get conn() { return this.inspector.conn },
  get rpc() { return this.inspector.rpc },

  showBoxModel: asyncMethod(function*(node, options={}) {
    let response = yield this.rpc.request("DOM.highlightNode", {
      nodeId: node.handle.nodeId,
      highlightConfig: this.highlightConfig,
    });
  }, {
    request: {
      node: Arg(0, "chromium_domnode"),
      region: Option(1)
    }
  }),

  hideBoxModel: asyncMethod(function*() {
    yield this.rpc.request("DOM.hideHighlight");
  }),

  pick: asyncMethod(function*() {
    yield this.rpc.request("DOM.setInspectModeEnabled", {
      enabled: true,
      highlightConfig: this.highlightConfig
    });

    this.inspector.walker.on("picker-node-picked", task.async(function*(args) {
      yield this.rpc.request("DOM.setInspectModeEnabled", {
        enabled: false
      });
      timers.setTimeout(function() {}, HIGHLIGHTER_PICKED_TIMER);
    }));
//    events.emit(this._walker, "picker-node-picked", this._findAndAttachElement(event));
//    events.emit(this._walker, "picker-node-hovered", res);
  }),

  cancelPick: method(function() {
    yield this.rpc.request("DOM.setInspectModeEnabled", {
      enabled: false
    });
  }),
});
exports.ChromiumHighlighterActor = ChromiumHighlighterActor;

