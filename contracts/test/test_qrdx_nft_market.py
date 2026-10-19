"""QRDXNFTMarket against the node's EVM: native NFTs (ERC-721 views) sold for QRDX and tokens."""
import json
import os
from decimal import Decimal as D

import pytest
from eth_abi import decode, encode
from eth_utils import keccak

from qrdx.crypto.account_id import to_account_id
from qrdx.exchange import ExchangeOpType as Op
from qrdx.exchange import ExchangeStateManager

# The node's own test chain (a database, the state manager, the executor) and NFT helpers.
from test_evm_world import ALICE, BOB, CAROL, _hex, _token, _balance, chain  # noqa: F401
from test_nfts import ARTIST, _nonces, collection, ok

ARTIFACT = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "lib", "nft-market", "artifact.json")))
QRDX = b"\0" * 20
PRICE = 10 ** 18  # 1 QRDX
pytestmark = pytest.mark.asyncio


def sel(signature: str) -> bytes:
    return keccak(text=signature)[:4]


def call(signature: str, types, *args) -> bytes:
    return sel(signature) + encode(types, list(args))


def error(name: str) -> bytes:
    return sel(name + "()")


def _collection(n=3, owner=ALICE, **extra):
    m = ExchangeStateManager.get_instance()
    m.begin_block(1, 1_700_000_000.0)
    _nonces.clear()
    c = collection(m, **extra)  # 5 % royalty to ARTIST
    for _ in range(n):
        ok(m, ARTIST, Op.NFT_MINT, collection=c, to=_hex(owner), uri="ipfs://x")
    m.commit_block()
    return bytes.fromhex(c[2:])


async def deploy(chain):
    r = await chain.tx(ALICE, None, bytes.fromhex(ARTIFACT["bytecode"][2:]))
    assert r.success, r.error
    return r.created_address, r


async def owner_of(chain, c, i) -> bytes:
    return (await chain.call(c, call("ownerOf(uint256)", ["uint256"], i))).output[12:]


async def listing(chain, market, c, i):
    out = (await chain.call(market, call("listings(address,uint256)", ["address", "uint256"], c, i))).output
    return decode(["address", "address", "uint256"], out)


async def approve_all(chain, who, c, market):
    r = await chain.tx(who, c, call("setApprovalForAll(address,bool)", ["address", "bool"], market, True))
    assert r.success, r.error


async def list_(chain, who, market, c, i, currency=QRDX, price=PRICE):
    return await chain.tx(who, market, call("list(address,uint256,address,uint256)", ["address", "uint256", "address", "uint256"], c, i, currency, price))


async def buy(chain, who, market, c, i, currency=QRDX, price=PRICE, value=None):
    data = call("buy(address,uint256,address,uint256)", ["address", "uint256", "address", "uint256"], c, i, currency, price)
    return await chain.tx(who, market, data, value=PRICE if value is None and currency == QRDX else (value or 0))


def reverted_with(r, name: str) -> bool:
    return not r.success and (r.output or b"")[:4] == error(name)


async def test_deploys_inside_a_block(chain):
    _, r = await deploy(chain)
    assert r.gas_used < 1_000_000  # BLOCK_GAS_LIMIT (docs/BLOCK_LIMITS.md)


async def test_a_listing_sells_for_qrdx_with_the_royalty(chain):
    c = _collection()
    market, _ = await deploy(chain)
    await chain.fund(BOB, 5 * PRICE)
    assert reverted_with(await list_(chain, ALICE, market, c, 1), "NotApproved")
    await approve_all(chain, ALICE, c, market)
    assert reverted_with(await list_(chain, BOB, market, c, 1), "NotOwner")
    r = await list_(chain, ALICE, market, c, 1)
    assert r.success, r.error
    assert await listing(chain, market, c, 1) == ("0x" + ALICE.hex(), "0x" + QRDX.hex(), PRICE)

    alice_before = await chain.sm.get_balance(_hex(ALICE))
    artist = to_account_id(ARTIST)
    artist_before = await chain.sm.get_balance(artist)
    r = await buy(chain, BOB, market, c, 1)
    assert r.success, r.error
    assert await owner_of(chain, c, 1) == BOB
    assert await chain.sm.get_balance(artist) - artist_before == PRICE * 5 // 100
    assert await chain.sm.get_balance(_hex(ALICE)) - alice_before == PRICE * 95 // 100
    assert (await listing(chain, market, c, 1))[0] == "0x" + "00" * 20
    # the NFT registry the exchange reads agrees
    assert ExchangeStateManager.get_instance().nfts.find(_hex(c), 1).owner.lower() == _hex(BOB)
    sold = [log for log in r.logs if log[0] == market]
    assert sold and sold[-1][1][0] == int.from_bytes(keccak(text="Sold(address,uint256,address,address,address,uint256,address,uint256)"), "big")


