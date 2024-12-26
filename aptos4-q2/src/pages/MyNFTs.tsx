import React, { useEffect, useState, useCallback } from "react";
import { Typography, Card, Row, Col, Pagination, message, Button, Input, Modal, Tag } from "antd";
import { AptosClient } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Title } = Typography;
const { Meta } = Card;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");


const calculateRemainingHours = (endTime: number): number => {
  // Convert the blockchain timestamp to the correct format
  const currentTime = Math.floor(Date.now() / 1000);
  const remainingSeconds = endTime - currentTime;
  return Math.max(0, Math.ceil(remainingSeconds / 3600));
};


type NFT = {
  id: number;
  name: string;
  description: string;
  uri: string;
  rarity: number;
  price: number;
  for_sale: boolean;
  is_rented: boolean;
  rent_price_per_hour: number;
  rent_end_time: number;
  renter: string;
  owner: string;
};

const MyNFTs: React.FC = () => {
  const pageSize = 8;
  const [currentPage, setCurrentPage] = useState(1);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [totalNFTs, setTotalNFTs] = useState(0);
  const { account, signAndSubmitTransaction } = useWallet();
  const marketplaceAddr = "nft-address";

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [salePrice, setSalePrice] = useState<string>("");

  const [isRentModalVisible, setIsRentModalVisible] = useState(false);
  const [rentPrice, setRentPrice] = useState<string>("");

  const [isTransferModalVisible, setIsTransferModalVisible] = useState(false);
  const [recipient, setRecipient] = useState("");

  const fetchUserNFTs = useCallback(async () => {
    if (!account) return;

    try {
        console.log("Fetching NFT IDs for owner:", account.address);

        const nftIdsResponse = await client.view({
            function: `${marketplaceAddr}::NFTMarketplace::get_all_nfts_for_owner`,
            arguments: [marketplaceAddr, account.address, "100", "0"],
            type_arguments: [],
        });

        let allNftIds = Array.isArray(nftIdsResponse[0]) ? nftIdsResponse[0] : nftIdsResponse;

        try {
            const rentedNftsResponse = await client.view({
                function: `${marketplaceAddr}::NFTMarketplace::get_rented_nfts`,
                arguments: [marketplaceAddr, account.address],
                type_arguments: [],
            });

            const rentedIds = Array.isArray(rentedNftsResponse[0]) ? rentedNftsResponse[0] : rentedNftsResponse;
            allNftIds = [...allNftIds, ...rentedIds];
        } catch (error) {
            console.log("No rented NFTs found or function not available");
        }

        setTotalNFTs(allNftIds.length);

        if (allNftIds.length === 0) {
            setNfts([]);
            return;
        }

        const userNFTs = (await Promise.all(
            allNftIds.map(async (id) => {
                try {
                    const nftDetails = await client.view({
                        function: `${marketplaceAddr}::NFTMarketplace::get_nft_details`,
                        arguments: [marketplaceAddr, id],
                        type_arguments: [],
                    });

                    const rentalDetails = await client.view({
                        function: `${marketplaceAddr}::NFTMarketplace::get_rental_details`,
                        arguments: [marketplaceAddr, id],
                        type_arguments: [],
                    });

                    const [nftId, owner, name, description, uri, price, forSale, rarity] = nftDetails;
                    const [isRented, renter, rentEndTime, rentPricePerHour] = rentalDetails;

                    const hexToUint8Array = (hexString: string): Uint8Array => {
                        const bytes = new Uint8Array(hexString.length / 2);
                        for (let i = 0; i < hexString.length; i += 2) {
                            bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
                        }
                        return bytes;
                    };

                    const nft: NFT = {
                        id: Number(nftId),
                        owner: owner.toString(),
                        name: new TextDecoder().decode(hexToUint8Array(name.toString().slice(2))),
                        description: new TextDecoder().decode(hexToUint8Array(description.toString().slice(2))),
                        uri: new TextDecoder().decode(hexToUint8Array(uri.toString().slice(2))),
                        rarity: Number(rarity),
                        price: Number(price) / 100000000,
                        for_sale: Boolean(forSale),
                        is_rented: Boolean(isRented),
                        rent_price_per_hour: Number(rentPricePerHour) / 100000000,
                        rent_end_time: Number(rentEndTime),
                        renter: renter.toString()
                    };

                    return nft;
                } catch (error) {
                    console.error(`Error fetching details for NFT ID ${id}:`, error);
                    return null;
                }
            })
        )).filter((nft): nft is NFT => nft !== null);

        console.log("User NFTs:", userNFTs);
        setNfts(userNFTs);
    } catch (error) {
        console.error("Error fetching NFTs:", error);
        message.error("Failed to fetch your NFTs.");
    }
}, [account, marketplaceAddr]);

  const handleTransferClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsTransferModalVisible(true);
  };

  const handleTransfer = async () => {
    if (!selectedNft) return;

    try {
      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::transfer_nft`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), recipient],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(entryFunctionPayload);
      await client.waitForTransaction(response.hash);

      message.success("NFT transferred successfully!");
      setIsTransferModalVisible(false);
      setRecipient("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error transferring NFT:", error);
      message.error("Failed to transfer NFT.");
    }
  };

  const handleSellClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedNft(null);
    setSalePrice("");
  };

  const handleConfirmListing = async () => {
    if (!selectedNft || !salePrice) return;

    try {
      const priceInOctas = parseFloat(salePrice) * 100000000;

      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::list_for_sale`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), priceInOctas.toString()],
      };

      // Bypass type checking
      const response = await (window as any).aptos.signAndSubmitTransaction(entryFunctionPayload);
      await client.waitForTransaction(response.hash);

      message.success("NFT listed for sale successfully!");
      setIsModalVisible(false);
      setSalePrice("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      message.error("Failed to list NFT for sale.");
    }
  };

  // Add rent handler
  const handleRentClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsRentModalVisible(true);
  };

  // Add confirm rent listing handler
  const handleConfirmRentListing = async () => {
    if (!selectedNft || !rentPrice) return;

    try {
      const priceInOctas = parseFloat(rentPrice);

      const payload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::list_for_rent`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), priceInOctas.toString()],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(payload);
      await client.waitForTransaction(response.hash);

      message.success("NFT listed for rent successfully!");
      setIsRentModalVisible(false);
      setRentPrice("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error listing NFT for rent:", error);
      message.error("Failed to list NFT for rent.");
    }
  };

  useEffect(() => {
    fetchUserNFTs();
  }, [fetchUserNFTs, currentPage]);

  const paginatedNFTs = nfts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Title level={2} style={{ marginBottom: "20px" }}>My Collection</Title>
      <p>Your personal collection of NFTs.</p>

      {/* Card Grid */}
      <Row
        gutter={[24, 24]}
        style={{
          marginTop: 20,
          width: "100%",
          maxWidth: "100%",
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {paginatedNFTs.map((nft) => (
          <Col
            key={nft.id}
            xs={24} sm={12} md={8} lg={8} xl={6}
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Card
              hoverable
              style={{
                width: "100%",
                maxWidth: "280px", // Increase max width to improve spacing
                minWidth: "220px",  // Increase minimum width to prevent stacking
                margin: "0 auto",
              }}
              cover={<img alt={nft.name} src={nft.uri} />}
              actions={[
                <Button type="link" onClick={() => handleSellClick(nft)}>
                  Sell
                </Button>,
                <Button type="link" onClick={() => handleTransferClick(nft)}>
                  Transfer
                </Button>,
                <Button type="link" onClick={() => handleRentClick(nft)}>
                  Rent Out
                </Button>
              ]}
            >
              <Meta title={nft.name} description={`Rarity: ${nft.rarity}, Price: ${nft.price} APT`} />
              <p>ID: {nft.id}</p>
              <p>{nft.description}</p>
              <p style={{ margin: "10px 0" }}>For Sale: {nft.for_sale ? "Yes" : "No"}</p>
              {nft.is_rented && (
                <Tag color="orange">Rented until {calculateRemainingHours(nft.rent_end_time) / 100000000} hours</Tag>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{ marginTop: 30, marginBottom: 30 }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={totalNFTs}
          onChange={(page) => setCurrentPage(page)}
          style={{ display: "flex", justifyContent: "center" }}
        />
      </div>

      <Modal
        title="Sell NFT"
        visible={isModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmListing}>
            Confirm Listing
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Description:</strong> {selectedNft.description}</p>
            <p><strong>Rarity:</strong> {selectedNft.rarity}</p>
            <p><strong>Current Price:</strong> {selectedNft.price} APT</p>

            <Input
              type="number"
              placeholder="Enter sale price in APT"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </Modal>

      <Modal
        title="Rent Out NFT"
        visible={isRentModalVisible}
        onCancel={() => setIsRentModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsRentModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmRentListing}>
            Confirm Listing
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <Input
              type="number"
              placeholder="Enter hourly rent price in APT"
              value={rentPrice}
              onChange={(e) => setRentPrice(e.target.value)}
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </Modal>


      <Modal
        title="Transfer NFT"
        visible={isTransferModalVisible}
        onCancel={() => {
          setIsTransferModalVisible(false);
          setRecipient("");
        }}
        footer={[
          <Button key="cancel" onClick={() => setIsTransferModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleTransfer}>
            Transfer
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <Input
              placeholder="Enter recipient address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </Modal>

    </div>
  );
};

export default MyNFTs;