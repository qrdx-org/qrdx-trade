"""
Local QRDX exchange node for testing qrdx-trade and qrdx-wallet end to end.

Runs the REAL exchange engine from qrdx-node (imported read-only; nothing is
written there) behind the subset of the node's JSON-RPC / REST surface the
trade site and the wallet use. Differences from a real node:

  * blocks are produced by a timer (BLOCK_SECONDS) instead of consensus;
  * token / QRDX balances live in a dict instead of the database;
  * liboqs is replaced by dilithium-py (pure-Python FIPS 204 ML-DSA-65), so
    the node's own verify path checks the wallet's real signatures;
  * perp oracle prices are set by the harness instead of validator votes.

Seeds wQRDX, qBTC, qUSDC, qETH and an unverified PEPE with pools, resting
orders, a day of swap history, and a BTC-USD perp market.

  python node_harness.py            # port 3007, 20 s blocks
  POST /faucet {"address": "0xPQ…"} # fund an address with every seeded token

Setup (outside qrdx-node, which stays untouched):

  python3 -m venv .venv && .venv/bin/pip install -r scripts/local-node/requirements.txt
  PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/local-node/node_harness.py

PYTHONDONTWRITEBYTECODE keeps Python from writing __pycache__ into qrdx-node.
QRDX_NODE_DIR points at the node checkout (default: ../qrdx-node next to this repo).
"""
import json
import os
import sys
import threading
import time
import types
import random
from decimal import Decimal as D
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── liboqs stand-in ───────────────────────────────────────────────────────────
from dilithium_py.ml_dsa import ML_DSA_65


class _Signature:
    def __init__(self, alg, secret_key=None):
        self.sk = secret_key
        self.pk = None

    def generate_keypair(self):
        self.pk, self.sk = ML_DSA_65.keygen()
        return self.pk

    def export_secret_key(self):
        return self.sk

    def sign(self, message):
        return ML_DSA_65.sign(self.sk, message)

    def verify(self, message, signature, public_key):
        return ML_DSA_65.verify(public_key, message, signature)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _KEM:  # the node's PQ package also loads Kyber; key exchange is unused here
    def __init__(self, alg, secret_key=None):
        pass


_oqs = types.ModuleType("oqs")
_oqs.Signature = _Signature
_oqs.KeyEncapsulation = _KEM
sys.modules["oqs"] = _oqs

