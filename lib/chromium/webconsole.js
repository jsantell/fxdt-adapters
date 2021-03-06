const {Class} = require("sdk/core/heritage");
const {emit} = require("../devtools/sdk/event/core"); // Needs to share a loader with protocol.js, boo.
const task = require("../util/task");

const protocol = require("../devtools/server/protocol");
const {asyncMethod} = require("../util/protocol-extra");
const {Actor, ActorClass, Pool, method, Arg, Option, RetVal} = protocol;
const values = require("./value");
const preview = require("./preview");

protocol.types.addDictType("chromium_consolemsg", {
  "arguments": "array:chromium_grip"
  // XXX: Figure out objects.
});

var ChromiumConsoleActor = ActorClass({
  typeName: "chromium_console",

  toString: function() { return "[ConsoleActor:" + this.actorID + "]" },

  events: {
    "ConsoleAPI": {
      type: "consoleAPICall",
      message: Arg(0, "chromium_consolemsg")
    }
  },

  initialize: function(tab) {
    Actor.prototype.initialize.call(this, tab.conn);
    this.rpc = tab.rpc;

    this.rpc.on("Console.messageAdded", this.onMessage.bind(this));

    this.enabledListeners = new Set();
    this.messageCache = {};
    this.clearMessagesCache();
  },

  cacheOrSend: function(type, payload) {
    if (this.enabledListeners.has(type)) {
      emit(this, type, payload);
    } else {
      // XXX: Maybe we should limit the size of this cache?
      this.messageCache[type].push(payload);
    }
  },

  toGeneric: function(msg) {
    return {
      "level": msg.level,
      "arguments": msg.parameters,
      "counter": null,
      "filename": msg.url,
      "lineNumber": msg.line,
      "timeStamp": msg.timestamp,
      "groupName": "",
      "private": false, // XXX: Dunno if we can tell that from this proto?
      "styles": [],
      "timer": null, // hrm?
      "_type": "ConsoleAPI",
    };

    if (msg.stackTrace) {
      let frame = msg.stackTrace[0];
      payload.functionName = frame.functionName;
    } else {
      payload.functionName = "";
    }
  },

  toConsoleAPIMessage: function(msg) {
//     type ( optional enumerated string [ "assert" , "clear" , "dir" , 
// "dirxml" , "endGroup" , "log" , "profile" , "profileEnd" , "startGroup" ,
// "startGroupCollapsed" , "table" , "timing" , "trace" ] ) 
    let payload;
    switch(msg.type) {
      case "assert":
        msg.level = "assert"
        // fall through.
      default:
        payload = this.toGeneric(msg);
    }

    return {
      type: "ConsoleAPI",
      payload: payload
    }
  },

  toEvent: function(msg) {
    //  source ( enumerated string [ "appcache" , "console-api" , "css" , "deprecation" , "javascript" , "network" , "other" , "rendering" , "security" , "storage" , "xml" ] )
    if (msg.source === "console-api") {
      return this.toConsoleAPIMessage(msg)
    }
    return null;
  },

  onMessage: function(params) {
    let evt = this.toEvent(params.message);
    if (!evt) {
      return;
    }
    this.cacheOrSend(evt.type, evt.payload);
  },

  startListeners: asyncMethod(function*(listeners) {
    // Enable the request.  While this is waiting.
    let response = yield this.rpc.request("Console.enable");

    for (let listener of listeners) {
      this.enabledListeners.add(listener);
    }

    this.listening = false;
    return {
      startedListeners: listeners,
      nativeConsoleAPI: true // XXX: Not sure what this is for.
    }
  }, {
    request: {
      listeners: Arg(0, "array:string")
    },
    response: RetVal("json")
  }),

  stopListeners: asyncMethod(function*(listeners) {
    for (let listener of listeners) {
      this.enabledListeners.delete(listener);
    }

    if (this.enabledListeners.size < 1) {
      let response = yield this.rpc.request("Console.disable");
    }
    return {
      stoppedListeners: listeners
    }
  }, {
    request: {
      listeners: Arg(0, "array:string")
    },
    response: RetVal("json")
  }),

  getCachedMessages: method(function(messageTypes) {
    let messages = [];
    for (let type of messageTypes) {
      messages = messages.concat(this.messageCache[type]);
    }
    return messages;
  }, {
    request: {
      messageTypes: Arg(0, "array:string")
    },
    response: {
      messages: RetVal("array:chromium_consolemsg")
    }
  }),

  clearMessagesCache: method(function() {
    for (let msg of ["ConsoleAPI", "PageError", "NetworkActivity", "FileActivity"]) {
      this.messageCache[msg] = [];
    }
  }, {
    request: {},
    response: {},
  }),

  evaluateJS: asyncMethod(function*(expression) {
    let response = yield this.rpc.request("Runtime.evaluate", {
      expression: expression,
      includeCommandLineAPI: true, // XXX: hrm?
    });

    yield preview.loadPreview(this.rpc, response.result);

    // XXX: exceptions.
    return {
      input: expression,
      timestamp: Date.now(),
      exception: null,
      helperResult: null,
      result: response.result,
    }
  }, {
    request: {
      text: Arg(0, "string")
    },
    response: RetVal(protocol.types.addDictType("chromium_evalJSResponse", {
        result: "chromium_grip"
    }))
  }),

  autocomplete: asyncMethod(function*(text, cursor) {
    return {
      matches: [],
      matchProp: ""
    }
  }, {
    request: {
      text: Arg(0, "string"),
      cursor: Arg(1, "number")
    },
    response: RetVal("json")
  }),


  getPreferences: method(function() {

  }, {
    request: {},
    response: {}
  }),

  setPreferences: method(function() {

  }, {
    request: {},
    response: {}
  }),

  sendHTTPRequest: method(function() {

  }, {
    request: {},
    response: {}
  })

});

exports.ChromiumConsoleActor = ChromiumConsoleActor;
