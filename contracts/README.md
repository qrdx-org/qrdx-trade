# Contracts

`QRDXNFTMarket.sol` — fixed-price listings of QRDX's native NFTs, settled in one transaction. Each native
collection is an ERC-721 inside the EVM (qrdx-node `qrdx/contracts/nft_evm.py`) and each native token an
ERC-20, so the contract can move the NFT, the payment and the ERC-2981 royalty together. It has no owner,
no fees and no settings.

```bash
pnpm nft-market:compile          # → lib/nft-market/artifact.json (solc 0.8.28, Shanghai, optimizer 200)

# Tests on the node's own EVM, NFT registry and token ledger (qrdx-node imported read-only):
PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider -o asyncio_mode=auto contracts/test
```

The tests need qrdx-node's Python requirements and its `py-evm` fork installed; liboqs is replaced by
dilithium-py (see `contracts/test/conftest.py`). Deployment uses about 700,000 gas, inside a block's
1,000,000.
