#!/usr/bin/env node

// Basic test of receiving message on the rest http server, and sending to the websocket client

// COMMON
var mldb = require("mldb");

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
  console.log("Stanza received " );
  if (stanza.is('presence') && stanza.attrs.type !== 'error') {
    console.log("presence message");
    if(stanza.attrs.type == "subscribe" ) {
      console.log ("presence subscription requested");
      // Send a 'subscribed' notification back to accept the incoming
      // subscription request
      cl.send(new xmpp.Element('presence', { to: stanza.attrs.from, type: "subscribed" }));
    } else if ("unavailable" == stanza.attrs.type) {
      // force our availability
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
      var helptext = 
        'Send a message of the format: <command> <setting1>:<value1> <setting2>:"<quoted value2>" some other text\n' +
        'Valid commands: help, list, subscribe, unsubscribe, login, search, since, set'
      ;
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t(helptext) // TODO verify type is correct
      );
    } else if ("list"== command.command) {
      
    } else if ("subscribe" == command.command) {
      
    } else if ("unsubscribe" == command.command) {
      
    } else if ("login" == command.command) {
      clientInfo.login(command.username,command.password,command.database);
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t("Login information received")
      );
    } else if ("search" == command.command) {
      if (undefined == clientInfo.db) {
        console.log("MLDB not initialised yet...");
        return;
      }
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t("Searching...")
      );
      clientInfo.db.search(command.text,function(result) {
        console.log("Search response: " + JSON.stringify(result));
        result = result.doc;
        var msg = "";
        // send summary
        msg += "Search completed in: " + result.metrics["total-time"] + "\n";
        msg += "Total results: " + result.total + "\n";
        // send top ten results to client
        for (var i = 0;i < (result.total * 1) && i < (result["page-length"]*1);i++) {
          msg += "" + (i+1) + ". URI: " + result.results[i].uri + "\n";
          msg += "'" + result.results[i].matches[0]["match-text"] + "'\n";
        }
        cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
          c('body').t(msg)
        );
      });
    } else if ("since" == command.command) {
      
    } else if ("set" == command.command) {
      // set parameter(s). E.g. default doc collection for search/upload
    } else {
      // unknown
      cl.send(new xmpp.Element('message', { to: stanza.attrs.from, type: 'message' }).
        c('body').t("Unknown command: '" + command.command + "'. Please try again. Send 'help' for list of commands.") // TODO verify type is correct
      );
    }
    // done
  }
});
cl.on('error',function(e) {
  console.log("Error occurred");
  console.error(e);
});
// TODO handle befriending the bot