os.environ.setdefault("QRDX_PERP_COLLATERAL_TOKEN", "QRDX")
sys.path.insert(0, os.environ.get(
    "QRDX_NODE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "qrdx-node")))

from qrdx.exchange import ExchangeOpType, ExchangeStateManager, ExchangeTransaction, views  # noqa: E402
from qrdx.exchange.mempool import ExchangeMempool  # noqa: E402
from qrdx.exchange import submission  # noqa: E402
from qrdx.crypto.account_id import to_account_id  # noqa: E402


def acct(address):
    """Native QRDX is keyed by account id, as on the node: eth_getBalance reads a 0xPQ
    account under its 20-byte id, and every address form of one account is one balance."""
    try:
        return to_account_id(str(address)).lower()
    except Exception:
        return str(address).lower()

PORT = int(os.environ.get("PORT", "3007"))
CHAIN_ID = int(os.environ.get("CHAIN_ID", "9999"))
BLOCK_SECONDS = float(os.environ.get("BLOCK_SECONDS", "20"))
BTC_USD = D(os.environ.get("BTC_USD", "85000"))
ETH_USD = D(os.environ.get("ETH_USD", "2700"))
QRDX_USD = D(os.environ.get("QRDX_USD", "0.85"))

FOUNDATION = "0xPQ" + "f0" * 32
MAKERS = ["0xPQ" + c * 64 for c in "abc"]
TAKERS = ["0xPQ" + c * 64 for c in "de"]

lock = threading.RLock()
mgr = ExchangeStateManager.get_instance()
mgr.enforce_spot_settlement = True
mgr.enforce_orderbook_settlement = True
mgr.enforce_pool_stake = True  # CREATE_POOL really costs QRDX
mempool = ExchangeMempool(nonce_provider=lambda a: mgr.get_nonce(a))

balances = {}        # (holder_lower, token_lower) -> Decimal
holder_case = {}     # holder_lower -> holder as the engine writes it
qrdx = {}            # holder_lower -> native QRDX
blocks = []          # {"block": {...}}
height = 0
nonces = {}
TOKENS = {}          # symbol -> address


def bal(holder, token):
    return balances.get((holder.lower(), token.lower()), D(0))


def credit(holder, token, amount):
    k = (holder.lower(), token.lower())
    holder_case.setdefault(holder.lower(), holder)
    balances[k] = balances.get(k, D(0)) + D(amount)


def begin(ts, senders=()):
    global height
    height += 1
    mgr.begin_block(height, ts)
    mgr.clear_available_token_balances()
    every = set(holder_case.values()) | set(senders)
    toks = {t for (_, t) in balances} | {t.lower() for t in TOKENS.values()}
    for h in every:
        mgr.set_available_balance(h, qrdx.get(acct(h), D(0)))
        for t in toks:
            mgr.set_available_token_balance(h, t, bal(h, t))
    # Synthetic holders (pool reserves, book escrow) the engine pays out of.
    for p in mgr.pool_manager.get_all_pools():
        hold = mgr.pool_holder_address(p.state.id)
        esc = mgr.orderbook_escrow_address(f"{p.state.token0}:{p.state.token1}")
        for h in (hold, esc):
            holder_case.setdefault(h.lower(), h)
            for t in (p.state.token0, p.state.token1):
                mgr.set_available_token_balance(h, t, bal(h, t))
    # Perp oracle, as validators would vote it.
    for m in mgr.clearinghouse.markets.values():
        px = {"BTC": BTC_USD, "ETH": ETH_USD}.get(m.base)
        if px is not None:
            drift = D(str(round(random.uniform(-0.002, 0.002), 6)))
            m.oracle_price = (px * (1 + drift)).quantize(D("0.01"))
            m.oracle_time = D(str(ts))
            if not m.mark_price:
                m.mark_price = m.oracle_price


def end(ts, txs):
    mgr.finalize_block()
    mgr.commit_block()
    for (h, t), d in mgr.token_balance_deltas().items():
        credit(h, t, d)
    for h, d in mgr.balance_deltas().items():  # native QRDX: pool stakes, perps collateral
        qrdx[acct(h)] = qrdx.get(acct(h), D(0)) + d
    blocks.append({"block": {
        "block_height": height, "id": height, "timestamp": ts,
        "hash": f"{height:064x}",
        "exchange_transactions": [tx.to_dict() for tx in txs],
    }})


def run(sender, op, params, ts=None):
    """Execute one operation in its own block (seeding)."""
    n = nonces.get(sender, mgr.get_nonce(sender))
    nonces[sender] = n + 1
    tx = ExchangeTransaction(op_type=op, sender=sender, nonce=n, params=params,
                             gas_limit=10_000_000, gas_price=10 ** 9)
    ts = ts or time.time()
    begin(ts, [sender])
    r = mgr.process_transaction(tx)
    end(ts, [tx])
    if not r.success:
        raise RuntimeError(f"{op.name} {params}: {r.error}")
    return r.data


def produce_block():
    with lock:
        txs = mempool.select_for_block(256)
        ts = time.time()
        begin(ts, [t.sender for t in txs])
        done = []
        for tx in txs:
            r = mgr.process_transaction(tx)
            done.append(tx)
            print(f"[block {height}] {tx.op_type.name} {tx.sender[:12]}… {'ok' if r.success else 'FAILED: ' + r.error}",
                  flush=True)
        end(ts, done)
        mempool.remove([t.tx_hash() for t in done])
        mempool.prune_stale()


# ── seed ──────────────────────────────────────────────────────────────────────

def seed():
    start = time.time() - 26 * 3600
    for who in [FOUNDATION] + MAKERS + TAKERS:
        qrdx[acct(who)] = D(10_000_000)
        holder_case[who.lower()] = who
    for sym, name, dec_, supply in [("wQRDX", "Wrapped QRDX", 18, "1000000000"),
                                    ("qBTC", "Quantum Bitcoin", 8, "21000"),
                                    ("qUSDC", "Quantum USD Coin", 6, "2000000000"),
                                    ("qETH", "Quantum Ether", 18, "1000000")]:
        d = run(FOUNDATION, ExchangeOpType.TOKEN_DEPLOY,
                {"name": name, "symbol": sym, "decimals": dec_, "initial_supply": supply}, start)
        TOKENS[sym] = d["token_address"]
    pepe_owner = MAKERS[2]
    d = run(pepe_owner, ExchangeOpType.TOKEN_DEPLOY,
            {"name": "Pepe", "symbol": "PEPE", "decimals": 18, "initial_supply": "1000000000000000"}, start)
    TOKENS["PEPE"] = d["token_address"]
    # spread the foundation's supply to market makers and takers
    for who in MAKERS + TAKERS:
        for sym, amt in [("wQRDX", "50000000"), ("qBTC", "1000"), ("qUSDC", "100000000"), ("qETH", "20000")]:
            run(FOUNDATION, ExchangeOpType.TOKEN_TRANSFER,
                {"token_address": TOKENS[sym], "to": who, "amount": amt}, start)
        run(pepe_owner, ExchangeOpType.TOKEN_TRANSFER,
            {"token_address": TOKENS["PEPE"], "to": who, "amount": "100000000000000"}, start)

    usd = {"wQRDX": QRDX_USD, "qBTC": BTC_USD, "qUSDC": D(1), "qETH": ETH_USD, "PEPE": D("0.0000071")}
    pairs = [("qBTC", "qUSDC", 3000, "40000000"), ("wQRDX", "qUSDC", 3000, "60000000"),
             ("wQRDX", "qBTC", 3000, "200000"), ("qETH", "qUSDC", 500, "30000000"),
             ("PEPE", "qUSDC", 10000, "20000000")]
    pool_ids = {}
    for a, b, tier, usd_depth in pairs:
        ta, tb = TOKENS[a], TOKENS[b]
        t0, t1 = (ta, tb) if ta < tb else (tb, ta)
        s0, s1 = (a, b) if t0 == ta else (b, a)
        price = (usd[s0] / usd[s1])  # token1 per token0
        d = run(MAKERS[0], ExchangeOpType.CREATE_POOL, {
            "token0": t0, "token1": t1, "fee_tier": tier, "pool_type": "STANDARD",
            "initial_price": str(price.normalize()), "stake_amount": "10000"}, start)
        pid = d["pool_id"]
        pool_ids[(a, b)] = pid
        spacing = mgr.pool_manager.get_pool(pid).state.fee_tier.tick_spacing
        tick = mgr.pool_manager.get_pool(pid).state.tick
        lo = (tick - 4000) // spacing * spacing
        hi = (tick + 4000) // spacing * spacing
        amt0 = (D(usd_depth) / 2 / usd[s0]).quantize(D("1e-8"))
        amt1 = (D(usd_depth) / 2 / usd[s1]).quantize(D("1e-8"))
        q = views.liquidity_quote(mgr, pid, lo, hi, None, str(amt0), str(amt1))
        run(MAKERS[0], ExchangeOpType.ADD_LIQUIDITY,
            {"pool_id": pid, "tick_lower": lo, "tick_upper": hi, "amount": q["liquidity"]}, start)

    # a day of swaps: ~one every 20 minutes, random walk around the seed price
    rng = random.Random(42)
    t = start + 600
    while t < time.time() - 300:
        a, b = rng.choice(list(pool_ids))
        who = rng.choice(TAKERS)
        sell = rng.random() < 0.5
        tin, tout = (a, b) if sell else (b, a)
        notional = D(rng.randint(200, 20000))
        amt = (notional / usd[tin]).quantize(D("1e-6"))
        try:
            run(who, ExchangeOpType.SWAP, {"token_in": TOKENS[tin], "token_out": TOKENS[tout],
                                           "amount_in": str(amt), "venue": "amm"}, t)
        except RuntimeError as e:
            print("seed swap skipped:", e)
        t += rng.randint(600, 1800)

    # resting orders around the pools' prices on every book
    for (a, b), pid in pool_ids.items():
        st = mgr.pool_manager.get_pool(pid).state
        pair = f"{st.token0}:{st.token1}"
        mid = st.price
        sym0 = a if TOKENS[a] == st.token0 else b
        unit = (D(2000) / usd[sym0])
        for i, maker in enumerate(MAKERS):
            for k in range(1, 6):
                off = D("0.0008") * k + D("0.0002") * i
                size = (unit * D(k)).quantize(D("1e-6"))
                for side, px in (("buy", mid * (1 - off)), ("sell", mid * (1 + off))):
                    run(maker, ExchangeOpType.PLACE_ORDER, {
                        "pair": pair, "side": side, "order_type": "limit",
                        "price": str(px.quantize(D("1e-10")).normalize()), "amount": str(size)})

    # perps: a BTC market with a two-sided book
    run(FOUNDATION, ExchangeOpType.CREATE_MARKET, {"base_token": "BTC", "max_leverage": "20"})
    for i, maker in enumerate(MAKERS):
        run(maker, ExchangeOpType.PERP_DEPOSIT, {"amount": "2000000"})
        for k in range(1, 6):
            off = D("0.0005") * k + D("0.0001") * i
            for side, px in (("buy", BTC_USD * (1 - off)), ("sell", BTC_USD * (1 + off))):
                run(maker, ExchangeOpType.PERP_ORDER, {
                    "market_id": "BTC-USD-PERP", "side": side, "size": str(D("0.05") * k),
                    "price": str(px.quantize(D("0.5")))})
    for who in TAKERS:
        run(who, ExchangeOpType.PERP_DEPOSIT, {"amount": "1000000"})
        run(who, ExchangeOpType.PERP_ORDER, {"market_id": "BTC-USD-PERP", "side": "buy",
                                              "size": "0.1", "price": str(BTC_USD * D("1.01")), "tif": "ioc"})
    print("seeded:", json.dumps(TOKENS, indent=1), flush=True)


# ── JSON-RPC ─────────────────────────────────────────────────────────────────

class RpcError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def need(found, what):
    if found is None:
        raise RpcError(-32001, f"{what} not found")
    return found


def token_summary(t):
    return views.token(mgr, t)


METHODS = {
    "eth_chainId": lambda: hex(CHAIN_ID),
    "net_version": lambda: str(CHAIN_ID),
    "eth_blockNumber": lambda: hex(height),
    "eth_gasPrice": lambda: hex(10 ** 9),
    "eth_getBalance": lambda addr, *_: hex(int(qrdx.get(acct(addr), D(0)) * 10 ** 18)),
    "eth_getTransactionCount": lambda *_: "0x0",
    "eth_feeHistory": lambda *_: {"oldestBlock": hex(height), "baseFeePerGas": [hex(10 ** 9)] * 2,
                                  "gasUsedRatio": [0.0], "reward": [["0x0"]]},
    "eth_getLogs": lambda *_: [],
    "exchange_gasPrice": lambda: 10 ** 9,
    "exchange_getNonce": lambda addr: mgr.get_nonce(views.account_key(mgr.clearinghouse, addr) or addr),
    "exchange_getTokenBalance": lambda token, addr: str(bal(addr, token)),
    "exchange_getTokenAccount": lambda token, addr: {"token_address": token, "address": addr,
                                                     "balance": str(bal(addr, token)), "frozen": False},
    "exchange_getTokens": lambda: views.tokens(mgr),
    "exchange_getToken": lambda t: need(views.token(mgr, t), f"token {t}"),
    "exchange_getAllowance": lambda t, o, s: views.token_allowance(mgr, t, o, s),
    "exchange_getStateRoot": lambda: {"exchange_state_root": mgr.compute_state_root(), "block_height": height},
    "exchange_getPools": lambda a=None, b=None: views.pools(mgr, a, b),
    "exchange_getPool": lambda pid, w=None: need(views.pool(mgr, pid, w), f"pool {pid}"),
    "exchange_quoteLiquidity": lambda pid, lo, hi, L=None, a0=None, a1=None:
        need(views.liquidity_quote(mgr, pid, lo, hi, L, a0, a1), f"pool {pid}"),
    "exchange_getPositions": lambda addr: views.positions(mgr, addr),
    "exchange_quoteSwap": lambda ti, to, amt, sender="", pid=None, venue="auto":
        need(views.quote(mgr, ti, to, amt, sender, pid, venue), "liquidity for this swap"),
    "exchange_getOrderBook": lambda pair, depth=20: need(views.spot_order_book(mgr, pair, depth), f"book {pair}"),
    "exchange_getOpenOrders": lambda addr: views.spot_open_orders(mgr, addr),
    "exchange_getTransactionReceipt": lambda h: views.receipt(mgr, h),
    "exchange_getSigningPayload": lambda tx: submission.signing_payload(tx),
    "perp_getMarkets": lambda: views.markets(mgr),
    "perp_getMarket": lambda mid: need(views.market(mgr, mid), f"market {mid}"),
    "perp_getOrderBook": lambda mid, depth=20: need(views.order_book(mgr, mid, depth), f"market {mid}"),
    "perp_getAccount": lambda addr: views.account(mgr, addr),
    "perp_getOpenOrders": lambda addr: views.open_orders(mgr, addr),
    "perp_getVault": lambda: views.vault(mgr),
    "perp_getTrades": lambda mid, limit=50: views.trades(mgr, mid, limit),
    "perp_getEvents": lambda market_id=None, address=None, types=None, since=None, limit=100:
        views.events(mgr, market=market_id, address=address, types=types, since=since, limit=limit),
}


def send_transaction(tx, propagated=False):
    data = json.loads(tx) if isinstance(tx, str) else tx
    try:
        etx = ExchangeTransaction.from_dict(data)
    except Exception as e:
        raise RpcError(-32003, f"malformed exchange tx: {e}")
    ok, err = mempool.admit(etx)
    if not ok:
        print(f"[mempool] rejected {etx.op_type.name} from {etx.sender[:12]}…: {err}", flush=True)
        raise RpcError(-32003, err)
    print(f"[mempool] admitted {etx.op_type.name} nonce {etx.nonce} from {etx.sender[:12]}…", flush=True)
    return etx.tx_hash()


METHODS["exchange_sendTransaction"] = send_transaction


def faucet(address):
    with lock:
        holder_case.setdefault(address.lower(), address)
        qrdx[acct(address)] = qrdx.get(acct(address), D(0)) + D(100_000)
        for sym, amt in [("wQRDX", "250000"), ("qBTC", "5"), ("qUSDC", "1000000"), ("qETH", "100"),
                         ("PEPE", "1000000000")]:
            credit(address, TOKENS[sym], amt)
    return {"funded": address}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body):
        raw = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        with lock:
            if u.path == "/get_status":
                return self._send(200, {"ok": True, "result": {"height": height, "last_block_hash": f"{height:064x}"}})
            if u.path == "/get_blocks":
                start, limit = int(q.get("offset", 0)), min(512, int(q.get("limit", 100)))
                out = [b for b in blocks if b["block"]["block_height"] >= start][:limit]
                return self._send(200, {"ok": True, "result": out})
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/faucet":
            return self._send(200, {"ok": True, "result": faucet(body["address"])})
        if self.path not in ("/rpc", "/"):
            return self._send(404, {"ok": False, "error": "not found"})
        batch = body if isinstance(body, list) else [body]
        out = []
        for req in batch:
            rid, method, params = req.get("id"), req.get("method"), req.get("params") or []
            try:
                fn = METHODS.get(method)
                if fn is None:
                    raise RpcError(-32601, f"method {method} not found")
                with lock:
                    result = fn(*params) if isinstance(params, list) else fn(**params)
                out.append({"jsonrpc": "2.0", "id": rid, "result": json.loads(json.dumps(result, default=str))})
            except RpcError as e:
                out.append({"jsonrpc": "2.0", "id": rid, "error": {"code": e.code, "message": str(e)}})
            except (ValueError, ArithmeticError, TypeError) as e:
                out.append({"jsonrpc": "2.0", "id": rid, "error": {"code": -32602, "message": str(e)}})
        self._send(200, out if isinstance(body, list) else out[0])


def block_loop():
    while True:
        time.sleep(BLOCK_SECONDS)
        try:
            produce_block()
        except Exception as e:  # keep producing
            print("block error:", e, flush=True)


if __name__ == "__main__":
    seed()
    threading.Thread(target=block_loop, daemon=True).start()
    print(f"QRDX harness on :{PORT} (chain {CHAIN_ID}, {BLOCK_SECONDS}s blocks, height {height})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
