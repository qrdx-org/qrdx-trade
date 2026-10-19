"""
Runs QRDXNFTMarket on qrdx-node's own EVM, NFT registry and token ledger (imported read-only).

  PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider contracts/test

Needs the node's Python requirements and its py-evm fork (the `py-evm` submodule) installed;
liboqs is replaced by dilithium-py, as in scripts/local-node. QRDX_NODE_DIR points at the
node checkout (default ../qrdx-node). PYTHONDONTWRITEBYTECODE keeps Python from writing
__pycache__ into the node.
"""
import os
import sys
import types

from dilithium_py.ml_dsa import ML_DSA_65


class _Signature:
    def __init__(self, alg=None, secret_key=None):
        self.sk, self.pk = secret_key, None

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


class _KEM:
    def __init__(self, *a, **k):
        pass


_oqs = types.ModuleType("oqs")
_oqs.Signature = _Signature
_oqs.KeyEncapsulation = _KEM
_oqs.get_enabled_sig_mechanisms = lambda: ["ML-DSA-65", "Dilithium3"]
_oqs.get_enabled_kem_mechanisms = lambda: ["ML-KEM-768", "Kyber768"]
sys.modules["oqs"] = _oqs

NODE = os.environ.get("QRDX_NODE_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "qrdx-node"))
sys.path.insert(0, os.path.abspath(NODE))
sys.path.insert(0, os.path.abspath(os.path.join(NODE, "tests")))
