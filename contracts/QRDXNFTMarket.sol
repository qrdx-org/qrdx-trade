// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// A QRDX native NFT collection as the EVM sees it: an ERC-721 with ERC-2981 royalties
/// (qrdx-node qrdx/contracts/nft_evm.py, docs/NATIVE_TOKENS.md §8).
interface INativeCollection {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function royaltyInfo(uint256 tokenId, uint256 salePrice) external view returns (address, uint256);
}

/**
 * @title QRDX NFT market
 * @notice Fixed-price listings of QRDX's native NFTs, settled in one transaction: the buyer's
 * payment, the royalty and the NFT move together or not at all. Nothing is held in escrow:
 * the seller keeps the NFT until it sells, and lets the market move it (an NFT approval or
 * operator approval, natively with NFT_APPROVE / NFT_SET_APPROVAL_FOR_ALL or in the EVM).
 *
 * Prices are in native QRDX (`currency` = address(0), wei) or in a native token (its address;
 * its base units), paid with the buyer's allowance to this contract. The royalty is what the
 * collection's royaltyInfo asks, capped at the price.
 *
 * Listings live in storage; the events are the market's history, and what indexers read.
 */
contract QRDXNFTMarket {
    struct Listing {
        address seller;
        address currency;
        uint256 price;
    }

    mapping(address => mapping(uint256 => Listing)) public listings;
    uint256 private _lock = 1;

    event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, address currency, uint256 price);
    event Delisted(address indexed collection, uint256 indexed tokenId, address indexed seller);
    event Sold(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        address currency,
        uint256 price,
        address royaltyReceiver,
        uint256 royalty
    );

    error ZeroPrice();
    error NotOwner();
    error NotApproved();
    error NotListed();
    error TermsChanged();
    error WrongPayment();
    error PaymentFailed();
    error Reentrant();

    /// List (or re-price) an NFT you own. The market must be approved to move it.
    function list(address collection, uint256 tokenId, address currency, uint256 price) external {
        if (price == 0) revert ZeroPrice();
        INativeCollection c = INativeCollection(collection);
        if (c.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (!c.isApprovedForAll(msg.sender, address(this)) && c.getApproved(tokenId) != address(this)) revert NotApproved();
        listings[collection][tokenId] = Listing(msg.sender, currency, price);
        emit Listed(collection, tokenId, msg.sender, currency, price);
    }

    /// Withdraw a listing: the seller, or anyone once the seller no longer owns the NFT.
    function delist(address collection, uint256 tokenId) external {
        Listing memory l = listings[collection][tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.seller != msg.sender && INativeCollection(collection).ownerOf(tokenId) == l.seller) revert NotOwner();
        delete listings[collection][tokenId];
        emit Delisted(collection, tokenId, l.seller);
    }

    /// Buy at the listed terms. The buyer names the currency and price it agreed to, so a
    /// re-listing between signing and inclusion cannot charge it more.
    function buy(address collection, uint256 tokenId, address currency, uint256 price) external payable {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        Listing memory l = listings[collection][tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.currency != currency || l.price != price) revert TermsChanged();
        if (currency == address(0) ? msg.value != price : msg.value != 0) revert WrongPayment();
        delete listings[collection][tokenId];

        (address receiver, uint256 royalty) = _royalty(collection, tokenId, price);
        // Reverts unless the seller still owns it and the market may still move it.
        INativeCollection(collection).transferFrom(l.seller, msg.sender, tokenId);
        _pay(currency, receiver, royalty);
        _pay(currency, l.seller, price - royalty);
        emit Sold(collection, tokenId, msg.sender, l.seller, currency, price, receiver, royalty);
        _lock = 1;
    }

    function _royalty(address collection, uint256 tokenId, uint256 price) private view returns (address, uint256) {
        try INativeCollection(collection).royaltyInfo(tokenId, price) returns (address receiver, uint256 amount) {
            if (receiver != address(0) && amount <= price) return (receiver, amount);
        } catch {}
        return (address(0), 0);
    }

    function _pay(address currency, address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        if (currency == address(0)) {
            (ok, ) = to.call{value: amount}("");
        } else {
            bytes memory ret;
            (ok, ret) = currency.call(abi.encodeWithSelector(0x23b872dd, msg.sender, to, amount));
            ok = ok && (ret.length == 0 || abi.decode(ret, (bool)));
        }
        if (!ok) revert PaymentFailed();
    }
}
