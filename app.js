var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({port: 8080})
  , slide = 0
  , strSlide = ''
  , buffer = [ 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000 ]
  , clients = [] //keep list of devices
  , COUNT = 500 //number of samples from ADC
  , i2c = require('i2c')
  , numbertable = [
        0x3F, /* 0 */
        0x06, /* 1 */
        0x5B, /* 2 */
        0x4F, /* 3 */
        0x66, /* 4 */
        0x6D, /* 5 */
        0x7D, /* 6 */
        0x07, /* 7 */
        0x7F, /* 8 */
        0x6F, /* 9 */
        0x77, /* a */
        0x7C, /* b */
        0x39, /* C */
        0x5E, /* d */
        0x79, /* E */
        0x00, /* BLANK CHARACTER */
  ]
  , ina219_calValue = 10240
  , ina219_currentDiv_mA = 25
  , ina219_powDiv_mW = 1
;

var i2c = require('i2c')
  , s4disp = new i2c(0x70, {device: '/dev/i2c-1'}) // GS4 7-Segment Display
  , s5disp = new i2c(0x71, {device: '/dev/i2c-1'}) // GS5 7-Segment Display
  , s4curr = new i2c(0x40, {device: '/dev/i2c-1'}) // GS4 Current Meter
  , s5curr = new i2c(0x41, {device: '/dev/i2c-1'}) // GS5 Current Meter
;

process.on('SIGINT', function() {
  console.log('\nGracefully shutting down from SIGINT (Ctrl+C)');
  console.log('Clearing Displays...');
  clear(s4disp);
  clear(s5disp);
  console.log('Exiting...');
  process.exit();

});

setupDisplay(s4disp);
setupDisplay(s5disp);
setupMeter(s4curr);
setupMeter(s5curr);

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

setInterval(next, 7000); // advance slides every 7 seconds

setInterval(measure,100);

function setupMeter(addr){
  //32V 1A
  //config:
  //INA219_CONFIG_BVOLTAGERANGE_32V | INA219_CONFIG_GAIN_8_320MV | INA219_CONFIG_BADCRES_12BIT | INA219_CONFIG_SADCRES_12BIT_1S_532US |
  //    INA219_CONFIG_MODE_SANDBVOLT_CONTINUOUS;
//  addr.writeBytes(0x00, 0x8000); //Reset
//  sleep(500, function(){});
  var byte = (0x2000 | 0x1800 | 0x0400 | 0x0018 | 0x0007); 
  addr.writeBytes(0x00, [((byte >> 8) & 0xFF), (byte & 0xFF)]);
  console.log('Config Reg: ', addr.readBytes(0x00,2).toString('hex',0,2));
  //cal:
  addr.writeBytes(0x05,[((0x2800 >> 8) & 0xFF), (0x2800 & 0xFF)]);
  console.log('Cal: ', addr.readBytes(0x05,2).toString('hex',0,2));

}  

function setupDisplay(addr){
  //turn on oscillator
  addr.writeBytes(0x21, 0x00);
  //max brightness
  addr.writeBytes(0xE4, 0x00);
  //Blink Off
  addr.writeBytes(0x81, 0x00);
  clear(addr);
}

function next() {
  if (++slide >= 6) slide = 1;
  strSlide = slide+'';
  for(var i in clients)
    clients[i].send(strSlide);
}

function measure() {
  var floorS4=1337, floorS5=1337, measS4=1337, measS5=1337;
  for(var i=0;i<COUNT;i++){
    measS4 = ~~measureI(s4curr);
    measS5 = ~~measureI(s5curr);
    if (measS4 < floorS4) floorS4=measS4;
    if (measS5 < floorS5) floorS5=measS5;
  }
  writeInt(~~(floorS4 * 4.31)-590, s4disp);
  writeInt(~~(floorS5 * 4.31)-187, s5disp);
  console.log('S4: ', ~~(floorS4 * 4.31), 'mW');
  console.log('S5: ', ~~(floorS5 * 4.31), 'mW');
}

function measureI(addr) {
  var buff, result;
  addr.writeBytes(0x05, ina219_calValue); //set cal incase of err
  buff =  addr.readBytes(0x04,2);
  result = buff.readUInt16BE(0) / ina219_currentDiv_mA;
//  console.log('current: ' , result);
  return result;
}

function measureV(addr) {
  var buff, result;
  addr.writeBytes(0x05, ina219_calValue); //set cal incase of err
  buff =  addr.readBytes(0x01,2);
  result = buff.readUInt16BE(0) * 0.01;
//  console.log('voltage: ' , result);
  return result;
}

function measureBusV(addr) {
  var buff, result;
  addr.writeBytes(0x05, ina219_calValue); //set cal incase of err
  buff =  addr.readBytes(0x02,2);
  result = ((buff.readUInt16BE(0) >> 3) * 4) * 0.001;
//  console.log('Bus voltage: ' , result);
  return result;
}

function measureP(addr) {
  var buff, result;
  addr.writeBytes(0x05, ina219_calValue); //set cal incase of err
  buff =  addr.readBytes(0x03,2);
//  console.log('power: ' , buff.readUInt16BE(0));
  result = buff.readInt16LE(0);
  return result;
}

function writeDisp(addr){
  addr.writeByte(0x00);
  bytes = [];
  for(var i=0;i<8;i++){
    bytes.push(buffer[i] & 0xFF);
    bytes.push((buffer[i] >> 8) & 0xFF);
  }
  addr.writeBytes(0x00, bytes);
//  console.log(bytes);
}

function writeDigit(row, val, addr){
  if(row > 7)
    return;
  if(val > 0xF)
    return;
  buffer[row] = numbertable[val] | (0 << 7);
  writeDisp(addr);
}
  
function writeInt(flt, addr){
  var val = ~~flt;
  val/1000 >= 1 ? writeDigit(0, ~~((val/1000) % 10), addr) : writeDigit(0, 0xF, addr);
  val/100 >= 1 ? writeDigit(1, ~~((val/100) % 10), addr) : writeDigit(1, 0xF, addr);
  val/10 >= 1 ? writeDigit(3, ~~((val/10) % 10), addr) : writeDigit(3, 0xF, addr);
  val/1 >= 1 ? writeDigit(4, ~~(val % 10), addr) : writeDigit(4, 0xF, addr);
}

function clear(addr){
  for(var i=0; i<8; i++){
     buffer[i] = 0; 
  }   
  writeDisp(addr);
 }
