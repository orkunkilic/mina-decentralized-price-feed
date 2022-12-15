var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var net = require('./net');
require('dotenv').config()
const { PrivateKey, Signature, isReady, Field, Poseidon, UInt64, CircuitString } = require('snarkyjs');
const { createClient } = require('redis');

var indexRouter = require('./routes/index');
const Price = require('./type');
const process = require('process');

var app = express();
var node = net();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('privateKey', process.env.PRIVATE_KEY);

async function sign(price, timestamp) {
  await isReady;
  var privateKey = app.get('privateKey');
  var price = new Price({
    token: Poseidon.hash(CircuitString.fromString('BTC').toFields()), 
    price: new Field(price), 
    timestamp: UInt64.from(timestamp)
  })
  var signature = Signature.create(PrivateKey.fromBase58(privateKey), [Price.hash(price)]);
  return {
    signature: signature,
    publicKey: PrivateKey.fromBase58(privateKey).toPublicKey(),
  };
}

// connect to redis
const initRedis = async () => {
  const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();

  app.set('redis', client);

  console.log('Redis connected');
}

initRedis();

const nodeList = [
  { ip: process.env.PEER_HOST, port: process.env.PEER_PORT }
]

node.listen(process.env.NODE_PORT, () => {
  console.log('Node listening on', process.env.NODE_PORT);
});

app.set('node', node);

const neighbors = []

// wait 5 seconds for the node to start
setTimeout(() => {
  if(process.env.PEER_HOST && process.env.PEER_PORT) {
    nodeList.forEach((peer) => {
      node.connect(peer.ip, peer.port, () => {
        console.log(`Connected to ${peer.ip}:${peer.port}`);
        neighbors.push(peer);
      });
    });
  }
}, 5000);

// broadcast the list of neighbors every 10 seconds, not the best solution
setInterval(() => {
  node.broadcast({ type: 'connect', data: { neighbors: neighbors } });
}, 10000);

node.on('connect', ({ nodeId }) => {
  console.log('Node', nodeId, 'has connected');
});

// Neighbor has disconnected
node.on('disconnect', ({ nodeId }) => {
  console.log('Node', nodeId, 'has disconnected');
});

// Some message has been broadcasted somewhere
// on the network and has reached us
node.on('broadcast', async ({ origin, message }) => {
  const redis = app.get('redis');
  // get node
  const node = app.get('node');
  // parse message
  const { type, data } = message;
  if (type === 'connect') {
    const { neighbors: n } = data;
    n.forEach((peer) => {
      if(neighbors.find((n) => n.ip === peer.ip && n.port === peer.port)) return;
      if(n.ip === process.env.NODE_HOST && n.port === process.env.NODE_PORT) return;

      node.connect(peer.ip, peer.port, () => {
        console.log(`Connected to ${peer.ip}:${peer.port} from ${origin}`);
        neighbors.push(peer);
      })
    })
  }
  if (type === 'query') {
    // get the current price
    fetch('https://api.coindesk.com/v1/bpi/currentprice.json')
      .then(response => response.json())
      .then(async (json) => {
        var price = json.bpi.USD.rate_float;
        // price cast to integer
        price = Math.floor(price * 100);

        // save your response to the database
        await redis.set(`${data.queryId}/${node.id}`, JSON.stringify({ price: price }));
        
        // return the price
        node.broadcast({ type: 'price', data: { price: price } });
      });
  }
  if (type === 'signature-req') {
    const { queryId, averagePrice, timestamp } = data;

    // get the price from the database
    const prices = await redis.keys(`${queryId}/*`);
    const priceList = await Promise.all(prices.map(async (key) => {
      const price = await redis.get(key);
      return JSON.parse(price).price;
    }));

    // calculate the average price
    const average = priceList.reduce((a, b) => a + b, 0) / priceList.length;

    // check if the average price is the same as the one sent by the oracle
    if (average === averagePrice) 
      console.log('The average price is correct');
    else
      console.log('The average price is incorrect');
    
    // sign the average price
    const {signature, publicKey} = await sign(average, timestamp);

    console.log('Signature is broadcasting...')

    // broadcast the signature
    node.broadcast({ type: 'signature', data: { queryId: queryId, signature: signature, publicKey: publicKey } });
  }
  if(type === 'signature') {
    const { queryId, signature, publicKey } = data;

    // save the signature to the database
    await redis.set(`sig-${queryId}/${origin}`, JSON.stringify({ signature, publicKey }));
  }
  if (type === 'price') {
    const { queryId, price } = data;
    // save price to redis
    
    await redis.set(`${queryId}/${origin}`, price);
  }
});

// Shut down node
// node.close(() => {
//   console.log('Node is down');
// });

// set the server unique id
app.set('serverId', process.env.SERVER_ID);

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
