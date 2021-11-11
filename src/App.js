import { ethers } from "ethers";
import { useState } from "react";
import { abi, CONTRACT_ADDRESS } from "./constants";
import ContainerComponent from "./components/ContainerComponent";
import "./styles.css";

export default function App() {
    const [myContract, setMyContract] = useState(null);
    const [address, setAddress] = useState();

    let provider, signer, add;

    // Connects to Metamask and sets the myContract state with a new instance of the contract
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

    // Helps open Metamask
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
