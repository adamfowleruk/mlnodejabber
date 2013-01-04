#!/usr/bin/env node

// Basic test of receiving message on the rest http server, and sending to the websocket client

// COMMON
var mldb = require("mldb");
var u = require("util");

// language packs
var defaultVocab = "british";
var availableVocabs = ["british","tally-ho","fake-american"];
var vocabulary = {
  'new-buddy': { 
    "british": "Hello there buddy! Type 'help' for available commands.", 
    "tally-ho": "Well rather, chap! Type 'help' for available commands.", 
    "fake-american": "Whaaassssupppp! Type 'help' for available commands"},
  'helptext': {
    "british": 'Send a message of the format: <command> <setting1>:<value1> <setting2>:"<quoted value2>" some other text\nValid commands: help, list, subscribe, unsubscribe, login, search, since, set, voice', 
    "tally-ho": 'Please maintain correct R/T procedures at all times old boy. Like this: <command> <setting1>:<value1> <setting2>:"<quoted value2>" some other text\nValid commands: help, list, subscribe, unsubscribe, login, search, since, set, voice', 
    "fake-american": "That ain't no message. Check this: <command> <setting1>:<value1> <setting2>:\"<quoted value2>\" some other text\nValid commands: help, list, subscribe, unsubscribe, login, search, since, set, voice"},
  'invalid-command': {
    "british": "Unknown command: '%s'. Please try again. Type 'help' for list of commands.", 
    "tally-ho": "Oh dear, I'm afraid '%s' isn't acceptable at this time. Please try again later old boy. Type 'help' for list of commands.", 
    "fake-american": "What ya talking about? '%s'. Try again. Type 'help' for list of commands."},
  'login-ack': {
    "british": "Login information received", 
    "tally-ho": "Roger. Wilco.", 
    "fake-american": "Affirm."},
  'searching': {
    "british": "Searching...", 
    "tally-ho": "Tally ho! A searching we go!...", 
    "fake-american": "Go, go, go!..."},
  'search-summary': {
    "british": "Search complete in: %s\nTotal results: %s\n", 
    "tally-ho": "Targets acquired in: %s\nTotal targets: %s\n", 
    "fake-american": "Search completerated in: %s\nKnown unknowns: %s\n"},
  'search-result': {
    "british": "%s. URI: %s\n'%s'\n", 
    "tally-ho": "%s. URI: %s\n'%s'\n", 
    "fake-american": "%s. URI: %s\n'%s'\n"},
  'voice-set': {
    "british": "Your voice is now: '%s'", 
    "tally-ho": "Rah rah rah!: %s", 
    "fake-american": "Duuuuuuuude! %s"},
  'voice-invalid': {
    "british": "Invalid voice: '%s'\nAvailable voices: %s", 
    "tally-ho": "Terribly sorry old chap but '%s' just isn't cricket. Try one of these: %s", 
    "fake-american": "That ain't no way to talk!: '%s'\nYou gotta be one of these: %s"},
  'voice-report': {
    "british": "Your current voice is: '%s'\nAvailable voices: %s", 
    "tally-ho": "You old fellow: %s\nOther chaps: %s", 
    "fake-american": "Representing: %s\nOther fools: %s"},
};

// SETUP - ONLY MODIFY THESE

var argv = process.argv;

if (argv.length != 6) {
    console.error('Usage: node server.js <marklogic-rest-host> <marklogic-rest-port> <my-jid> <my-password>');
    process.exit(1);
}

var mlHost = argv[2];
var mlPort = argv[3];
var mlPath = "/";
var marklogicBaseURL = "http://" + mlHost + ":" + mlPort + mlPath;
var jabberUsername = argv[4];
var jabberPassword = argv[5];

// DATA MODEL

var clients = new Array(); // holds Client objects
var nodes = new Array(); // holds String name -> Client objects




// REST SERVER ENDPOINT

var restify = require('restify');

