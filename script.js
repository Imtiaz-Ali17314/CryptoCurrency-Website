/* ApexCrypt OS Core Terminal Logic */

// Global State
let prices = {
  bitcoin: { usd: 0, change: 0, symbol: 'BTC' },
  ethereum: { usd: 0, change: 0, symbol: 'ETH' },
  dogecoin: { usd: 0, change: 0, symbol: 'DOGE' },
  solana: { usd: 0, change: 0, symbol: 'SOL' },
  binancecoin: { usd: 0, change: 0, symbol: 'BNB' }
};

let previousPrices = { ...prices };
let portfolio = [];
let rules = [];
let activeChartSymbol = 'BINANCE:BTCUSDT';
let wsConnection = null;

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  initTradingViewWidget(activeChartSymbol);
  loadPortfolio();
  loadRules();
  connectWebSocket();
  initEventListeners();
  startWhaleAlertSimulator();
});

// 1. TradingView Embed Widget
function initTradingViewWidget(symbol) {
  try {
    activeChartSymbol = symbol;
    document.getElementById('chartSymbolIndicator').textContent = symbol;
    
    // Clear old container if exists
    const container = document.getElementById('tradingview_dashboard');
    container.innerHTML = '';
    
    new TradingView.widget({
      "autosize": true,
      "symbol": symbol,
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_side_toolbar": false,
      "allow_symbol_change": true,
      "container_id": "tradingview_dashboard"
    });
  } catch (e) {
    console.error("TradingView load error: ", e);
    document.getElementById('tradingview_dashboard').innerHTML = 
      `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">
        <i class="fa-solid fa-triangle-exclamation"></i> &nbsp; TradingView Widget load failed. Sandbox offline or scripts blocked.
      </div>`;
  }
}

// 2. Binance WebSocket stream connection
function connectWebSocket() {
  const wsUrl = "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/dogeusdt@ticker/solusdt@ticker/bnbusdt@ticker";
  
  wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => {
    console.log("WebSocket connected to Binance Streamer.");
    logRuleConsole("System linked to Binance Liquidity Pools. Real-time tickers active.");
  };
  
  wsConnection.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const stream = message.stream;
    const data = message.data;
    
    if (!data) return;
    
    // Map Binance Symbols to our IDs
    let coinId = '';
    if (stream.includes('btcusdt')) coinId = 'bitcoin';
    else if (stream.includes('ethusdt')) coinId = 'ethereum';
    else if (stream.includes('dogeusdt')) coinId = 'dogecoin';
    else if (stream.includes('solusdt')) coinId = 'solana';
    else if (stream.includes('bnbusdt')) coinId = 'binancecoin';
    
    if (coinId) {
      previousPrices[coinId] = { ...prices[coinId] };
      prices[coinId].usd = parseFloat(data.c);
      prices[coinId].change = parseFloat(data.P);
      
      updateTickerDOM(coinId);
      checkAlertRules(coinId);
    }
  };
  
  wsConnection.onclose = () => {
    console.log("WebSocket closed. Attempting reconnect in 5s...");
    setTimeout(connectWebSocket, 5000);
  };
  
  wsConnection.onerror = (err) => {
    console.error("WebSocket error: ", err);
    wsConnection.close();
  };
}