/*


// OLD WEB SOCKETS SERVER


wsServer = new WebSocketServer({
    httpServer: httpServer,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }
    
    var socketClientConnection = request.accept('echo-protocol', request.origin);
    
    
    console.log((new Date()) + ' Connection accepted.');
    
    // create client reference
    var client = {websocket: socketClientConnection};
    
    clients.push(client);

    // Client request type 1: Receive a random message - reflect back to client
    socketClientConnection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('Received Message: ' + message.utf8Data);
            
            // OLD socketClientConnection.sendUTF(message.utf8Data);
            // try to get JSON
            var json = JSON.parse(message.utf8Data);
            if (json.request) {
              if ("login" == json.request) {
                console.log("LOGIN");
                // Client request type 1: receive login request
                // get user and pass
                client.username = json.user;
                client.password = json.password;
                client.node = json.node;
                console.log("Connected websocket client node '" + client.node + "'");
                client.wrapper = new BasicWrapper(client.username,client.password);
                
                nodes[client.node] = client;
                
                var options = {
                  hostname: mlHost,
                  port: mlPort,
                  path: '/',
                  method: 'GET', headers: {}
                };
                var httpreq = client.wrapper.request(options, function(res) {
                  var body = "";
                  console.log("Got response: " + res.statusCode);
                  
                  socketClientConnection.sendUTF(res.statusCode);
                  res.on('data', function(data) {
                    body += data;
                    console.log("Data: " + data);
                  });
                  res.on('end', function() {
                    console.log("Body: " + body);
                  });
                  res.on('close', function() { console.log("login req: CLOSE");});
                  
                });
                console.log("END LOGIN");
                
              } else if("initialise" == json.request) {
                // Client request type 2: receive initial geospatial fetch request (E.g. load initial maps, sensors, local intel)
                
              } else if ("subscribe" == json.request) {
                // Client request type 3: subscribe to location intel (Asks ML to send all alerts to this client)
                // 3.1 Create Alert config
                // 3.2 Create alert action
                // 3.3 Add alert rule
                // 3.4 
                var options = {
                  hostname: mlHost,
                  port: mlPort,
                  path: '/',
                  method: 'GET', headers: {}
                }
              }
              
              // just forward all requests to a REST API endpoint
              
              
            }
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            socketClientConnection.sendBytes(message.binaryData);
        }
    });
    
    
    
    
    
    socketClientConnection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + socketClientConnection.remoteAddress + ' disconnecting...');
        
        // TODO Unsubscribe from ML location intel
        
        
        console.log((new Date()) + ' Peer ' + socketClientConnection.remoteAddress + ' disconnected.');
    });
});





// UTILITY OBJECTS




var BasicWrapper = function(username,password) {
  this.request = function(options,func) {
    // add http auth header
    options.headers["Authorization"] = "Basic " + new Buffer(username + ':' + password).toString('base64');
    http.get(options,func);
  };
};

/*
 * Wraps a HTTP request to the ML server for a particular user
 * - Unknown bug that causes auth to fail. Using BasicWrapper instead
 /
var DigestWrapper = function(username,password) {
  var nc = 1;
  this.request=function(options, func) {
    //var cnonce = Math.floor(Math.random()*100000000);
    
    var cnonce = "0a4f113b";
    var nonce = undefined;
    var opaque = undefined;
    var realm = undefined;
    var qop = undefined;
    
    var doRequest = function() {
      nc = nc++;
      var ncUse = padNC(nc);
      console.log("options.method: '" + options.method + "'");
      console.log("options.hostname: '" + options.hostname + "'");
      console.log("options.port: '" + options.port + "'");
      console.log("options.path: '" + options.path + "'");
      console.log("cnonce: '" + cnonce + "'");
      console.log("nonce: '" + nonce + "'");
      console.log("nc: '" + ncUse + "'");
      console.log("realm: '" + realm + "'");
      console.log("qop: '" + qop + "'");
      console.log("opaque: '" + opaque + "'");
      
      // See Client Request at http://en.wikipedia.org/wiki/Digest_access_authentication
      var md5ha1 = crypto.createHash('md5');
      var ha1raw = username + ":" + realm + ":" + password;
      console.log("ha1raw: " + ha1raw);
      md5ha1.update(ha1raw);
      var ha1 = md5ha1.digest('hex');
      
      var md5ha2 = crypto.createHash('md5');
      var ha2raw = options.method + ":" + options.path;
      console.log("ha2raw: " + ha2raw);
      md5ha2.update(ha2raw);
      
      var ha2 = md5ha2.digest('hex'); // TODO check ? params are ok for the uri
      
      var md5r = crypto.createHash('md5');
      var md5rraw = ha1 + ":" + nonce + ":" + ncUse + ":" + cnonce + ":auth:" + ha2;
      console.log("md5rraw: " + md5rraw);
      md5r.update(md5rraw);
      
      var response = md5r.digest('hex');
      options.headers = { 'Authorization' : 'Digest username="' + username + '", realm="' + realm + '", uri="' + options.path + '",' + // TODO check if we remove query ? params from uri
         ' qop="auth", nc=' + ncUse + ', cnonce="' + cnonce + '", response="' + response + '", opaque="' + opaque + '"'};
      console.log("DigestWrapper: Auth header: " + options.headers["Authorization"]);

      if ('GET' == options.method) {
        http.get(options,func);
      } else if ('POST' == options.method) {
        //http.post(options,func);
      } else {
        console.log("DigestWrapper: HTTP METHOD UNSUPPORTED");
      }
    };
    
    // see if we have a realm and nonce
    if (undefined != realm) {
      console.log("DigestWrapper: Got a Realm");
      doRequest();
    } else {
      console.log("DigestWrapper: Not got a Realm, wrapping request");
      
      // do authorization request then call doRequest
      var myopts = {
        host: options.host,
        port: options.port
      }
      
      http.get(myopts,function(res) {
        console.log("Check: " + res.statusCode);
        res.on('end', function() {
          // check if http 401
          console.log("DigestWrapper: Got HTTP response: " + res.statusCode);
          // if so, extract WWW-Authenticate header information for later requests
          console.log("DigestWrapper: Header: www-authenticate: " + res.headers["www-authenticate"]); 
          // E.g. from ML REST API:  Digest realm="public", qop="auth", nonce="5ffb75b7b92c8d30fe2bfce28f024a0f", opaque="b847f531f584350a"
          
          nc = 1;
          
          var auth = res.headers["www-authenticate"];
          var params = parseDigest(auth);
          nonce = params.nonce;
          realm = params.realm;
          qop = params.qop;
          opaque = params.opaque;

          doRequest();
        }); 
        //res.on('close', function() { console.log("DigestWrapper: CLOSE");});
        //res.on('data',  function() { console.log("DigestWrapper: DATA");});
      });
    }
  };
};

function parseDigest(header) {  
  return _und(header.substring(7).split(/,\s+/)).reduce(function(obj, s) {
    var parts = s.split('=')
    obj[parts[0]] = parts[1].replace(/"/g, '')
    return obj
  }, {})  
}

function padNC(num) {
  var pad = "";
  for (var i = 0;i < (8 - ("" + num).length);i++) {
    pad += "0";
  }
  var ret = pad + num;
  //console.log("pad: " + ret);
  return ret;
}
*/