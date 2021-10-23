# Create an AMM on Avalanche

# Introduction

AMM is a type of decentralized exchange which is based on a mathematical formula of price assets. It allows digital assets to be traded without any permissions and automatically by using liquidity pools instead of any traditional buyers and sellers which uses an order book that was used in traditional exchange, here assets are priced according to a pricing algorithm. 

For example, Uniswap uses p * q = k, where p is the amount of one token in the liquidity pool, and q is the amount of the other. Here “k” is a fixed constant which means the pool’s total liquidity always has to remain the same. For further explanation let us take an example if an AMM has coin A and Coin B, two volatile assets, every time A is bought, the price of A goes up as there is less A in the pool than before the purchase. Conversely, the price of B goes down as there is more B in the pool. The pool stays in constant balance, where the total value of A in the pool will always equal the total value of B in the pool. The size will expand only when new liquidity providers join the pool.

Different AMMs use different formulas according to the specific use cases they target and the similarity between all of them is that they determine the prices algorithmically. In this tutorial, we will learn how to build a very basic AMM having features namely Provide, Withdraw & Swap with no incentive mechanism like trading fees. Also, we will not deal with ERC20 tokens; instead we will maintain our own mapping storing the balance of the accounts to keep things simple!

# Prerequisites

* Basic familiarity with ReactJS and Solidity
* Should've completed [Deploy a Smart Contract on Avalanche using Remix and MetaMask](https://learn.figment.io/network-documentation/avalanche/tutorials/deploy-a-smart-contract-on-avalanche-using-remix-and-metamask) tutorial

# Requirements

