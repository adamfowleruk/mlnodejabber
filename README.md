This Node.js server uses the MLDB API to provide instant messaging client access to a MarkLogic 6 REST API server.

##Installation

1. `npm install mldb`
2. git clone this repository
3. node server.js <ml-hostname> <ml-rest-api-port> <bot-jabber-id> <bot-jabber-password>
4. Open a jabber client (E.g. Adium, Google Talk) and add your bot's jabber id as a friend. It will automatically allow your friendship request.
5. Send the bot a message and follow it's instructions!

##Usage

The below is for a default install of MarkLogic. Alter the settings as required.

1. login username:admin password:admin database:Documents
2. search <query-string>

##Features

Current feature set:
 - DONE help, login commands
 - STARTED search <query> command
 
Future versions
 - list -> All named alerts you are subscribed to
 - subscribe <alert-name> -> subscribe to a named alert
 - unsubscribe <alert-name> -> unsubscribe from a named alert
 - since since:<date-time> <alert-name> -> search for all new documents added since the specified time that match a saved search
 - set key:value key2:value2 -> set parameters for future requests. E.g. focused collection, document base uri (See file upload)
 - File upload
 
##Further information

Email me at adam DOT fowler AT marklogic.com or add an Issue on GitHub.