function respond(req, res, next) {
  //res.send('hello client ' + req.params.clientid);
  console.log("Received REST message");

  // determine which node the message is for
  // TODO change the following for alerttype subscribed to rather than nodename
  var node = req.params.clientid;
  var client = nodes[node];

  if (null != client && undefined != client.websocket) {
    console.log("Sending client node '" + node + "' message: '" + req.body.toString() + "'") // TESTED - WORKS A TREAT!
    
    
    // TODO alter message sending on so that they get send only to the relevant subscribers
    
    client.websocket.sendUTF(req.body.toString()); // TESTED - WORKS A TREAT!
  }

  res.send("OK");

}

var server = restify.createServer();
server.use(restify.bodyParser()); // { mapParams: false }

// Server request 1: handle echo directly to client
//server.get('/echo/:clientid', respond);
//server.head('/echo/:clientid', respond);
server.post('/echo/:clientid', respond);




server.listen(8081, function() {
  console.log('%s listening at %s', server.name, server.url);
});





// UTILITY OBJECTS AND METHODS

var Client = function(jid) {
  this.jabberid = jid;
};
Client.prototype.login = function(username,password,database) {
  this.voice = defaultVocab;
  this.username = username;
  this.password = password;
  this.database = database;
  this.db = new mldb();
  this.db.configure({username: username,password: password,database:database,host:mlHost,port:mlPort});
};

var getClientInfo = function(jid) {
  var ci = nodes[jid];
  if (undefined == ci) {
    ci = new Client(jid);
    nodes[jid] = ci;
    clients.push(ci);
  }
  return ci;
};

var parseCommand = function(str) {
  // get command
  var pos = str.indexOf(" ");
  if (-1 == pos) {
    // invalid
    return {command: str};
  }
  var command = str.substring(0,pos);
  
  var remainder = str.substring(pos + 1);
  var splits = remainder.split(" ");
  
  var result = { command: command};
  
  // TODO handle quotes
  var inText = false;
  var text = "";
  for (var i = 0;i < splits.length;i++) {
    if (inText) {
      text += splits[i];
    } else {
      var colon = splits[i].indexOf(":");
      if (-1 == colon) {
        inText = true;
        text += splits[i];
      } else {
        var param = splits[i].substring(0,colon);
        var value = splits[i].substring(colon + 1);
        result[param] = value;
      }
    }
  }
  result.text = text;
  
  return result;
};
var say = function(message,jidto) {
  return vocabulary[message][getClientInfo(jidto).voice];
};
var printList = function(arr) {
  var text = "";
  for (var i=0;i<arr.length;i++) {
    text += arr[i];
    if ((i+1)<arr.length) {
      text += ", ";
    }
  }
  return text;
};




// SET UP CLIENT JABBER SERVER



var xmpp = require("node-xmpp");

