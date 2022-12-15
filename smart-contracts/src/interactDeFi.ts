/**
 * This script can be used to interact with the Add contract, after deploying it.
 *
 * We call the update() method on the contract, create a proof and send it to the chain.
 * The endpoint that we interact with is read from your config.json.
 *
 * This simulates a user interacting with the zkApp from a browser, except that here, sending the transaction happens
 * from the script and we're using your pre-funded zkApp account to pay the transaction fee. In a real web app, the user's wallet
 * would send the transaction and pay the fee.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/interact.js <network>`.
 */
import { CircuitString, fetchAccount, Field, Mina, Poseidon, PrivateKey, PublicKey, shutdown, Signature, UInt64 } from 'snarkyjs';
import fs from 'fs/promises';
import { Oracle, PublicKeyStruct, SignaturesStruct } from './Oracle.js';
import { DeFi, Price } from './DeFi.js';

// check command line arg
let network = process.argv[2];
if (!network)
  throw Error(`Missing <network> argument.

Usage:
node build/src/interact.js <network>

Example:
node build/src/interact.js berkeley
`);
Error.stackTraceLimit = 1000;

// parse config and private key from file
type Config = { networks: Record<string, { url: string; keyPath: string }> };
let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
let config = configJson.networks[network];
let key: { privateKey: string } = JSON.parse(
  await fs.readFile(config.keyPath, 'utf8')
);
let zkAppKey = PrivateKey.fromBase58(key.privateKey);

// set up Mina instance and contract we interact with
const Network = Mina.Network(config.url);
Mina.setActiveInstance(Network);
let zkAppAddress = zkAppKey.toPublicKey();
let zkApp = new DeFi(zkAppAddress);

// compile the contract to create prover keys
console.log('compile the contract...');
await DeFi.compile();
await Oracle.compile();

console.log('fetch zkApp...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: 'B62qnRSocqNaAWKhBF8BDQRx1TdxAeR2cvq5BpFCE5u9CtBXQMu59hy' });

// read keys from file
console.log('read keys from file...');
let keyJson = JSON.parse(await fs.readFile('keys.json', 'utf8'));
let publicKeys = keyJson.publicKeys.map((pk: any) => PublicKey.fromBase58(pk));
let privateKeys = keyJson.privateKeys.map((pk: any) => PrivateKey.fromBase58(pk));
// log public keys
console.log('oracle public keys:', publicKeys.map((pk: any) => pk.toBase58()));


// // call update() and send transaction
// console.log('build transaction and create proof...');
// let tx = await Mina.transaction({ feePayerKey: zkAppKey, fee: 0.1e9 }, () => {
//     zkApp.updateOracle(PublicKey.fromBase58('B62qnRSocqNaAWKhBF8BDQRx1TdxAeR2cvq5BpFCE5u9CtBXQMu59hy'), zkAppKey);
//     zkApp.updateTokenName(Poseidon.hash(CircuitString.fromString('BTC').toFields()), zkAppKey);
// });
// await tx.prove();
// console.log('send transaction...');
// let sentTx = await tx.send();

// if (sentTx.hash() !== undefined) {
//   console.log(`
//     Success! Update transaction sent.

//     Your smart contract state will be updated
//     as soon as the transaction is included in a block:
//     https://berkeley.minaexplorer.com/transaction/${sentTx.hash()}
//   `);
// }

// // wait for transaction to be included in a block
// console.log('waiting for transaction to be included in a block...');
// await sentTx.wait(); // this is not implemented yet
// // sleep for 5 minutes
// console.log('sleeping for 7 minutes...');
// await new Promise((resolve) => setTimeout(resolve, 7 * 60 * 1000));

// await fetchAccount({ publicKey: zkAppAddress });

const response = await(await fetch('http://localhost:3000/')).json();

const priceRaw = response.price;
const timestampRaw = response.timestamp;
const signaturesRaw = response.signatures;

const priceStruct = new Price({
    token: Poseidon.hash(CircuitString.fromString('BTC').toFields()),
    price: new Field(priceRaw),
    timestamp: UInt64.from(timestampRaw),
})

const signatures = signaturesRaw.map((sig: any) => Signature.fromJSON(sig.signature))
const publicKeysR = signaturesRaw.map((sig: any) => PublicKey.fromBase58(sig.publicKey))

const signatureStruct = new SignaturesStruct({
    value: Price.hash(priceStruct),
    publicKeys: new PublicKeyStruct({
        publicKeys: publicKeysR
    }),
    signatures: signatures
})

console.log('build transaction and create proof...');
let tx2 = await Mina.transaction({ feePayerKey: zkAppKey, fee: 0.1e9 }, () => {
    zkApp.updatePrice(signatureStruct, priceStruct);
});
await tx2.prove();
console.log('send transaction...');
let sentTx2 = await tx2.send();
if (sentTx2.hash() !== undefined) {
    console.log(`
   Success! Update transaction sent.
 
   Your smart contract state will be updated
   as soon as the transaction is included in a block:
   https://berkeley.minaexplorer.com/transaction/${sentTx2.hash()}
   `);
}
// wait for transaction to be included in a block
console.log('waiting for transaction to be included in a block...');
await sentTx2.wait(); // this is not implemented yet
// sleep for 5 minutes
console.log('sleeping for 7 minutes...');
await new Promise((resolve) => setTimeout(resolve, 7 * 60 * 1000));
await fetchAccount({ publicKey: zkAppAddress });
// check the price for zkApp state
console.log('check the price for zkApp state...');
let price = zkApp.price.get();
console.log('price:', price);
// shut down the Mina instance
shutdown();

