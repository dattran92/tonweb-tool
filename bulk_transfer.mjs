import 'dotenv/config';

import TonWeb from "tonweb";
import tonwebMnemonic from 'tonweb-mnemonic';
import fs from 'fs';
import { delay } from './utils.mjs';

const { JettonWallet} = TonWeb.token.jetton;
const { mnemonicToSeed } = tonwebMnemonic

const jsonFileName = process.argv[2]
const fileData = fs.readFileSync(jsonFileName, 'utf-8')
const receiverList = JSON.parse(fileData)

const JETTON_MASTER_ADDRESS = process.env.JETTON_MASTER_ADDRESS
const TON_CENTER_API_KEY = process.env.TON_CENTER_API_KEY

const tonweb = new TonWeb(
  new TonWeb.HttpProvider(
    'https://toncenter.com/api/v2/jsonRPC',
    { apiKey: TON_CENTER_API_KEY }
  )
);

let wallet
let walletAddress
let keyPair

const init = async () => {
  const seed = await mnemonicToSeed(process.env.MNEMONIC.split(' '))
  keyPair = TonWeb.utils.nacl.sign.keyPair.fromSeed(seed)
  const WalletClass = tonweb.wallet.all['v4R2']
  wallet = new WalletClass(tonweb.provider, {
    publicKey: keyPair.publicKey,
    wc: 0
  });

  walletAddress = await wallet.getAddress();
}

const transfer = async (
  receiverAddress,
  amount,
  message = 'gift'
) => {
  const jettonMinter = new TonWeb.token.jetton.JettonMinter(
    tonweb.provider,
    { address: JETTON_MASTER_ADDRESS }
  );
  const jettonWalletAddress = await jettonMinter.getJettonWalletAddress(new TonWeb.utils.Address(walletAddress));
  const jettonWallet = new JettonWallet(tonweb.provider, {
    address: jettonWalletAddress
  });

  console.log('Jetton wallet address:', jettonWalletAddress.toString(true, true, true));

  const seqno = (await wallet.methods.seqno().call()) || 0;
  console.log({seqno})
  // first four zero bytes are tag of text comment
  const comment = new Uint8Array([... new Uint8Array(4), ... new TextEncoder().encode(message)]);
  const payload = await jettonWallet.createTransferBody({
    jettonAmount: TonWeb.utils.toNano(amount),
    toAddress: new TonWeb.utils.Address(receiverAddress),
    forwardPayload: comment,
    responseAddress: walletAddress
  })
  const result = await wallet
    .methods
    .transfer({
        secretKey: keyPair.secretKey,
        toAddress: jettonWalletAddress.toString(true, true, true),
        amount: TonWeb.utils.toNano('0.5'),
        seqno,
        payload,
        sendMode: 3,
    })
    .send()

  return result
}

(async () => {
  await init()
  for (const receiver of receiverList) {
    console.log(`transfering ${receiver.amount} to ${receiver.address}`)
    const result = await transfer(receiver.address, receiver.amount, receiver.message)
    console.log(result)
    await delay(2000)
  }
})()
