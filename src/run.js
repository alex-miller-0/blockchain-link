// Checkpoint state of a directory to a main chain. This requires the following
// parameters (saved in config.json):
//   1. PRIVATE_HOST - the URL to access the blockchain we will be checkpointing
//   2. PUBLIC_HOST - the URL to access the blockchain where the checkpoint is being saved
//   3. CONTRACT - the address for the contract (the method name should be standardized)
//
// You will also need to provide a location for your Ethereum node's data.
// For parity, this is specified with PARITY_DIR.
//
// Finally, you will need to specify the name of the chain you want to snapshot.
// This is provided as CHAIN_NAME.
//
// This will get the following information from your local node:
//   1. Block number of snapshot
//   2. State hash corresponding to block number
//
// Using this hash and the snapshotted data, we can verify the state at the point
// of the snapshot.
//
const config = require('../config.json');
const fs = require('fs');
const rlp = require('rlp');
const leftPad = require('left-pad');
const { getAddress, signTransaction } = require('./keys.js');
const { getNonce, sendSigned } = require('./eth.js');

const run = (interval, chainId) => {
  let blockNumber;
  let stateHash;

  setInterval(function() {
    getManifestFunction()
    .then((manifestFunction) => {
      return manifestFunction();
    })
    .then((data) => {
      blockNumber = data[0];
      stateHash = data[1];
      return saveCheckpoint(blockNumber, stateHash, chainId);
    })
    .then((txHash) => { console.log(`${new Date()} Checkpointed block ${blockNumber} with state hash ${stateHash}.`)})
    .catch(function(err) { console.log('Error:', err); })
  }, interval*1000);
}

const getManifestFunction = () => {
  return new Promise((resolve, reject) => {
    if (config.PARITY_DIR && config.PARITY_DIR != ''
      && config.CHAIN_NAME && config.CHAIN_NAME != '') { resolve(getParityManifest); }
    else { reject('Insufficient configuration for finding snapshot.'); }
  })
}


// If the user is running a parity node for the private chain, we can take the
// state hash and corresponding block number stored in the snapshot that is
// automatically taken every 30,000 blocks.
// See here: https://github.com/paritytech/parity/wiki/Warp-Sync-Snapshot-Format
const getParityManifest = () => {
  return new Promise((resolve, reject) => {
    const snapshotDir = `${config.PARITY_DIR}/chains/${config.CHAIN_NAME}/db/906a34e69aec8c0d/snapshot/current/MANIFEST`;
    const encoded = fs.readFileSync(snapshotDir);
    const decoded = rlp.decode(encoded);
    if (decoded[0].toString('hex') != '02') { reject('Unable to process MANIFEST.') }
    // // The bock number corresponding to the state root hash
    const blockNumber = parseInt(decoded[4].toString('hex'), 16);
    // // The state root hash
    const stateHash = decoded[3].toString('hex');
    resolve([blockNumber, stateHash]);
  })
}

const saveCheckpoint = (blockNumber, stateHash, chainId) => {
  return new Promise((resolve, reject) => {
    if (!chainId) { chainId = '0'; }
    // Corresponds to function saveCheckpoint(uint blockNumber, bytes32 stateHash, uint chainId)
    const data = `0x73bf9915${leftPad(blockNumber.toString(16), 64, '0')}${stateHash}${leftPad(chainId.toString(16), 64, '0')}`;
    const tx = {
      nonce: null,
      gasPrice: config.GAS_PRICE,
      gasLimit: config.GAS_LIMIT,
      to: config.CONTRACT,
      value: '0x0',
      data: data,
    };
    getNonce(getAddress())
    .then((nonce) => {
      tx.nonce = nonce;
      const rawTx = signTransaction(tx);
      return sendSigned(rawTx);
    })
    .then((txHash) => { console.log('got txhash', txHash); resolve(txHash); })
    .catch((err) => { reject(err); })
  })
}

module.exports = {
  run,
};
