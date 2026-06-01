const HttpServer = require('./http-server');
const CoapServer = require('./coap-server');

const coapServer = new CoapServer();
const httpServer = new HttpServer(coapServer);

coapServer.start();
httpServer.start();

process.on('SIGINT', () => {
  console.log('Shutting down...');
  coapServer.stop();
  httpServer.stop();
  process.exit(0);
});
