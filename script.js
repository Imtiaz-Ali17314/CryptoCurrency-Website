const URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin%2Cethereum%2Cdogecoin&vs_currencies=usd";

const btc = document.querySelector("#btc");
const eth = document.querySelector("#eth");
const dog = document.querySelector("#dog");

async function crypto() {
  let response = await fetch(URL);
  let responseJSON = await response.json();

  btc.innerHTML = responseJSON.bitcoin.usd;
  eth.innerHTML = responseJSON.ethereum.usd;
  dog.innerHTML = responseJSON.dogecoin.usd;
}

setInterval(() => {
  crypto();
}, 1000);