var cl = new xmpp.Client({jid: jabberUsername + "/bot", password: jabberPassword});
cl.on('data', function(d) {
  console.log("[data in] " + d);
});
cl.on('online',function() {
  console.log("Online called");
  cl.send(new xmpp.Element('presence', { }).
    c('show').t('chat').up().
    c('status').t('MarkLogic Instant Message bot - send "help" for commands')
  );
  cl.send(new xmpp.Element('presence', { type: 'available'  }).
    c('show').t('chat')
  );
  // send keepalive data or server will disconnect us after 150s of inactivity
  setInterval(function() {
    cl.send(' ');
  }, 30000);
});  
cl.on("presence",function(stanza) {
  console.log("presence called");
  if(stanza.attrs.type == "subscribe" ) {
    // Send a 'subscribed' notification back to accept the incoming
    // subscription request
    cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: "subscribed" }));
  }
  return true;
});
cl.on('stanza',function(stanza) {
  var from = stanza.attrs.from;
  console.log("Stanza received " );
  if (stanza.is('presence') && stanza.attrs.type !== 'error') {
    console.log("presence message");
    if(stanza.attrs.type == "subscribe" ) {
      console.log ("presence subscription requested");
      // Send a 'subscribed' notification back to accept the incoming
      // subscription request
      cl.send(new xmpp.Element('presence', { to: from, type: "subscribed" }));
      
      cl.send(new xmpp.Element('message', { to: from, type: 'message' }).
        c('body').t(say("new-buddy",from)) 
      );
    } else if ("unavailable" == stanza.attrs.type) {
      // force our availability
      console.log("Received unavailable message");
      // TODO only respond to those originating from our own JID
      cl.send(new xmpp.Element('presence', { type: 'available'  }).
        c('show').t('chat')
      );
    }
    return true;
      
  } else if (stanza.is('message') &&
    // Important: never reply to errors!
    stanza.attrs.type !== 'error') {
      

    // Swap addresses...
    //stanza.attrs.to = stanza.attrs.from;
    //delete stanza.attrs.from;
    
    // fetch or create client info
    var clientInfo = getClientInfo(stanza.attrs.from);
    
    var body = stanza.getChild('body');
    // message without body is probably a topic change
    if (!body) {
      return;
    }
    var message = body.getText();
    
    // parse message
    // command setting:value free text afterwards
    // NB value could be quoted
    var command = parseCommand(message);
    
    if ("help" == command.command) {
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t(say("helptext",from)) // TODO verify type is correct
      );
    } else if ("list"== command.command) {
      
    } else if ("subscribe" == command.command) {
      
    } else if ("unsubscribe" == command.command) {
      
    } else if ("login" == command.command) {
      clientInfo.login(command.username,command.password,command.database);
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t(say("login-ack",from))
      );
    } else if ("search" == command.command) {
      if (undefined == clientInfo.db) {
        console.log("MLDB not initialised yet...");
        return; // TODO send try again later after login response
      }
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t(say("searching",from))
      );
      clientInfo.db.search(command.text,function(result) {
        console.log("Search response: " + JSON.stringify(result));
        result = result.doc;
        var msg = "";
        // send summary
        //msg += "Search completed in: " + result.metrics["total-time"] + "\n";
        //msg += "Total results: " + result.total + "\n";
        msg += u.format(say("search-summary",from),result.metrics["total-time"],result.total);
        // send top ten results to client
        for (var i = 0;i < (result.total * 1) && i < (result["page-length"]*1);i++) {
          //msg += "" + (i+1) + ". URI: " + result.results[i].uri + "\n";
          //msg += "'" + result.results[i].matches[0]["match-text"] + "'\n";
          msg += u.format(say("search-result",from),(i+1),result.results[i].uri,result.results[i].matches[0]["match-text"]);
        }
        cl.send(new xmpp.Element('message', { to: from, type: 'message' }).
          c('body').t(msg)
        );
      });
    } else if ("since" == command.command) {
      
    } else if ("set" == command.command) {
      // set parameter(s). E.g. default doc collection for search/upload. If blank, show all current settings.
    } else if ("voice" == command.command) {
      // see if text is specified
      if (command.text && command.text.trim().length > 0) {
        var found = false;
        for (var i=0;i<availableVocabs.length;i++) {
          found = found || (availableVocabs[i]==command.text.trim());
        }
        if (found) {
          clientInfo.voice = command.text.trim();
          cl.send(new xmpp.Element('message', { to: from, type: 'message' }).
            c('body').t(u.format(say("voice-set",from),clientInfo.voice))
          );
        } else {  
          cl.send(new xmpp.Element('message', { to: from, type: 'message' }).
            c('body').t(u.format(say("voice-invalid",from),command.text.trim(),printList(availableVocabs)))
          );
        }
      } else {
        // list current and available voices
        cl.send(new xmpp.Element('message', { to: from, type: 'message' }).
          c('body').t(u.format(say("voice-report",from),clientInfo.voice,printList(availableVocabs)))
        );
      }
    } else {
      // unknown
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t(u.format(say("invalid-command",from),command.command )) // TODO verify type is correct
      );
    }
    // done
  }
});
cl.on('error',function(e) {
  console.log("Error occurred");
  console.error(e);
});


// TODO upon closing NodeJS we need the client to disconnect gracefully