// Helper to format currency
function formatCurrency(val, isDoge = false) {
  if (val === 0) return 'Loading...';
  const decimals = isDoge ? 4 : (val < 10 ? 3 : 2);
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Update DOM elements on WebSocket ticks
function updateTickerDOM(coinId) {
  const coin = prices[coinId];
  const prev = previousPrices[coinId];
  
  const priceStr = formatCurrency(coin.usd, coinId === 'dogecoin');
  const changeStr = (coin.change >= 0 ? '+' : '') + coin.change.toFixed(2) + '%';
  
  // Header tape update
  const tapePriceEl = document.getElementById(`tape-${coinId.substring(0, 3)}`);
  const tapePriceDupEl = document.getElementById(`tape-${coinId.substring(0, 3)}-dup`);
  if (tapePriceEl) tapePriceEl.textContent = priceStr;
  if (tapePriceDupEl) tapePriceDupEl.textContent = priceStr;
  
  // Watchlist page update
  const rowPriceEl = document.getElementById(`row-${coinId.substring(0, 3)}`);
  const rowChangeEl = document.getElementById(`change-${coinId.substring(0, 3)}`);
  
  if (rowPriceEl) {
    rowPriceEl.textContent = priceStr;
    
    // Apply flash animations
    if (prev.usd > 0 && coin.usd !== prev.usd) {
      rowPriceEl.classList.remove('flash-up', 'flash-down');
      void rowPriceEl.offsetWidth; // Trigger reflow to restart animation
      if (coin.usd > prev.usd) {
        rowPriceEl.classList.add('flash-up');
      } else {
        rowPriceEl.classList.add('flash-down');
      }
    }
  }
  
  if (rowChangeEl) {
    rowChangeEl.textContent = changeStr;
    if (coin.change >= 0) {
      rowChangeEl.className = 'coin-change gain';
    } else {
      rowChangeEl.className = 'coin-change loss';
    }
  }
  
  // Re-calculate portfolio when price changes
  calculatePortfolioValues();
}

// 3. Portfolio Management Ledger
function loadPortfolio() {
  const saved = localStorage.getItem('apex_portfolio');
  if (saved) {
    portfolio = JSON.parse(saved);
  } else {
    // Inject mock starting positions
    portfolio = [
      { id: Date.now() + 1, symbol: 'BTC', qty: 0.25, avgPrice: 62500 },
      { id: Date.now() + 2, symbol: 'ETH', qty: 1.5, avgPrice: 3100 }
    ];
    savePortfolio();
  }
  renderPortfolio();
}

function savePortfolio() {
  localStorage.setItem('apex_portfolio', JSON.stringify(portfolio));
}

function renderPortfolio() {
  const container = document.getElementById('portfolioItemsContainer');
  container.innerHTML = '';
  
  portfolio.forEach(pos => {
    const itemEl = document.createElement('div');
    itemEl.className = 'portfolio-item';
    itemEl.dataset.id = pos.id;
    
    const currentPrice = getCoinPriceBySymbol(pos.symbol);
    const currentVal = pos.qty * currentPrice;
    const costBasis = pos.qty * pos.avgPrice;
    const pnl = currentPrice > 0 ? (currentVal - costBasis) : 0;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    
    const pnlClass = pnl >= 0 ? 'gain' : 'loss';
    const pnlSign = pnl >= 0 ? '+' : '';
    
    itemEl.innerHTML = `
      <div class="item-info">
        <span style="font-weight: 600;">${pos.symbol}</span>
        <span class="item-qty">${pos.qty} units @ $${pos.avgPrice.toLocaleString()}</span>
      </div>
      <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
        <div>
          <div style="font-weight: 600; font-family:'Fira Code',monospace;">$${currentVal.toLocaleString('en-US', {maximumFractionDigits:2})}</div>
          <div class="item-pnl ${pnlClass}" style="font-size:0.75rem;">
            ${pnlSign}$${pnl.toLocaleString('en-US', {maximumFractionDigits:2})} (${pnlSign}${pnlPct.toFixed(2)}%)
          </div>
        </div>
        <button class="btn-delete" onclick="deletePosition(${pos.id})"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    
    container.appendChild(itemEl);
  });
  
  calculatePortfolioValues();
}

function getCoinPriceBySymbol(symbol) {
  switch (symbol) {
    case 'BTC': return prices.bitcoin.usd;
    case 'ETH': return prices.ethereum.usd;
    case 'DOGE': return prices.dogecoin.usd;
    case 'SOL': return prices.solana.usd;
    default: return 0;
  }
}

function calculatePortfolioValues() {
  let totalValue = 0;
  let totalCost = 0;
  
  portfolio.forEach(pos => {
    const currentPrice = getCoinPriceBySymbol(pos.symbol);
    totalValue += pos.qty * currentPrice;
    totalCost += pos.qty * pos.avgPrice;
  });
  
  const balanceEl = document.getElementById('portfolioBalance');
  const pnlEl = document.getElementById('portfolioPnL');
  
  if (balanceEl) {
    balanceEl.textContent = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  if (pnlEl) {
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const pnlClass = pnl >= 0 ? 'summary-pnl gain' : 'summary-pnl loss';
    const pnlSign = pnl >= 0 ? '+' : '';
    
    pnlEl.className = pnlClass;
    pnlEl.innerHTML = `<span>P&L: ${pnlSign}$${pnl.toLocaleString('en-US', {maximumFractionDigits:2})} (${pnlSign}${pnlPct.toFixed(2)}%)</span>`;
  }
}

window.deletePosition = function(id) {
  portfolio = portfolio.filter(p => p.id !== id);
  savePortfolio();
  renderPortfolio();
};

// 4. Workflow Automations Engine
function loadRules() {
  const saved = localStorage.getItem('apex_rules');
  if (saved) {
    rules = JSON.parse(saved);
  } else {
    rules = [];
  }
}

function saveRules() {
  localStorage.setItem('apex_rules', JSON.stringify(rules));
}

function logRuleConsole(text) {
  const consoleEl = document.getElementById('ruleLogsConsole');
  if (!consoleEl) return;
  
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${time}] ${text}`;
  
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function checkAlertRules(coinId) {
  const coin = prices[coinId];
  const symbol = coin.symbol;
  
  rules.forEach((rule, idx) => {
    if (rule.asset === symbol && !rule.fired) {
      let triggered = false;
      
      if (rule.condition === 'gt' && coin.usd >= rule.targetPrice) {
        triggered = true;
      } else if (rule.condition === 'lt' && coin.usd <= rule.targetPrice) {
        triggered = true;
      }
      
      if (triggered) {
        rule.fired = true;
        saveRules();
        
        let actionMsg = "";
        if (rule.action === 'alert') {
          actionMsg = "Desktop Notification Sent.";
          triggerDesktopNotification(symbol, coin.usd, rule.condition, rule.targetPrice);
        } else if (rule.action === 'webhook') {
          actionMsg = "Webhook dispatched to Endpoint 3Commas/Discord.";
        } else if (rule.action === 'ai') {
          actionMsg = "Sent signal payload to AI Consultant.";
          triggerAIConsultation(symbol, coin.usd);
        }
        
        logRuleConsole(`TRIGGER: ${symbol} price is $${coin.usd.toLocaleString()} (${rule.condition === 'gt' ? '>' : '<'} $${rule.targetPrice.toLocaleString()}). Action: ${actionMsg}`);
      }
    }
  });
}

function triggerDesktopNotification(symbol, price, condition, target) {
  if (Notification.permission === 'granted') {
    new Notification(`ApexOS Alert Fired`, {
      body: `${symbol} reached $${price.toLocaleString()} (${condition === 'gt' ? 'above' : 'below'} $${target})`,
      icon: 'images/logo.png'
    });
  }
}

// 5. Whale Alerts Simulator
function startWhaleAlertSimulator() {
  const addresses = ["0x71C...438f", "Binance Hot Wallet 4", "0x3f5...389c", "Coinbase Custody", "0x981...19a4", "Whale Wallet #9"];
  const transactions = [
    { qty: "500 BTC", usd: 31500000, tag: "alert", text: "transferred from Unknown Wallet to Cold Storage. (Bullish accumulation)" },
    { qty: "8,500 ETH", usd: 25925000, tag: "inflow", text: "transferred from Unknown Wallet to Binance. (Sell pressure warning)" },
    { qty: "4,000,000 DOGE", usd: 560000, tag: "outflow", text: "withdrawn from Robinhood to private custody. (Hold behavior)" },
    { qty: "42,000 SOL", usd: 6132000, tag: "inflow", text: "transferred from Whale Wallet to Coinbase. (Liquidation prep)" },
    { qty: "1,200 BTC", usd: 75600000, tag: "alert", text: "OTC block trade completed on Kraken pools." }
  ];
  
  // Inject starting stream items
  for(let i = 0; i < 4; i++) {
    const randomTx = transactions[Math.floor(Math.random() * transactions.length)];
    const randomAddr = addresses[Math.floor(Math.random() * addresses.length)];
    addWhaleRow(randomTx, randomAddr, true);
  }
  
  // Schedule random transactions
  setInterval(() => {
    const randomTx = transactions[Math.floor(Math.random() * transactions.length)];
    const randomAddr = addresses[Math.floor(Math.random() * addresses.length)];
    addWhaleRow(randomTx, randomAddr, false);
  }, 16000);
}

function addWhaleRow(tx, addr, appendToBottom = false) {
  const container = document.getElementById('whaleAlertStream');
  if (!container) return;
  
  const row = document.createElement('div');
  row.className = 'whale-row';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  row.innerHTML = `
    <span class="whale-time">${time}</span>
    <span class="whale-tag ${tx.tag}">${tx.tag}</span>
    <strong>${tx.qty}</strong> ($${tx.usd.toLocaleString()}) ${tx.text} (Host: ${addr})
  `;
  
  if (appendToBottom) {
    container.appendChild(row);
  } else {
    container.insertBefore(row, container.firstChild);
    
    // Prune entries older than 20
    if (container.children.length > 20) {
      container.removeChild(container.lastChild);
    }
    
    // Pulse animation on arrival
    row.style.boxShadow = '0 0 10px rgba(0, 245, 212, 0.2)';
    setTimeout(() => {
      row.style.boxShadow = 'none';
    }, 1500);
  }
}

// 6. Apex AI Assistant Panel Simulation
function addChatMessage(sender, text) {
  const history = document.getElementById('chatHistory');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  
  // Simple markdown conversion for bullet points
  let formattedText = text;
  if (text.includes('\n*')) {
    formattedText = text.split('\n').map(line => {
      if (line.trim().startsWith('*')) {
        return `<div class="bullet-point">${line.trim().substring(1).trim()}</div>`;
      }
      return `<p style="margin-bottom:8px;">${line}</p>`;
    }).join('');
  } else {
    formattedText = text.replace(/\n/g, '<br/>');
  }
  
  bubble.innerHTML = formattedText;
  history.appendChild(bubble);
  history.scrollTop = history.scrollHeight;
}

function triggerAIConsultation(symbol, price) {
  addChatMessage('ai', `[ALGORITHM SIGNAL ALERT]\n* Initiating deep technical sweep on ${symbol} at $${price.toLocaleString()}.\n* RSI stands at 63.4 (Moderately Bullish).\n* Major order book resistance walls mapped at $${(price * 1.025).toLocaleString()} (+2.5%).\n* Local support zone stabilized at $${(price * 0.975).toLocaleString()} (-2.5%).`);
}

function processAIQuery(query) {
  addChatMessage('user', query);
  
  setTimeout(() => {
    const lower = query.toLowerCase();
    
    if (lower.includes('btc') || lower.includes('bitcoin')) {
      const btcPrice = prices.bitcoin.usd;
      addChatMessage('ai', `**BTC Technical Briefing:**\n* **Current Price:** $${btcPrice.toLocaleString()}\n* **Market Trend:** Bullish consolidation. Accumulation patterns visible around the $${(btcPrice * 0.985).toLocaleString()} mark.\n* **Key Indicators:** 50-day EMA ($${(btcPrice * 0.95).toLocaleString()}) continues to support the structure. Daily RSI is 58.6.\n* **Resistance:** Major resistance sits at $${(btcPrice * 1.05).toLocaleString()}.\n* **Summary:** Strongly supported structure. Buy-the-dip alerts set at $${(btcPrice * 0.97).toLocaleString()}.`);
    } 
    else if (lower.includes('eth') || lower.includes('ethereum')) {
      const ethPrice = prices.ethereum.usd;
      addChatMessage('ai', `**ETH Strength Assessment:**\n* **Current Price:** $${ethPrice.toLocaleString()}\n* **Market Trend:** Sideways consolidation within ascending channel.\n* **Indicators:** MACD shows bullish crossover. RSI is 52.0 (Neutral/Constructive).\n* **Liquidity Zone:** Significant buy orders mapped at $${(ethPrice * 0.98).toLocaleString()}.\n* **Summary:** Higher lows suggest dynamic continuation. Gas fees are low, increasing smart contract volumes.`);
    }
    else if (lower.includes('arbitrage')) {
      const btcPrice = prices.bitcoin.usd;
      const ethPrice = prices.ethereum.usd;
      addChatMessage('ai', `**Cross-Exchange Arbitrage Scan Report:**\n* **BTC/USDT Spread:** Uniswap ($${(btcPrice * 1.0022).toLocaleString()}) vs Binance ($${btcPrice.toLocaleString()}). Net Gap: **+0.22%** (Profit: $${(btcPrice * 0.0022).toFixed(2)} per coin).\n* **ETH/USDT Spread:** Coinbase ($${ethPrice.toLocaleString()}) vs Uniswap ($${(ethPrice * 1.0035).toLocaleString()}). Net Gap: **+0.35%** (Profit: $${(ethPrice * 0.0035).toFixed(2)} per coin).\n* **SOL/USDT Spread:** Raydium ($${(prices.solana.usd * 0.997).toFixed(2)}) vs Binance ($${prices.solana.usd.toFixed(2)}). Net Gap: **+0.30%**.\n* *Note: Spreads calculated include network gas gas estimations.*`);
    }
    else if (lower.includes('sentiment')) {
      addChatMessage('ai', `**Aggregate Sentiment Index (24H):**\n* **Social Media Index:** 68% Bullish (High activity on X/Twitter and Reddit regarding altcoin utility).\n* **News Coverage Sentiment:** Neutral (Macroeconomic inflation reports offsetting protocol development positive news).\n* **Fear & Greed Index:** 62 (Greed) - Down from 67 last week.\n* **Overall Signal:** Constructive Accumulation. Focus on L1 and L2 assets.`);
    }
    else {
      addChatMessage('ai', `I've analyzed your query regarding "${query}". Current live data metrics:\n* Bitcoin is trading at ${formatCurrency(prices.bitcoin.usd)}\n* Ethereum is trading at ${formatCurrency(prices.ethereum.usd)}\n* Solana is trading at ${formatCurrency(prices.solana.usd)}\nLet me know if you would like me to compile a correlation matrix or scan for arbitrage spreads on these assets.`);
    }
  }, 1000);
}

// 7. Command Palette Modal Engine
function toggleCommandPalette(visible) {
  const modal = document.getElementById('cmdModal');
  if (!modal) return;
  
  if (visible) {
    modal.style.display = 'flex';
    document.getElementById('cmdSearchInput').focus();
    document.getElementById('cmdSearchInput').value = '';
    filterCommandOptions('');
  } else {
    modal.style.display = 'none';
  }
}

function filterCommandOptions(filterText) {
  const list = document.getElementById('cmdOptionsList');
  const options = list.getElementsByClassName('cmd-option');
  
  for (let i = 0; i < options.length; i++) {
    const text = options[i].textContent.toLowerCase();
    if (text.includes(filterText.toLowerCase())) {
      options[i].style.display = 'flex';
    } else {
      options[i].style.display = 'none';
    }
  }
}

// 8. Event Listeners Setup
function initEventListeners() {
  // Watchlist Click Listener -> Updates ChartSymbol
  document.getElementById('watchlistContainer').addEventListener('click', (e) => {
    const row = e.target.closest('.coin-row');
    if (!row) return;
    
    // Remove active class
    const rows = document.querySelectorAll('.coin-row');
    rows.forEach(r => r.classList.remove('active'));
    
    // Add active class
    row.classList.add('active');
    
    const symbol = row.dataset.symbol;
    initTradingViewWidget(`BINANCE:${symbol}USDT`);
  });
  
  // Coin Search filter
  document.getElementById('coinSearch').addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('.coin-row');
    rows.forEach(row => {
      const name = row.querySelector('.coin-name span:first-child').textContent.toLowerCase();
      const symbol = row.dataset.symbol.toLowerCase();
      if (name.includes(filter) || symbol.includes(filter)) {
        row.style.display = 'flex';
      } else {
        row.style.display = 'none';
      }
    });
  });
  
  // Portfolio Ledger Form Submit
  document.getElementById('portfolioForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const symbol = document.getElementById('ledgerAsset').value;
    const qty = parseFloat(document.getElementById('ledgerQty').value);
    const price = parseFloat(document.getElementById('ledgerPrice').value);
    
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return;
    
    // Add position
    const position = {
      id: Date.now(),
      symbol,
      qty,
      avgPrice: price
    };
    
    portfolio.push(position);
    savePortfolio();
    renderPortfolio();
    
    // Reset Form
    document.getElementById('ledgerQty').value = '';
    document.getElementById('ledgerPrice').value = '';
    
    logRuleConsole(`Portfolio logged: Add ${qty} ${symbol} at average cost $${price.toLocaleString()}`);
  });
  
  // Alert Rule deploy Button
  document.getElementById('addRuleBtn').addEventListener('click', () => {
    const asset = document.getElementById('ruleAsset').value;
    const condition = document.getElementById('ruleCondition').value;
    const targetPrice = parseFloat(document.getElementById('ruleTarget').value);
    const action = document.getElementById('ruleAction').value;
    
    if (isNaN(targetPrice) || targetPrice <= 0) {
      alert("Please specify a valid numeric target price.");
      return;
    }
    
    // Create rule
    const rule = {
      id: Date.now(),
      asset,
      condition,
      targetPrice,
      action,
      fired: false
    };
    
    rules.push(rule);
    saveRules();
    
    // Reset inputs
    document.getElementById('ruleTarget').value = '';
    
    const condLabel = condition === 'gt' ? 'above' : 'below';
    logRuleConsole(`Rule deployed: Trigger ${action} if ${asset} is ${condLabel} $${targetPrice.toLocaleString()}`);
    
    // Request permission for push notices
    if (action === 'alert' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
  
  // AI assistant interactions
  document.getElementById('sendChatBtn').addEventListener('click', () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    
    processAIQuery(text);
    input.value = '';
  });
  
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = e.target.value.trim();
      if (!text) return;
      
      processAIQuery(text);
      e.target.value = '';
    }
  });
  
  document.querySelector('.preset-prompts').addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    
    const prompt = chip.dataset.prompt;
    processAIQuery(prompt);
  });
  
  // Command palette UI controls
  document.getElementById('cmdTriggerBtn').addEventListener('click', () => {
    toggleCommandPalette(true);
  });
  
  document.getElementById('cmdModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('cmdModal')) {
      toggleCommandPalette(false);
    }
  });
  
  document.getElementById('cmdSearchInput').addEventListener('input', (e) => {
    filterCommandOptions(e.target.value);
  });
  
  // Keyboard palette trigger: Ctrl + K
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleCommandPalette(true);
    }
    if (e.key === 'Escape') {
      toggleCommandPalette(false);
    }
  });
  
  // Command Palette options click handlers
  document.getElementById('cmdOptionsList').addEventListener('click', (e) => {
    const opt = e.target.closest('.cmd-option');
    if (!opt) return;
    
    const action = opt.dataset.action;
    executeCommandPaletteAction(action);
    toggleCommandPalette(false);
  });
}

function executeCommandPaletteAction(action) {
  switch (action) {
    case 'chart-btc':
      // Click row
      document.querySelector('[data-symbol="BTC"]').click();
      logRuleConsole("Command Palette: Selected Bitcoin Asset technical analysis chart.");
      break;
    case 'chart-eth':
      document.querySelector('[data-symbol="ETH"]').click();
      logRuleConsole("Command Palette: Selected Ethereum Asset technical analysis chart.");
      break;
    case 'chart-sol':
      document.querySelector('[data-symbol="SOL"]').click();
      logRuleConsole("Command Palette: Selected Solana Asset technical analysis chart.");
      break;
    case 'ai-sentiment':
      processAIQuery('sentiment check');
      break;
    case 'ai-arbitrage':
      processAIQuery('arbitrage finder');
      break;
    case 'reset-portfolio':
      if (confirm("Are you sure you want to wipe the ledger storage database?")) {
        portfolio = [];
        savePortfolio();
        renderPortfolio();
        logRuleConsole("Command Palette: Portfolio Ledger database reset performed.");
      }
      break;
  }
}
