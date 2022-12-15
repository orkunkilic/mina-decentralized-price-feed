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
import { fetchAccount, Mina, PrivateKey, PublicKey, shutdown } from 'snarkyjs';
import fs from 'fs/promises';
import { Oracle, PublicKeyStruct } from './Oracle.js';

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
let zkApp = new Oracle(zkAppAddress);

// compile the contract to create prover keys
console.log('compile the contract...');
await Oracle.compile();

console.log('fetch zkApp...');
await fetchAccount({ publicKey: zkAppAddress });
// read keys from file
console.log('read keys from file...');
let keyJson = JSON.parse(await fs.readFile('keys.json', 'utf8'));
let publicKeys = keyJson.publicKeys.map((pk: any) => PublicKey.fromBase58(pk));
let privateKeys = keyJson.privateKeys.map((pk: any) => PrivateKey.fromBase58(pk));
// log public keys
console.log('oracle public keys:', publicKeys.map((pk: any) => pk.toBase58()));
if (publicKeys.length != 5) {
    publicKeys = [];
    privateKeys = [];
    // generate 5 random public keys
    for (let i = 0; i < 5; i++) {
        let privateKey = PrivateKey.random();
        privateKeys.push(privateKey);
        publicKeys.push(privateKey.toPublicKey());
    }
    // save keys to file
    let keys = {
        privateKeys: privateKeys.map((pk: any) => pk.toBase58()),
        publicKeys: publicKeys.map((pk: any) => pk.toBase58()),
    };
    await fs.writeFile('keys.json', JSON.stringify(keys, null, 2));
}

// call update() and send transaction
console.log('build transaction and create proof...');
let tx = await Mina.transaction({ feePayerKey: zkAppKey, fee: 0.1e9 }, () => {
  zkApp.updatePublicKeySet(new PublicKeyStruct({
    publicKeys: publicKeys,
  }), zkAppKey);
});
await tx.prove();
console.log('send transaction...');
let sentTx = await tx.send();

if (sentTx.hash() !== undefined) {
  console.log(`
Success! Update transaction sent.

Your smart contract state will be updated
as soon as the transaction is included in a block:
https://berkeley.minaexplorer.com/transaction/${sentTx.hash()}
`);
}

// wait for transaction to be included in a block
console.log('waiting for transaction to be included in a block...');
await sentTx.wait(); // this is not implemented yet
// sleep for 5 minutes
console.log('sleeping for 7 minutes...');
await new Promise((resolve) => setTimeout(resolve, 7 * 60 * 1000));

await fetchAccount({ publicKey: zkAppAddress });
// get public key set
console.log('get public key set...');
let publicKeySet = zkApp.pubKeys.get();
console.log('public key set:', publicKeySet.toString());

// log local public keys
let local = (new PublicKeyStruct(
    publicKeys,
)).hash()
console.log('local public key set:', local.toString());

shutdown();
