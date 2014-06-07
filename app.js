var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({port: 8080})
  , slide = 0
  , strSlide = ''
  , clients = []; //keep list of devices

wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        console.log('received: %s', message);
    });
    clients.push(ws); //add client to list

    ws.on('close', function() {
        console.log('closing');
        for(var i = 0; i < clients.length; i++) {
            if(clients[i] == ws){
                clients.splice(i);
                break;
            }
        }
    });
});


setInterval(next, 4000); // advance slides every 4 seconds

function next() {
    if (++slide >= 6) slide = 1;
    strSlide = slide+'';
    for(var i in clients)
        clients[i].send(strSlide);
    console.log(strSlide);
}