* [Node.js](https://nodejs.org/en/download/releases/) v10.18.0+
* [Metamask extension](https://metamask.io/download.html) on your browser

# Implementing the smart contract

Lets start with the boilerplate code. We create a contract named `AMM` and use the SafeMath library while performing mathematical operations.  

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract AMM {
    using SafeMath for uint256;
}
```

Next we define the state variables needed to operate the AMM. We will be using the same mathematical formula as used by Uniswap to determine the price of the assets (`K = totalToken1 * totalToken2`). For simplicity purpose, We are maintaining our own internal balance mapping (token1Balance & token2Balance) instead of dealing with the ERC-20 tokens. As solidity doesn't support float numbers, We will reserve the first six digits of an integer value to represent decimal value after the dot. This is achieved by scaling the numbers by a factor of 10^6 (PRECISION).

```solidity
uint256 totalShares;  // Stores the total amount of share issued for the pool
uint256 totalToken1;  // Stores the amount of Token1 locked in the pool
uint256 totalToken2;  // Stores the amount of Token2 locked in the pool
uint256 K;            // Algorithmic constant used to determine price (K = totalToken1 * totalToken2)

uint256 constant PRECISION = 1_000_000;  // Precision of 6 decimal places

mapping(address => uint256) shares;  // Stores the share holding of each provider

mapping(address => uint256) token1Balance;  // Stores the available balance of user outside of the AMM
mapping(address => uint256) token2Balance;
```

Now we will define modifiers that will be used to check the validity of the parameters passed to the functions and restrict certain activities when the pool is empty.

```solidity
// Ensures that the _qty is non-zero and the user has enough balance
modifier validAmountCheck(mapping(address => uint256) storage _balance, uint256 _qty) {
    require(_qty > 0, "Amount cannot be zero!");
    require(_qty <= _balance[msg.sender], "Insufficient amount");
    _;
}

// Restricts withdraw, swap feature till liquidity is added to the pool
modifier activePool() {
    require(totalShares > 0, "Zero Liquidity");
    _;
}
```

The following functions are used to get the present state of the smart contract

```solidity
// Returns the balance of the user
function getMyHoldings() external view returns(uint256 amountToken1, uint256 amountToken2, uint256 myShare) {
    amountToken1 = token1Balance[msg.sender];
    amountToken2 = token2Balance[msg.sender];
    myShare = shares[msg.sender];
}

// Returns the total amount of tokens locked in the pool and the total shares issued corresponding to it
function getPoolDetails() external view returns(uint256, uint256, uint256) {
    return (totalToken1, totalToken2, totalShares);
}
```

As we are not using the ERC-20 tokens and instead maintaining record of the balance ourselves; we need a way to allocate tokens to the new users so that they can interact with the dApp. User can call the faucet function to get some tokens to play with!

```solidity
// Sends free token(s) to the invoker
function faucet(uint256 _amountToken1, uint256 _amountToken2) external {
    token1Balance[msg.sender] = token1Balance[msg.sender].add(_amountToken1);
    token2Balance[msg.sender] = token2Balance[msg.sender].add(_amountToken2);
}
```

Now we will start implementing the three core functionalities - Provide, Withdraw and Swap.

## Provide

`provide` function takes two parameters - amount of token1 & amount of token2 that the user wants to lock in the pool. If the pool is initially empty then the equivalence rate is set as `_amountToken1 : _amountToken2` and the user is issued 100 shares for it. Otherwise first it is checked whether the two amount provided by the user have equivalent value or not. This is done by checking if the two amount are in equal proportion with respect to the total number of their respective token locked in the pool i.e. `_amountToken1 : totalToken1 :: _amountToken2 : totalToken2` should hold true.

```solidity
// Adding new liquidity in the pool
// Returns the amount of share issued for locking given assets
function provide(uint256 _amountToken1, uint256 _amountToken2) external validAmountCheck(token1Balance, _amountToken1) validAmountCheck(token2Balance, _amountToken2) returns(uint256 share) {
    if(totalShares == 0) { // Genesis liquidity is issued 100 Shares
        share = 100*PRECISION;
    } else{
        uint256 share1 = totalShares.mul(_amountToken1).div(totalToken1);
        uint256 share2 = totalShares.mul(_amountToken2).div(totalToken2);
        require(share1 == share2, "Equivalent value of tokens not provided...");
        share = share1;
    }

    require(share > 0, "Asset value less than threshold for contribution!");
    token1Balance[msg.sender] -= _amountToken1;
    token2Balance[msg.sender] -= _amountToken2;

    totalToken1 += _amountToken1;
    totalToken2 += _amountToken2;
    K = totalToken1.mul(totalToken2);

    totalShares += share;
    shares[msg.sender] += share;
}
```
{% hint style="danger" %}
Carefully notice the order of balance update we are performing in the above function. We are first deducting the tokens from the users' account and in the very last step, we are updating her share balance. This is done to prevent reentrancy attack.
{% endhint %}

The given functions help the user get an estimate of the amount of other token that they need to lock with respect to the given token amount. Here again we use the proportion `_amountToken1 : totalToken1 :: _amountToken2 : totalToken2` to determine the amount of token1 required if we wish to lock given amount of token2 and vice-versa.

```solidity
// Returns amount of Token1 required when providing liquidity with _amountToken2 quantity of Token2
function getEquivalentToken1Estimate(uint256 _amountToken2) public view activePool returns(uint256 reqToken1) {
    reqToken1 = totalToken1.mul(_amountToken2).div(totalToken2);
}

// Returns amount of Token2 required when providing liquidity with _amountToken1 quantity of Token1
function getEquivalentToken2Estimate(uint256 _amountToken1) public view activePool returns(uint256 reqToken2) {
    reqToken2 = totalToken2.mul(_amountToken1).div(totalToken1);
}
```

## Withdraw

Withdraw is the opposite of provide and when a user wishes to burn a given amount of share. Token1 and Token2 are released from the pool in proportion to the share burned with respect to total shares issued i.e. `share : totalShare :: amountTokenX : totalTokenX`.

```solidity
// Returns the estimate of Token1 & Token2 that will be released on burning given _share
function getWithdrawEstimate(uint256 _share) public view activePool returns(uint256 amountToken1, uint256 amountToken2) {
    require(_share <= totalShares, "Share should be less than totalShare");
    amountToken1 = _share.mul(totalToken1).div(totalShares);
    amountToken2 = _share.mul(totalToken2).div(totalShares);
}

// Removes liquidity from the pool and releases corresponding Token1 & Token2 to the withdrawer
function withdraw(uint256 _share) external activePool validAmountCheck(shares, _share) returns(uint256 amountToken1, uint256 amountToken2) {
    (amountToken1, amountToken2) = getWithdrawEstimate(_share);
    
    shares[msg.sender] -= _share;
    totalShares -= _share;

    totalToken1 -= amountToken1;
    totalToken2 -= amountToken2;
    K = totalToken1.mul(totalToken2);

    token1Balance[msg.sender] += amountToken1;
    token2Balance[msg.sender] += amountToken2;
}
```

## Swap

To swap from Token1 to Token2 we will implement three functions - `getSwapToken1Estimate`, `getSwapToken1EstimateGivenToken2` & `swapToken1`. The first two functions only determines the values of swap for estimation purpose while the last one actually does the conversion.

`getSwapToken1Estimate` returns the amount of token2 that the user will get when depositing a given amount of token1. The amount of token2 is obtained from the equation `K = totalToken1 * totalToken2` where the `K` should remain same before/after the operation. This gives us `K = (totalToken1 + amountToken1) * (totalToken2 - amountToken2)` and we get the value `amountToken2` from solving this equation. In the last line we are ensuring that the pool is never drained completely from either side, which would cause the equation to become undefined.

```solidity
// Returns the amount of Token2 that the user will get when swapping a given amount of Token1 for Token2
function getSwapToken1Estimate(uint256 _amountToken1) public view activePool returns(uint256 amountToken2) {
    uint256 token1After = totalToken1.add(_amountToken1);
    uint256 token2After = K.div(token1After);
    amountToken2 = totalToken2.sub(token2After);

    // To ensure that Token2's pool is not completely depleted leading to inf:0 ratio
    if(amountToken2 == totalToken2) amountToken2--;
}
```

`getSwapToken1EstimateGivenToken2` returns the amount of token1 that the user should deposit to get a given amount of token2. Amount of token1 is similarly obtained by solving the following equation `K = (totalToken1 + amountToken1) * (totalToken2 - amountToken2)`.

```solidity
// Returns the amount of Token1 that the user should swap to get _amountToken2 in return
function getSwapToken1EstimateGivenToken2(uint256 _amountToken2) public view activePool returns(uint256 amountToken1) {
    require(_amountToken2 < totalToken2, "Insufficient pool balance");
    uint256 token2After = totalToken2.sub(_amountToken2);
    uint256 token1After = K.div(token2After);
    amountToken1 = token1After.sub(totalToken1);
}
```

`swapToken1` actually swaps the amount instead of just giving an estimate.

```solidity
// Swaps given amount of Token1 to Token2 using algorithmic price determination
function swapToken1(uint256 _amountToken1) external activePool validAmountCheck(token1Balance, _amountToken1) returns(uint256 amountToken2) {
    amountToken2 = getSwapToken1Estimate(_amountToken1);

    token1Balance[msg.sender] -= _amountToken1;
    totalToken1 += _amountToken1;
    totalToken2 -= amountToken2;
    token2Balance[msg.sender] += amountToken2;
}
```

Similarly for Token2 to Token1 swap we implement the three functions - `getSwapToken2Estimate`, `getSwapToken2EstimateGivenToken1` & `swapToken2` as below.

```solidity
// Returns the amount of Token2 that the user will get when swapping a given amount of Token1 for Token2
function getSwapToken2Estimate(uint256 _amountToken2) public view activePool returns(uint256 amountToken1) {
    uint256 token2After = totalToken2.add(_amountToken2);
    uint256 token1After = K.div(token2After);
    amountToken1 = totalToken1.sub(token1After);

    // To ensure that Token1's pool is not completely depleted leading to inf:0 ratio
    if(amountToken1 == totalToken1) amountToken1--;
}

// Returns the amount of Token2 that the user should swap to get _amountToken1 in return
function getSwapToken2EstimateGivenToken1(uint256 _amountToken1) public view activePool returns(uint256 amountToken2) {
    require(_amountToken1 < totalToken1, "Insufficient pool balance");
    uint256 token1After = totalToken1.sub(_amountToken1);
    uint256 token2After = K.div(token1After);
    amountToken2 = token2After.sub(totalToken2);
}

// Swaps given amount of Token2 to Token1 using algorithmic price determination
function swapToken2(uint256 _amountToken2) external activePool validAmountCheck(token2Balance, _amountToken2) returns(uint256 amountToken1) {
    amountToken1 = getSwapToken2Estimate(_amountToken2);

    token2Balance[msg.sender] -= _amountToken2;
    totalToken2 += _amountToken2;
    totalToken1 -= amountToken1;
    token1Balance[msg.sender] += amountToken1;
}
```

# Deploying the smart contract

## Setting up Metamask

Log in to MetaMask -> Click the Network drop-down -> Select Custom RPC

![Metamask](https://gblobscdn.gitbook.com/assets%2F-MIVL6JKxnpiaciltfue%2F-MM1OJt2er1kalefd4bd%2F-MM1PMHVK808DUpeSuF4%2Fimage.png?alt=media&token=9b5898f1-57e0-4334-b40c-b18005e3be0e)

**FUJI Testnet Settings:**

* **Network Name**: Avalanche FUJI C-Chain
* **New RPC URL**: [https://api.avax-test.network/ext/bc/C/rpc](https://api.avax-test.network/ext/bc/C/rpc)
* **ChainID**: `43113`
* **Symbol**: `C-AVAX`
* **Explorer**: [https://cchain.explorer.avax-test.network](https://cchain.explorer.avax-test.network/)

Fund your address from the given [faucet](https://faucet.avax-test.network/).

## Deploy using Remix

Open [Remix](https://remix.ethereum.org/) -> Select Solidity

![remix-preview](https://gblobscdn.gitbook.com/assets%2F-MKmFQYgp3Usx3i-VLJU%2F-MLOuR33iyanZrmnCDTl%2F-MLOw5RJ5tNGvy2C90xN%2Fimage.png?alt=media&token=391f3978-7d53-4112-b45a-e89c3d6d783d)

Create an `AMM.sol` file in the Remix file explorer, and paste the following code :

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract AMM {
    using SafeMath for uint256;
    uint256 totalShares;  // Stores the total amount of share issued for the pool
    uint256 totalToken1;  // Stores the amount of Token1 locked in the pool
    uint256 totalToken2;  // Stores the amount of Token2 locked in the pool
    uint256 K;            // Algorithmic constant used to determine price

    uint256 constant PRECISION = 1_000_000;  // Precision of 6 digits

    mapping(address => uint256) shares;  // Stores the share holding of each provider

    // Stores the available balance of user outside of the AMM
    // For simplicity purpose, We are maintaining our own internal 
    // balance mapping instead of dealing with ERC-20 tokens
    mapping(address => uint256) token1Balance;
    mapping(address => uint256) token2Balance;

    // Ensures that the _qty is non-zero and the user has enough balance
    modifier validAmountCheck(mapping(address => uint256) storage _balance, uint256 _qty) {
        require(_qty > 0, "Amount cannot be zero!");
        require(_qty <= _balance[msg.sender], "Insufficient amount");
        _;
    }
    
    // Restricts withdraw, swap feature till liquidity is added to the pool
    modifier activePool() {
        require(totalShares > 0, "Zero Liquidity");
        _;
    }

    // Sends free token(s) to the invoker
    function faucet(uint256 _amountToken1, uint256 _amountToken2) external {
        token1Balance[msg.sender] = token1Balance[msg.sender].add(_amountToken1);
        token2Balance[msg.sender] = token2Balance[msg.sender].add(_amountToken2);
    }
    
    // Returns the balance of the user
    function getMyHoldings() external view returns(uint256 amountToken1, uint256 amountToken2, uint256 myShare) {
        amountToken1 = token1Balance[msg.sender];
        amountToken2 = token2Balance[msg.sender];
        myShare = shares[msg.sender];
    }
    
    // Returns the total amount of tokens locked in the pool and the total shares issued corresponding to it
    function getPoolDetails() external view returns(uint256, uint256, uint256) {
        return (totalToken1, totalToken2, totalShares);
    }

    // Returns amount of Token1 required when providing liquidity with _amountToken2 quantity of Token2
    function getEquivalentToken1Estimate(uint256 _amountToken2) public view activePool returns(uint256 reqToken1) {
        reqToken1 = totalToken1.mul(_amountToken2).div(totalToken2);
    }

    // Returns amount of Token2 required when providing liquidity with _amountToken1 quantity of Token1
    function getEquivalentToken2Estimate(uint256 _amountToken1) public view activePool returns(uint256 reqToken2) {
        reqToken2 = totalToken2.mul(_amountToken1).div(totalToken1);
    }

    // Adding new liquidity in the pool
    // Returns the amount of share issued for locking given assets
    function provide(uint256 _amountToken1, uint256 _amountToken2) external validAmountCheck(token1Balance, _amountToken1) validAmountCheck(token2Balance, _amountToken2) returns(uint256 share) {
        if(totalShares == 0) { // Genesis liquidity is issued 100 Shares
            share = 100*PRECISION;
        } else{
            uint256 share1 = totalShares.mul(_amountToken1).div(totalToken1);
            uint256 share2 = totalShares.mul(_amountToken2).div(totalToken2);
            require(share1 == share2, "Equivalent value of tokens not provided...");
            share = share1;
        }

        require(share > 0, "Asset value less than threshold for contribution!");
        token1Balance[msg.sender] -= _amountToken1;
        token2Balance[msg.sender] -= _amountToken2;

        totalToken1 += _amountToken1;
        totalToken2 += _amountToken2;
        K = totalToken1.mul(totalToken2);

        totalShares += share;
        shares[msg.sender] += share;
    }

    // Returns the estimate of Token1 & Token2 that will be released on burning given _share
    function getWithdrawEstimate(uint256 _share) public view activePool returns(uint256 amountToken1, uint256 amountToken2) {
        require(_share <= totalShares, "Share should be less than totalShare");
        amountToken1 = _share.mul(totalToken1).div(totalShares);
        amountToken2 = _share.mul(totalToken2).div(totalShares);
    }

    // Removes liquidity from the pool and releases corresponding Token1 & Token2 to the withdrawer
    function withdraw(uint256 _share) external activePool validAmountCheck(shares, _share) returns(uint256 amountToken1, uint256 amountToken2) {
        (amountToken1, amountToken2) = getWithdrawEstimate(_share);
        
        shares[msg.sender] -= _share;
        totalShares -= _share;

        totalToken1 -= amountToken1;
        totalToken2 -= amountToken2;
        K = totalToken1.mul(totalToken2);

        token1Balance[msg.sender] += amountToken1;
        token2Balance[msg.sender] += amountToken2;
    }

    // Returns the amount of Token2 that the user will get when swapping a given amount of Token1 for Token2
    function getSwapToken1Estimate(uint256 _amountToken1) public view activePool returns(uint256 amountToken2) {
        uint256 token1After = totalToken1.add(_amountToken1);
        uint256 token2After = K.div(token1After);
        amountToken2 = totalToken2.sub(token2After);

        // To ensure that Token2's pool is not completely depleted leading to inf:0 ratio
        if(amountToken2 == totalToken2) amountToken2--;
    }
    
    // Returns the amount of Token1 that the user should swap to get _amountToken2 in return
    function getSwapToken1EstimateGivenToken2(uint256 _amountToken2) public view activePool returns(uint256 amountToken1) {
        require(_amountToken2 < totalToken2, "Insufficient pool balance");
        uint256 token2After = totalToken2.sub(_amountToken2);
        uint256 token1After = K.div(token2After);
        amountToken1 = token1After.sub(totalToken1);
    }

    // Swaps given amount of Token1 to Token2 using algorithmic price determination
    function swapToken1(uint256 _amountToken1) external activePool validAmountCheck(token1Balance, _amountToken1) returns(uint256 amountToken2) {
        amountToken2 = getSwapToken1Estimate(_amountToken1);

        token1Balance[msg.sender] -= _amountToken1;
        totalToken1 += _amountToken1;
        totalToken2 -= amountToken2;
        token2Balance[msg.sender] += amountToken2;
    }

    // Returns the amount of Token2 that the user will get when swapping a given amount of Token1 for Token2
    function getSwapToken2Estimate(uint256 _amountToken2) public view activePool returns(uint256 amountToken1) {
        uint256 token2After = totalToken2.add(_amountToken2);
        uint256 token1After = K.div(token2After);
        amountToken1 = totalToken1.sub(token1After);

        // To ensure that Token1's pool is not completely depleted leading to inf:0 ratio
        if(amountToken1 == totalToken1) amountToken1--;
    }
    
    // Returns the amount of Token2 that the user should swap to get _amountToken1 in return
    function getSwapToken2EstimateGivenToken1(uint256 _amountToken1) public view activePool returns(uint256 amountToken2) {
        require(_amountToken1 < totalToken1, "Insufficient pool balance");
        uint256 token1After = totalToken1.sub(_amountToken1);
        uint256 token2After = K.div(token1After);
        amountToken2 = token2After.sub(totalToken2);
    }

    // Swaps given amount of Token2 to Token1 using algorithmic price determination
    function swapToken2(uint256 _amountToken2) external activePool validAmountCheck(token2Balance, _amountToken2) returns(uint256 amountToken1) {
        amountToken1 = getSwapToken2Estimate(_amountToken2);

        token2Balance[msg.sender] -= _amountToken2;
        totalToken2 += _amountToken2;
        totalToken1 -= amountToken1;
        token1Balance[msg.sender] += amountToken1;
    }
}
```

Navigate to the Solidity compiler Tab on the left side navigation bar and click the blue button to compile the `AMM.sol` contract. Note down the `ABI` as it will be required in the next section.

Navigate to Deploy Tab and open the “ENVIRONMENT” drop-down. Select "Injected Web3" (make sure Metamask is loaded) and click the "Deploy" button. 

Approve the transaction on Metamask pop-up interface. Once our contract is deployed successfully, Note down the `contract address`.

{% hint style="info" %}  
An Application Binary Interface (ABI) is a JSON object which stores the metadata about the methods of a contract like data type of input parameters, return data type & property of the method like payable, view, pure, etc. You can learn more about the ABI from the [solidity documentation](https://docs.soliditylang.org/en/latest/abi-spec.html)  
{% endhint %}

# Creating a frontend in React
Now, we are going to create a react app and set up the frontend of the application. In the frontend, we represent token1 and token2 as KAR and KOTHI.

Open a terminal and navigate to the directory where we will create the application.
```bash
cd /path/to/directory
```

Create a new react app.
```bash
npx create-react-app avalanche-amm
```

Move to the newly created directory and install the given dependencies.
```bash
cd avalanche-amm
npm install --save ethers@5.4.7 react-icons@4.3.1
```

Create a new directory `components` inside the `src` directory, where we will be keeping all our React components, using the following command :
```bash
mkdir ./src/components
cd ./src/components
```

Now lets create the most reused component which takes user-input for our dApp. Create a new file called `BoxTemplate.jsx` and paste the following code : 
```javascript
import "../styles.css";
import { RE } from "../constants";

export default function BoxTemplate(props) {
    const onInputChange = (e) => {
        if (e.target.value === "" || RE.test(e.target.value)) {
            props.onChange(e);
        }
    };
    return (
        <div className="boxTemplate">
            <div className="boxBody">
                <div>
                    <p className="leftHeader"> {props.leftHeader} </p>
                    <input
                        className="textField"
                        value={props.value}
                        onChange={(e) => onInputChange(e)}
                        placeholder={"Enter amount"}
                    />
                </div>
                <div className="rightContent">{props.right}</div>
            </div>
        </div>
    );
}
```

Lets create the component which will contain and control the other component. Create a new file called `ContainerComponent.jsx` and paste the following code:
```javascript
import { useEffect, useState } from "react";
import "../styles.css";
import SwapComponent from "./SwapComponent";
import ProvideComponent from "./ProvideComponent";
import WithdrawComponent from "./WithdrawComponent";
import FaucetComponent from "./FaucetComponent";
import { PRECISION } from "../constants";

export default function ContainerComponent(props) {
    const [activeTab, setActiveTab] = useState("Swap");
    const [amountOfKAR, setAmountOfKAR] = useState(0);
    const [amountOfKOTHI, setAmountOfKOTHI] = useState(0);
    const [amountOfShare, setAmountOfShare] = useState(0);
    const [totalKAR, setTotalKAR] = useState(0);
    const [totalKOTHI, setTotalKOTHI] = useState(0);
    const [totalShare, setTotalShare] = useState(0);

    useEffect(() => {
        getHoldings();
    });

    //fetch the pool details and personal assets details.
    async function getHoldings() {
        try {
            console.log("Fetching holdings----");
            let response = await props.contract.getMyHoldings();
            setAmountOfKAR(response.amountToken1 / PRECISION);
            setAmountOfKOTHI(response.amountToken2 / PRECISION);
            setAmountOfShare(response.myShare / PRECISION);

            response = await props.contract.getPoolDetails();
            setTotalKAR(response[0] / PRECISION);
            setTotalKOTHI(response[1] / PRECISION);
            setTotalShare(response[2] / PRECISION);
        } catch (err) {
            console.log("Couldn't Fetch holdings", err);
        }
    }

    const changeTab = (tab) => {
        setActiveTab(tab);
    };

    return (
        <div className="centerBody">
            <div className="centerContainer">
                <div className="selectTab">
                    <div
                        className={"tabStyle " + (activeTab === "Swap" ? "activeTab" : "")}
                        onClick={() => changeTab("Swap")}
                    >
                        Swap
                    </div>
                    <div
                        className={
                            "tabStyle " + (activeTab === "Provide" ? "activeTab" : "")
                        }
                        onClick={() => changeTab("Provide")}
                    >
                        Provide
                    </div>
                    <div
                        className={
                            "tabStyle " + (activeTab === "Withdraw" ? "activeTab" : "")
                        }
                        onClick={() => changeTab("Withdraw")}
                    >
                        Withdraw
                    </div>
                    <div
                        className={
                            "tabStyle " + (activeTab === "Faucet" ? "activeTab" : "")
                        }
                        onClick={() => changeTab("Faucet")}
                    >
                        Faucet
                    </div>
                </div>

                {activeTab === "Swap" && (
                    <SwapComponent
                        contract={props.contract}
                        getHoldings={() => getHoldings()}
                    />
                )}
                {activeTab === "Provide" && (
                    <ProvideComponent
                        contract={props.contract}
                        getHoldings={() => getHoldings()}
                    />
                )}
                {activeTab === "Withdraw" && (
                    <WithdrawComponent
                        contract={props.contract}
                        maxShare={amountOfShare}
                        getHoldings={() => getHoldings()}
                    />
                )}
                {activeTab === "Faucet" && (
                    <FaucetComponent
                        contract={props.contract}
                        getHoldings={() => getHoldings()}
                    />
                )}
            </div>
            <div className="details">
                <div className="detailsBody">
                    <div className="detailsHeader">Details</div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Amount of KAR:</div>
                        <div className="detailsValue">{amountOfKAR}</div>
                    </div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Amount of KOTHI:</div>
                        <div className="detailsValue">{amountOfKOTHI}</div>
                    </div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Your Share:</div>
                        <div className="detailsValue">{amountOfShare}</div>
                    </div>
                    <div className="detailsHeader">Pool Details</div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Total KAR:</div>
                        <div className="detailsValue">{totalKAR}</div>
                    </div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Total KOTHI:</div>
                        <div className="detailsValue">{totalKOTHI}</div>
                    </div>
                    <div className="detailsRow">
                        <div className="detailsAttribute">Total Shares:</div>
                        <div className="detailsValue">{totalShare}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
```

Next we create the faucet component which helps to fund an account with the desired amount of KAR and KOTHI. Create a new file called `FaucetComponent.jsx` and paste the following code: 
```javascript
import { useState } from "react";
import "../styles.css";
import BoxTemplate from "./BoxTemplate";
import { PRECISION } from "../constants";

export default function FaucetComponent(props) {
    const [amountOfKar, setAmountOfKar] = useState(0);
    const [amountOfKothi, setAmountOfKothi] = useState(0);

    const onChangeAmountOfKothi = (e) => {
        setAmountOfKothi(e.target.value);
    };

    const onChangeAmountOfKar = (e) => {
        setAmountOfKar(e.target.value);
    };

    async function onClickFund() {
        if (props.contract === null) {
            alert("Connect to Metamask");
            return;
        }
        if (["", "."].includes(amountOfKar) || ["", "."].includes(amountOfKothi)) {
            alert("Amount should be a valid number");
            return;
        }
        try {
            let response = await props.contract.faucet(
                amountOfKar * PRECISION,
                amountOfKothi * PRECISION
            );
            let res = await response.wait();
            console.log("res", res);
            setAmountOfKar(0);
            setAmountOfKothi(0);
            await props.getHoldings();
            alert("Success");
        } catch (err) {
            err?.data?.message && alert(err?.data?.message);
            console.log(err);
        }
    }

    return (
        <div className="tabBody">
            <BoxTemplate
                leftHeader={"Amount of KAR"}
                right={"KAR"}
                value={amountOfKar}
                onChange={(e) => onChangeAmountOfKar(e)}
            />
            <BoxTemplate
                leftHeader={"Amount of KOTHI"}
                right={"KOTHI"}
                value={amountOfKothi}
                onChange={(e) => onChangeAmountOfKothi(e)}
            />
            <div className="bottomDiv">
                <div className="btn" onClick={() => onClickFund()}>
                    Fund
                </div>
            </div>
        </div>
    );
}
```

Now lets create the provide component which helps to provide liquidity to our AMM. Create a new file called `ProvideComponent.jsx` and paste the following code: 
```javascript
import { MdAdd } from "react-icons/md";
import { useState } from "react";
import "../styles.css";
import BoxTemplate from "./BoxTemplate";
import { PRECISION } from "../constants";

export default function ProvideComponent(props) {
    const [amountOfKar, setAmountOfKar] = useState(0);
    const [amountOfKothi, setAmountOfKothi] = useState(0);
    const [error, setError] = useState("");

    const getProvideEstimate = async (token, value) => {
        if (["", "."].includes(value)) return;
        if (props.contract !== null) {
            try {
                let estimate;
                if (token === "KAR") {
                    estimate = await props.contract.getEquivalentToken2Estimate(
                        value * PRECISION
                    );
                    setAmountOfKothi(estimate / PRECISION);
                } else {
                    estimate = await props.contract.getEquivalentToken1Estimate(
                        value * PRECISION
                    );
                    setAmountOfKar(estimate / PRECISION);
                }
            } catch (err) {
                if (err.data.message === "execution reverted: Zero Liquidity") {
                    setError("Message: Empty pool. Set the initial conversion rate.");
                } else {
                    alert(err?.data?.message);
                }
            }
        }
    };

    const onChangeAmountOfKar = (e) => {
        setAmountOfKar(e.target.value);
        getProvideEstimate("KAR", e.target.value);
    };

    const onChangeAmountOfKothi = (e) => {
        setAmountOfKothi(e.target.value);
        getProvideEstimate("KOTHI", e.target.value);
    };

    const provide = async () => {
        if (["", "."].includes(amountOfKar) || ["", "."].includes(amountOfKothi)) {
            alert("Amount should be a valid number");
            return;
        }
        if (props.contract === null) {
            alert("Connect to Metamask");
            return;
        } else {
            try {
                let response = await props.contract.provide(
                    amountOfKar * PRECISION,
                    amountOfKothi * PRECISION
                );
                await response.wait();
                setAmountOfKar(0);
                setAmountOfKothi(0);
                await props.getHoldings();
                alert("Success");
                setError("");
            } catch (err) {
                err && alert(err?.data?.message);
            }
        }
    };

    return (
        <div className="tabBody">
            <BoxTemplate
                leftHeader={"Amount of KAR"}
                value={amountOfKar}
                onChange={(e) => onChangeAmountOfKar(e)}
            />
            <div className="swapIcon">
                <MdAdd />
            </div>
            <BoxTemplate
                leftHeader={"Amount of KOTHI"}
                value={amountOfKothi}
                onChange={(e) => onChangeAmountOfKothi(e)}
            />
            <div className="error">{error}</div>
            <div className="bottomDiv">
                <div className="btn" onClick={() => provide()}>
                    Provide
                </div>
            </div>
        </div>
    );
}
```

The swap allows to convert one token to another depending on the conversion rate, let's create the component implementing this feature. Create a new file called `SwapComponent.jsx` and paste the following code: 

```javascript
import { useState } from "react";
import { MdSwapVert } from "react-icons/md";
import "../styles.css";
import BoxTemplate from "./BoxTemplate";
import { PRECISION } from "../constants";

export default function SwapComponent(props) {
    const [coin, setCoin] = useState(["KAR", "KOTHI"]);
    const [amountFrom, setAmountFrom] = useState(0.0);
    const [amountTo, setAmountTo] = useState(0.0);

    const rev = () => {
        setCoin([...coin.reverse()]);
        getSwapEstimateAmountTo(amountFrom);
    };

    const getSwapEstimateAmountTo = async (val) => {
        if (["", "."].includes(val)) return;
        if (props.contract !== null) {
            try {
                let estimateOfAmountTo;
                if (coin[0] === "KAR") {
                    estimateOfAmountTo = await props.contract.getSwapToken1Estimate(
                        val * PRECISION
                    );
                } else {
                    estimateOfAmountTo = await props.contract.getSwapToken2Estimate(
                        val * PRECISION
                    );
                }
                setAmountTo(estimateOfAmountTo / PRECISION);
            } catch (err) {
                alert(err?.data?.message);
            }
        }
    };

    const getSwapEstimateAmountFrm = async (val) => {
        if (["", "."].includes(val)) return;
        if (props.contract !== null) {
            try {
                let estimateOfAmountFrm;
                if (coin[0] === "KAR") {
                    estimateOfAmountFrm =
                        await props.contract.getSwapToken1EstimateGivenToken2(
                            val * PRECISION
                        );
                } else {
                    estimateOfAmountFrm =
                        await props.contract.getSwapToken2EstimateGivenToken1(
                            val * PRECISION
                        );
                }
                setAmountFrom(estimateOfAmountFrm / PRECISION);
            } catch (err) {
                alert(err?.data?.message);
            }
        }
    };

    const onChangeAmtFrm = (val) => {
        setAmountFrom(val.target.value);
        getSwapEstimateAmountTo(val.target.value);
    };

    const onChangeAmtTo = (val) => {
        setAmountTo(val.target.value);
        getSwapEstimateAmountFrm(val.target.value);
    };

    const onSwap = async () => {
        if (["", "."].includes(amountFrom)) {
            alert("Amount should be a valid number");
            return;
        }
        if (props.contract === null) {
            alert("Connect to Metamask");
            return;
        } else {
            try {
                let response;
                if (coin[0] === "KAR") {
                    response = await props.contract.swapToken1(amountFrom * PRECISION);
                } else {
                    response = await props.contract.swapToken2(amountFrom * PRECISION);
                }
                await response.wait();
                setAmountFrom(0);
                setAmountTo(0);
                await props.getHoldings();
                alert("Success!");
            } catch (err) {
                alert(err?.data?.message);
            }
        }
    };
    return (
        <div className="tabBody">
            <BoxTemplate
                leftHeader={"From"}
                right={coin[0]}
                value={amountFrom}
                onChange={(e) => onChangeAmtFrm(e)}
            />
            <div className="swapIcon" onClick={() => rev()}>
                <MdSwapVert />
            </div>
            <BoxTemplate
                leftHeader={"To"}
                right={coin[1]}
                value={amountTo}
                onChange={(e) => onChangeAmtTo(e)}
            />
            <div className="bottomDiv">
                <div className="btn" onClick={() => onSwap()}>
                    Swap
                </div>
            </div>
        </div>
    );
}
```

Lets now create the implementing the withdraw feature. Create a new file called `WithdrawComponent.jsx` and paste the following code: 
```javascript
import { useState } from "react";
import "../styles.css";
import BoxTemplate from "./BoxTemplate";
import { PRECISION } from "../constants.js";

export default function WithdrawComponent(props) {
    const [amountOfShare, setAmountOfShare] = useState(0);
    const [estimateTokens, setEstimateTokens] = useState([]);
    const onChangeAmountOfShare = async (e) => {
        setAmountOfShare(e.target.value);
        if (!["", "."].includes(e.target.value) && props.contract !== null) {
            try {
                let response = await props.contract.getWithdrawEstimate(
                    e.target.value * PRECISION
                );
                setEstimateTokens([
                    response.amountToken1 / PRECISION,
                    response.amountToken2 / PRECISION,
                ]);
            } catch (err) {
                alert(err?.data?.message);
            }
        }
    };
    const getMaxShare = async () => {
        if (props.contract !== null) {
            setAmountOfShare(props.maxShare);
            let response = await props.contract.getWithdrawEstimate(
                props.maxShare * PRECISION
            );
            setEstimateTokens([
                response.amountToken1 / PRECISION,
                response.amountToken2 / PRECISION,
            ]);
        } else alert("Connect to Metamask");
    };

    const withdrawShare = async () => {
        if (["", "."].includes(amountOfShare)) {
            alert("Amount should be a valid number");
            return;
        }
        if (props.maxShare < amountOfShare) {
            alert("Amount should be less than your max share");
            return;
        }
        if (props.contract === null) {
            alert("Connect to Metamask");
            return;
        } else {
            try {
                let response = await props.contract.withdraw(amountOfShare * PRECISION);
                console.log(response);
                await response.wait();
                setAmountOfShare(0);
                setEstimateTokens([]);
                await props.getHoldings();
                alert("Success!");
            } catch (err) {
                alert(err?.data?.message);
            }
        }
    };
    return (
        <div className="tabBody">
            <BoxTemplate
                leftHeader={"Amount:"}
                right={
                    <div onClick={() => getMaxShare()} className="getMax">
                        Max
                    </div>
                }
                value={amountOfShare}
                onChange={(e) => onChangeAmountOfShare(e)}
            />
            {estimateTokens.length > 0 && (
                <div className="withdrawEstimate">
                    <div className="amount">Amount of Kar: {estimateTokens[0]}</div>
                    <div className="amount">Amount of Kothi: {estimateTokens[1]}</div>
                </div>
            )}
            <div className="bottomDiv">
                <div className="btn" onClick={() => withdrawShare()}>
                    Withdraw
                </div>
            </div>
        </div>
    );
}
```

Now move out of the `components` directory using the following command:
```bash
cd ..
```

Under the `src` directory now create a new file called `styles.css` and paste the following code: 
```css
body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
        "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
        sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, "Courier New",
        monospace;
}

html,
body,
.pageBody,
#root {
    height: 100%;
    background: linear-gradient(180deg, #242525 0%, #000 180%);
}

.tabBody {
    margin: 0px auto;
    width: 500px;
    padding-top: 5px;
    justify-content: center;
    align-items: center;
    border-radius: 0px 0px 19px 19px;
    background-color: #0e0e10;
    border-top: 0px;
    margin-right: 0px;
}

.bottomDiv {
    margin: 10px auto;
    width: 30%;
    padding: 5px;
    justify-content: center;
    align-items: center;
    border-radius: 19px;
}
.boxStyle {
    width: 70%;
    height: auto;
    display: flex;
    justify-content: flex-start;
    margin: 1px auto;
    flex-direction: row;
    border-radius: 19px;
    position: relative;
    overflow: hidden;
    border: 1px solid grey;
}
.leftHeader {
    font-size: 14px;
}

.getMax {
    background-color: #242525;
    border: 1px solid white;
    border-radius: 19px;
    height: 30px;
    width: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
}

.getMax:hover {
    background-color: #b4b4b4;
    border: 2px;
}

.boxTemplate {
    width: 75%;
    height: auto;
    display: flex;
    margin: 50px auto;
    padding: 0px 40px 20px 40px;
    flex-direction: column;
    border-radius: 19px;
    position: relative;
    overflow: hidden;
    border: 2px solid grey;
}
.boxStyle2 {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid grey;
}
.selectTab {
    width: 460px;
    height: 80px;
    display: flex;
    justify-content: space-between;
    margin: 0px auto;
    margin-top: 10px;
    margin-right: 0px;
    background-color: #0e0e10;
    border-radius: 19px 19px 0px 0px;
    padding: 0px 20px 0px 20px;
}
.myStyle1 {
    margin: 10px 30px;
    width: 30%;
    padding: 5px;
    justify-content: center;
    align-items: center;
    border-radius: 19px;
}

.btn {
    background-color: #242525;
    margin: 10px 30px;
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 18px;
    width: 100px;
    height: 40px;
    border-radius: 9px;
    cursor: pointer;
}

.textField {
    width: 70%;
    height: 30px;
    font-size: 22px;
    background-color: #0e0e10;
    color: white;
    border: 0px;
}
.textField:focus-visible {
    outline: none;
}

.boxBody {
    display: flex;
    justify-content: space-between;
    color: white;
}
.rightContent {
    display: flex;
    align-items: center;
    justify-content: center;
    font: 20px;
    font-weight: 700;
}
.center {
    text-align: center;
}

.tabStyle {
    text-align: center;
    width: 80px;
    padding: 5px;
    font: 18px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    margin-top: 15px;
    border-radius: 15px;
    cursor: pointer;
}

.tabStyle:hover {
    background: rgba(255, 255, 255, 0.05);
}

.activeTab {
    background: rgba(255, 255, 255, 0.1);
}

.swapIcon {
    width: 5%;
    text-align: center;
    display: flex;
    margin: 40px auto;
    color: #ff726e;
}

svg {
    height: 50px;
    width: 50px;
}

.connectBtn {
    position: absolute;
    right: 50px;
    top: 20px;
    background-color: #ff726e;
    color: #0e0e10;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 5px 10px 5px 10px;
    border: 1px solid #c8332e;
    border-radius: 15px;
}

.connectBtn:hover {
    color: white;
    border: 2px solid #c8332e;
}

.connected {
    position: absolute;
    right: 50px;
    top: 20px;
    background-color: #4caf50;
    color: white;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 5px 10px 5px 10px;
    border: 1px solid #2a722c;
    border-radius: 15px;
}

.details {
    padding: 15px 10px 15px 0px;
    width: 370px;
    height: fit-content;
    position: absolute;
    right: 0px;
    display: flex;
    justify-content: center;
}

.withdrawEstimate {
    height: 30px;
    width: 75%;
    margin: 10px auto;
    color: white;
}

.detailsBody {
    background-color: #0e0e10;
    width: 90%;
    padding: 10px;
    border-radius: 19px;
}

.detailsHeader {
    height: 30px;
    font-size: 20px;
    font-weight: 600;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    margin-bottom: 15px;
}

.detailsRow {
    padding: 0px 25px;
    height: 35px;
    display: flex;
    justify-content: space-around;
}

.detailsAttribute {
    font: 18px;
    font-weight: 600;
    color: white;
    display: flex;
    justify-content: flex-start;
    width: 50%;
}

.detailsValue {
    font: 18px;
    font-weight: 900;
    color: white;
    display: flex;
    justify-content: center;
    width: 50%;
}

.centerBody {
    display: flex;
    justify-content: center;
    height: 100%;
}

.navBar {
    height: 80px;
    background-color: #0e0e10;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    padding: 0px 30px;
}

.appName {
    font-size: 28px;
    font-weight: 800;
}

.error {
    color: white;
    display: flex;
    justify-content: flex-start;
    padding: 0px 20px;
}

@media only screen and (max-width: 1100px) {
    .centerBody {
        display: block;
    }
    .selectTab {
        margin: 0px auto;
        margin-top: 10px;
    }
    .tabBody {
        margin: 0px auto;
    }
    .details {
        position: relative;
        display: flex;
        justify-content: center;
        width: 100%;
    }
    .detailsBody {
        width: 500px;
    }
    .navBar {
        justify-content: flex-start;
    }
}
```

Open the file `App.js` and paste the following code block:
```javascript
import { ethers } from "ethers";
import { useState } from "react";
import { abi, CONTRACT_ADDRESS } from "./constants";
import ContainerComponent from "./components/ContainerComponent";
import "./styles.css";

export default function App() {
    const [myContract, setMyContract] = useState(null);
    const [address, setAddress] = useState();

    let provider, signer, add;

    async function connect() {
        let res = await connectToMetamask();
        if (res === true) {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            add = await signer.getAddress();
            setAddress(add);
            try {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
                setMyContract(contract);
            } catch (err) {
                alert("CONTRACT_ADDRESS not set properly");
            }
        } else {
            alert("Couldn't connect to Metamask");
        }
    }

    async function connectToMetamask() {
        try {
            await window.ethereum.enable();
            return true;
        } catch (err) {
            return false;
        }
    }

    return (
        <div className="pageBody">
            <div className="navBar">
                <div className="appName"> AMM </div>
                {myContract === null ? (
                    <div className="connectBtn" onClick={() => connect()}>
                        {" "}
                        Connect to Metamask{" "}
                    </div>
                ) : (
                    <div className="connected"> {"Connected to " + address} </div>
                )}
            </div>
            <ContainerComponent contract={myContract} connect={() => connect()} />
        </div>
    );
}

```

Open the file `index.js` and paste the following code block:

```javascript
import React from "react";
import ReactDOM from "react-dom";
import "./styles.css";
import App from "./App";

ReactDOM.render(<App />, document.getElementById("root"));
```

All the constants used in the application will be stored in a file named `constants.js`. Create a new file named `constants.js` and paste the following code:

```javascript
export const PRECISION = 1000000;
export const RE = /^[0-9]*[.]?[0-9]{0,6}$/;
export const CONTRACT_ADDRESS = /*PASTE THE CONTRACT ADDRESS HERE*/;
export const abi = /*PASTE THE CONTRACT ABI*/; 
```

Note that you have to store the contract address and the ABI you copied from remix in this file in the variables named `CONTRACT_ADDRESS` and `abi` respectively. The `constants.js` file should look like this!

```javascript

export const PRECISION = 1000000;
export const RE = /^[0-9]*[.]?[0-9]{0,6}$/;
export const CONTRACT_ADDRESS = "0x806D6B235C33c6B5b82EcD3B11509eFeC61BF643";
export const abi = [
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "faucet",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "provide",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "share",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            }
        ],
        "name": "swapToken1",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "swapToken2",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_share",
                "type": "uint256"
            }
        ],
        "name": "withdraw",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "getEquivalentToken1Estimate",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "reqToken1",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            }
        ],
        "name": "getEquivalentToken2Estimate",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "reqToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getMyHoldings",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "myShare",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getPoolDetails",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            }
        ],
        "name": "getSwapToken1Estimate",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "getSwapToken1EstimateGivenToken2",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken2",
                "type": "uint256"
            }
        ],
        "name": "getSwapToken2Estimate",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_amountToken1",
                "type": "uint256"
            }
        ],
        "name": "getSwapToken2EstimateGivenToken1",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "_share",
                "type": "uint256"
            }
        ],
        "name": "getWithdrawEstimate",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "amountToken1",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "amountToken2",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]
```

{% hint style="info" %}  
An Application Binary Interface (ABI) is a JSON object which stores the metadata about the methods of a contract like data type of input parameters, return data type & property of the method like payable, view, pure, etc. You can learn more about the ABI from the [solidity documentation](https://docs.soliditylang.org/en/latest/abi-spec.html)  
{% endhint %}

Now it's time to run our React app. Use the following command to start the React app.
```bash
npm start
```

# Walkthrough

* Visit [http://localhost:3000](http://localhost:3000) to interact with the AMM.

* Getting funds from the faucet to interact with the AMM

![preview]()

* Adding liquidity in the pool 

![preview]()

* Swapping tokens

![preview]()

* Withdrawing liquidity from the pool 

![preview]()

# Conclusion
Congratulations! We have successfully developed a working AMM model where users can swap tokens, provide & withdraw liquidity. As a next step, you can play around with the price formula, integrate the ERC20 standard, introduce fees as an incentive mechanism for providers or add slippage protection, and much more...

## Troubleshooting

**Transaction Failure**

* Check if your account has sufficient balance at [fuji block-explorer](https://cchain.explorer.avax-test.network/). You can fund your address from the given [faucet](https://faucet.avax-test.network/)

![Zero balance preview](https://raw.githubusercontent.com/realnimish/blockchain-chat-app/main/public/zero_balance.jpeg)

* Make sure that you have selected the correct account on metamask if you have more than one account connected to the site.

![Multiple account preview](https://raw.githubusercontent.com/realnimish/blockchain-chat-app/main/public/multiple_accounts.jpeg)

# About the Author(s)  

The tutorial was created by [Sayan Kar](https://github.com/SayanKar), [Yash Kothari](https://github.com/YASH) and [Nimish Agrawal](https://github.com/realnimish). You can reach out to them on [Figment Forum](https://community.figment.io/u/nimishagrawal100.in/) or on LinkedIn [@Nimish Agrawal](https://www.linkedin.com/in/realnimish), [@Yash Kothari](https://www.linkedin.com/in/YASH) and [@Sayan Kar](https://www.linkedin.com/in/sayan-kar-).

# References

- [Deploy a Smart Contract on Avalanche using Remix and MetaMask](https://docs.avax.network/build/tutorials/smart-contracts/deploy-a-smart-contract-on-avalanche-using-remix-and-metamask)

- [How Uniswap works](https://docs.uniswap.org/protocol/V2/concepts/protocol-overview/how-uniswap-works)
