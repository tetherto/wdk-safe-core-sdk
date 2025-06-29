![license](https://img.shields.io/github/license/safe-global/safe-core-sdk) [![Coverage Status](https://coveralls.io/repos/github/safe-global/safe-core-sdk/badge.svg?branch=main)](https://coveralls.io/github/safe-global/safe-core-sdk?branch=main)

![Safe_Logos_Core_SDK_Black](https://github.com/safe-global/safe-core-sdk/assets/6764315/7202a24a-2981-4b31-9cf5-ace1c3b2c4fa)

## Table of contents

- [About](#about)
- [Documentation](#documentation)
- [Packages](#packages)
- [Guides](#guides)
- [Need Help or Have Questions?](#need-help-or-have-questions)
- [Contributing](#contributing)
- [Playground](#playground)
- [License](#license)

## About

This is a mono-repository containing Javascript/Typescript software developer tools that facilitate the interaction with [Safe Smart Accounts](https://github.com/safe-global/safe-smart-account), [Safe Transaction Service API](https://github.com/safe-global/safe-transaction-service), and enabling uses like ERC-4337 compatibility.

## Documentation

If you want to develop using Safe Smart Accounts in a Javascript/Typescript app, we recommend that you visit [our documentation site](https://docs.safe.global/sdk/overview).

## Packages

| Package | Release | Description |
| ------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [protocol-kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/protocol-kit)                 | [![npm Version](https://badge.fury.io/js/%40safe-global%2Fprotocol-kit.svg)](https://badge.fury.io/js/%40safe-global%2Fprotocol-kit)       | TypeScript library that facilitates the interaction with [Safe Smart Accounts](https://github.com/safe-global/safe-smart-account). Can be used to create new Safe accounts, update the configuration of existing Safes, create and execute transactions, among other features.                                              |
| [api-kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/api-kit)                           | [![npm Version](https://badge.fury.io/js/%40safe-global%2Fapi-kit.svg)](https://badge.fury.io/js/%40safe-global%2Fapi-kit)                 | [Safe Transaction Service API](https://github.com/safe-global/safe-transaction-service) typescript library. Allows to propose and share transactions with the other signers of a Safe, sending the signatures to the service to collect them, and getting information about a Safe, among other features.                                                                       |
| [relay-kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/relay-kit)                       | ​​​[​![npm Version](https://badge.fury.io/js/%40safe-global%2Frelay-kit.svg)​](https://badge.fury.io/js/%40safe-global%2Frelay-kit)​             | Typescript library that enables ERC-4337 with Safe and allows users to pay for the transaction fees from their Safe account balance using the blockchain native token or ERC-20 tokens, or to get their transactions sponsored.                                                                            |
| [types-kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/types-kit)   | [![npm Version](https://badge.fury.io/js/%40safe-global%2Ftypes-kit.svg)](https://badge.fury.io/js/%40safe-global%2Ftypes-kit)  | Common types used in the [Safe Core SDK](https://github.com/safe-global/safe-core-sdk/tree/main/packages) packages.                                                  |

## Guides

| Title | Description |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Integrating the Safe{Core} SDK](https://github.com/safe-global/safe-core-sdk/blob/main/guides/integrating-the-safe-core-sdk.md) | This guide shows how to use the [Protocol Kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/protocol-kit) and [API Kit](https://github.com/safe-global/safe-core-sdk/tree/main/packages/api-kit). |

## Need Help or Have Questions?

If you have any doubts, questions, or need assistance, feel free to reach out! [Here you will find how to get support.](https://github.com/safe-global/safe-core-sdk/tree/main/SUPPORT.md)

## Contributing

<<<<<<< HEAD
If you are interested in contributing, please read the [Contributing Guidelines](https://github.com/safe-global/safe-core-sdk/tree/main/CONTRIBUTING.md) **before opening an issue or submitting a pull request**.
=======
```js
const safeSdk1 = new EthersSafe(ethers, safeAddress, wallet1)
```
>>>>>>> 04993513 (Update README file)

## Playground

<<<<<<< HEAD
This project includes a [playground](https://github.com/safe-global/safe-core-sdk/tree/main/playground/README.md) with a few scripts that can be used as a starting point to use the Safe{Core} SDK. These scripts contain valuable snippets that demonstrate various Safe features. They serve as a useful learning tool or starting point for implementing these features in your application.
=======
```js
const tx = new SafeTransaction({
  to: safeAddress,
  value: '0',
  data: '0x',
  nonce: safeNonce
})
```

Before executing this transaction, it must be signed by the owners and this can be done off-chain or on-chain. In this example the owner `wallet1` will sign it off-chain and the owner `wallet2` will sign it on-chain. It is not needed that `wallet3` signs the transaction explicitly because it will be the one executing the transaction. If an account that is not an owner executes the transaction, `wallet3` would have to explicitly sign it too.

### 2.a. Off-chain signatures

The owner `wallet1` signs the transaction off-chain.

```js
const wallet1Signature = await safeSdk1.signTransaction(tx)
```

Because the signature is off-chain, there is no interaction with the contract and the signature is available at `tx.signatures`.

### 2.b. On-chain signatures

After `wallet2` account is connected to the SDK as the signer the transaction hash is approved on-chain.

```js
const safeSdk2 = safeSdk1.connect(wallet2)
const txHash = await safeSdk2.getTransactionHash(tx)
const wallet2Signature = await safeSdk2.approveTransactionHash(txHash)
```

### 3. Transaction execution

Lastly, `wallet3` account is connected to the SDK as the signer and executor of the Safe transaction to execute it.

```js
const safeSdk3 = safeSdk2.connect(wallet3)
const txResponse = await safeSdk3.executeTransaction(tx)
```

All the signatures used to execute the transaction are available at `tx.signatures`.

## API Reference

### constructor

Returns an instance of the Safe Core SDK with the `providerOrSigner` connected to the `safeAddress`.

```js
const safeSdk = new EthersSafe(ethers, safeAddress, providerOrSigner)
```

If `providerOrSigner` is not provided, `ethers` default provider will be used.

```js
const safeSdk = new EthersSafe(ethers, safeAddress)
```

### connect

Returns a new instance of the Safe Core SDK with the `providerOrSigner` connected to the `safeAddress`.

```js
const safeSdk2 = safeSdk.connect(providerOrSigner, safeAddress)
```

If `safeAddress` is not provided, the `providerOrSigner` will be connected to the previous Safe.

```js
const safeSdk2 = safeSdk.connect(providerOrSigner)
```

### getProvider

Returns the connected provider.

```js
const provider = safeSdk.getProvider()
```

### getSigner

Returns the connected signer.

```js
const signer = safeSdk.getSigner()
```

### getAddress

Returns the address of the current Safe Proxy contract.

```js
const address = safeSdk.getAddress()
```

### getContractVersion

Returns the Safe Master Copy contract version.

```js
const contractVersion = await safeSdk.getContractVersion()
```

### getOwners

Returns the list of Safe owner accounts.

```js
const owners = await safeSdk.getOwners()
```

### getThreshold

Returns the Safe threshold.

```js
const threshold = await safeSdk.getThreshold()
```

### getChainId

Returns the chainId of the connected network.

```js
const chainId = await safeSdk.getChainId()
```

### getBalance

Returns the ETH balance of the Safe.

```js
const balance = await safeSdk.getBalance()
```

### getModules

Returns the list of addresses of all the enabled Safe modules.

```js
const modules = await safeSdk.getModules()
```

### isModuleEnabled

Checks if a specific Safe module is enabled for the current Safe.

```js
const isEnabled = await safeSdk.isModuleEnabled(moduleAddress)
```

### getTransactionHash

Returns the transaction hash of a Safe transaction.

```js
const tx = new SafeTransaction({
  // ...
})
const txHash = await safeSdk.getTransactionHash(tx)
```

### signTransactionHash

Signs a hash using the current signer account.

```js
const tx = new SafeTransaction({
  // ...
})
const txHash = await safeSdk.getTransactionHash(tx)
const signature = await safeSdk.signTransactionHash(txHash)
```

### signTransaction

Adds the signature of the current signer to the Safe transaction object.

```js
const tx = new SafeTransaction({
  // ...
})
await safeSdk.signTransaction(tx)
```

### approveTransactionHash

Approves on-chain a hash using the current signer account.

```js
const tx = new SafeTransaction({
  // ...
})
const txHash = await safeSdk.getTransactionHash(tx)
const signature = await safeSdk.approveTransactionHash(txHash)
```

### getOwnersWhoApprovedTx

Returns a list of owners who have approved a specific Safe transaction.

```js
const tx = new SafeTransaction({
  // ...
})
const txHash = await safeSdk.getTransactionHash(tx)
const owners = await safeSdk.getOwnersWhoApprovedTx(txHash)
```

### executeTransaction

Executes a Safe transaction.

```js
const tx = new SafeTransaction({
  // ...
})
const txResponse = await safeSdk.executeTransaction(tx)
```
>>>>>>> 04993513 (Update README file)

## License

This library is released under [MIT](https://github.com/safe-global/safe-core-sdk/tree/main/LICENSE.md).
