var express = require('express');
var router = express.Router();
const { Signature, isReady, Field, PrivateKey, Poseidon, CircuitString, UInt64 } = require('snarkyjs');
const Price = require('../type');
const keys = require('../keys.json');

async function sign(pk, price, timestamp) {
  await isReady;
  var price = new Price({
    token: Poseidon.hash(CircuitString.fromString('BTC').toFields()), 
    price: new Field(price), 
    timestamp: UInt64.from(timestamp)
  })
  var signature = Signature.create(PrivateKey.fromBase58(pk), [Price.hash(price)]);
  return {
    signature: signature,
    publicKey: PrivateKey.fromBase58(pk).toPublicKey(),
  };
}

/* GET home page. */
router.get('/', async function(req, res, next) {
  console.log('req arrived')
  
  const node = req.app.get('node');
  const redis = req.app.get('redis'); 
  
  // // create a unique query id
  const queryId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // broadcast the query to all nodes
  await node.broadcast(
    { type: 'query', data: {
      queryId,
    } },
  );

  // query the api to get the current price
  var response = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json');
  var json = await response.json();
  var price = json.bpi.USD.rate_float;
  // price cast to integer
  price = Math.floor(price * 100);
  await redis.set(`${queryId}/${node.id}`, JSON.stringify({price}));

  // sleep for 1 second
  await new Promise(r => setTimeout(r, 1000));

  // get the responses from redis by keys
  const responses = await redis.keys(`${queryId}/*`);
  const prices = await Promise.all(responses.map(async (response) => {
    const price = await redis.get(response);
    return JSON.parse(price).price;
  }));

  // get the average price
  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  const timestamp = Date.now();

  // broadcast the average price to all nodes
  await node.broadcast(
    { type: 'signature-req', data: {
      queryId,
      averagePrice,
      timestamp,
    } },
  );

  // sign the average price
  const {signature, publicKey} = await sign(req.app.get('privateKey'), averagePrice, timestamp);

  // save the signature to redis
  await redis.set(`sig-${queryId}/${node.id}`, JSON.stringify({signature, publicKey}));

  // sleep for 1 second
  await new Promise(r => setTimeout(r, 1000));

  // get the signatures from redis by keys
  const signatures = await redis.keys(`sig-${queryId}/*`);
  const sigs = await Promise.all(signatures.map(async (signature) => {
    const sig = await redis.get(signature);
    return {
      signature: JSON.parse(sig).signature,
      publicKey: JSON.parse(sig).publicKey,
    };
  }));

  const publicKeysInOrder = keys.publicKeys

  // sort the signatures by public key as defined in keys.json
  sigs.sort((a, b) => {
    return publicKeysInOrder.indexOf(a.publicKey) - publicKeysInOrder.indexOf(b.publicKey);
  });

  // return prices
  res.send({ price: averagePrice, timestamp, signatures: sigs });
});

module.exports = router;