async def test_the_buyer_pays_exactly_the_terms_it_named(chain):
    c = _collection()
    market, _ = await deploy(chain)
    await chain.fund(BOB, 5 * PRICE)
    await approve_all(chain, ALICE, c, market)
    assert (await list_(chain, ALICE, market, c, 2)).success
    assert reverted_with(await buy(chain, BOB, market, c, 2, price=PRICE // 2, value=PRICE // 2), "TermsChanged")
    assert reverted_with(await buy(chain, BOB, market, c, 2, value=PRICE - 1), "WrongPayment")
    assert reverted_with(await buy(chain, BOB, market, c, 3), "NotListed")
    assert await owner_of(chain, c, 2) == ALICE


async def test_a_stale_listing_cannot_sell_and_anyone_can_clear_it(chain):
    c = _collection()
    market, _ = await deploy(chain)
    await chain.fund(BOB, 5 * PRICE)
    await approve_all(chain, ALICE, c, market)
    assert (await list_(chain, ALICE, market, c, 1)).success
    # Alice gives the NFT away; the listing is left behind
    r = await chain.tx(ALICE, c, call("transferFrom(address,address,uint256)", ["address", "address", "uint256"], ALICE, CAROL, 1))
    assert r.success, r.error
    assert not (await buy(chain, BOB, market, c, 1)).success
    assert await owner_of(chain, c, 1) == CAROL
    r = await chain.tx(BOB, market, call("delist(address,uint256)", ["address", "uint256"], c, 1))
    assert r.success, r.error
    assert (await listing(chain, market, c, 1))[0] == "0x" + "00" * 20


async def test_only_the_seller_delists_a_live_listing(chain):
    c = _collection()
    market, _ = await deploy(chain)
    await approve_all(chain, ALICE, c, market)
    assert (await list_(chain, ALICE, market, c, 1)).success
    assert reverted_with(await chain.tx(BOB, market, call("delist(address,uint256)", ["address", "uint256"], c, 1)), "NotOwner")
    assert (await chain.tx(ALICE, market, call("delist(address,uint256)", ["address", "uint256"], c, 1))).success


async def test_a_listing_sells_for_a_native_token(chain):
    c = _collection()
    market, _ = await deploy(chain)
    token, _ = await _token(chain, BOB, supply="1000")  # 6 decimals
    await chain.fund(BOB, PRICE)  # gas money, and QRDX it must not send along
    await approve_all(chain, ALICE, c, market)
    price = 200 * 10 ** 6
    assert (await list_(chain, ALICE, market, c, 1, currency=token, price=price)).success
    assert reverted_with(await buy(chain, BOB, market, c, 1, currency=token, price=price), "PaymentFailed")  # no allowance yet
    r = await chain.tx(BOB, token, call("approve(address,uint256)", ["address", "uint256"], market, price))
    assert r.success, r.error
    assert reverted_with(await buy(chain, BOB, market, c, 1, currency=token, price=price, value=1), "WrongPayment")
    r = await buy(chain, BOB, market, c, 1, currency=token, price=price)
    assert r.success, r.error
    assert await owner_of(chain, c, 1) == BOB
    assert await _balance(chain, token, ALICE) == D(190)
    assert await chain.db.get_token_balance(_hex(token), to_account_id(ARTIST)) == D(10)
    assert await _balance(chain, token, BOB) == D(800)


async def test_a_single_nft_approval_is_enough(chain):
    c = _collection()
    market, _ = await deploy(chain)
    await chain.fund(BOB, 5 * PRICE)
    r = await chain.tx(ALICE, c, call("approve(address,uint256)", ["address", "uint256"], market, 3))
    assert r.success, r.error
    assert (await list_(chain, ALICE, market, c, 3)).success
    assert (await buy(chain, BOB, market, c, 3)).success
    assert await owner_of(chain, c, 3) == BOB


async def test_a_soulbound_collection_cannot_be_sold(chain):
    c = _collection(n=1, non_transferable=True)
    market, _ = await deploy(chain)
    await chain.fund(BOB, 5 * PRICE)
    await approve_all(chain, ALICE, c, market)
    await list_(chain, ALICE, market, c, 1)
    assert not (await buy(chain, BOB, market, c, 1)).success
    assert await owner_of(chain, c, 1) == ALICE


async def test_a_post_quantum_owner_approves_natively_and_sells(chain):
    """The site's path: a 0xPQ account owns the NFT, approves the market with the native
    NFT_SET_APPROVAL_FOR_ALL, and lists from its EVM identity (its account id), as a type-0x51
    transaction does."""
    seller_pq = "0xPQ" + "f" * 64
    seller = bytes.fromhex(to_account_id(seller_pq)[2:])
    m = ExchangeStateManager.get_instance()
    m.begin_block(1, 1_700_000_000.0)
    _nonces.clear()
    c = collection(m)
    ok(m, ARTIST, Op.NFT_MINT, collection=c, to=seller_pq, uri="ipfs://pq")
    m.commit_block()
    market, _ = await deploy(chain)
    m.begin_block(2, 1_700_000_001.0)
    ok(m, seller_pq, Op.NFT_SET_APPROVAL_FOR_ALL, collection=c, operator=_hex(market), approved=True)
    m.commit_block()
    coll = bytes.fromhex(c[2:])
    await chain.fund(seller, PRICE)
    await chain.fund(BOB, 5 * PRICE)
    r = await list_(chain, seller, market, coll, 1)
    assert r.success, r.error
    r = await buy(chain, BOB, market, coll, 1)
    assert r.success, r.error
    assert await owner_of(chain, coll, 1) == BOB
