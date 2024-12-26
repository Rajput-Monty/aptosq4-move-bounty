import React, { useState, useEffect } from "react";
import { Typography, Radio, message, Card, Row, Col, Pagination, Tag, Button, Modal, Input, Select } from "antd";
import { AptosClient } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Title } = Typography;
const { Meta } = Card;
const { Search } = Input;
const { Option } = Select;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v11");

const calculateRemainingHours = (endTime: number): number => {
  // Convert the blockchain timestamp to the correct format
  const currentTime = Math.floor(Date.now() / 1000);
  const remainingSeconds = endTime - currentTime;
  return Math.max(0, Math.ceil(remainingSeconds / 3600));
};


type NFT = {
  id: number;
  owner: string;
  name: string;
  description: string;
  uri: string;
  price: number;
  for_sale: boolean;
  rarity: number;
  is_rented: boolean;
  rent_price_per_hour: number;
  rent_end_time: number;
};

interface MarketViewProps {
  marketplaceAddr: string;
}


type SortOption = 'name' | 'id' | 'price' | 'none';
type SortDirection = 'asc' | 'desc';


const rarityColors: { [key: number]: string } = {
  1: "green",
  2: "blue",
  3: "purple",
  4: "orange",
};

const rarityLabels: { [key: number]: string } = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Super Rare",
};

const truncateAddress = (address: string, start = 6, end = 4) => {
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const MarketView: React.FC<MarketViewProps> = ({ marketplaceAddr }) => {
  const { signAndSubmitTransaction } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [rarity, setRarity] = useState<'all' | number>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [isBuyModalVisible, setIsBuyModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);

  const [isRentModalVisible, setIsRentModalVisible] = useState(false);
  const [rentDuration, setRentDuration] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    handleFetchNfts(undefined);
  }, []);

  const getSortedNFTs = (nftList: NFT[]) => {
    if (sortBy === 'none') return nftList;

    return [...nftList].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'id':
          comparison = a.id - b.id;
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        default:
          return 0;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const getFilteredNFTs = (nftList: NFT[]) => {
    if (!searchTerm) return nftList;

    const lowercaseSearch = searchTerm.toLowerCase();
    return nftList.filter(nft =>
      nft.name.toLowerCase().includes(lowercaseSearch) ||
      nft.id.toString().includes(lowercaseSearch) ||
      nft.price.toString().includes(lowercaseSearch)
    );
  };

  const handleFetchNfts = async (selectedRarity: number | undefined) => {
    try {
      const response = await client.getAccountResource(
        marketplaceAddr,
        "nft-address::NFTMarketplace::Marketplace"
      );
      const nftList = (response.data as { nfts: NFT[] }).nfts;

      const hexToUint8Array = (hexString: string): Uint8Array => {
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return bytes;
      };

      const decodedNfts = nftList.map((nft) => ({
        ...nft,
        name: new TextDecoder().decode(hexToUint8Array(nft.name.slice(2))),
        description: new TextDecoder().decode(hexToUint8Array(nft.description.slice(2))),
        uri: new TextDecoder().decode(hexToUint8Array(nft.uri.slice(2))),
        price: nft.price / 100000000,
      }));

      const availableNfts = decodedNfts.filter(nft =>
        nft.for_sale === true ||
        (nft.rent_price_per_hour > 0 && !nft.is_rented)
      );

      // Apply rarity filter if selected
      const filteredNfts = selectedRarity === undefined
        ? availableNfts
        : availableNfts.filter(nft => nft.rarity === selectedRarity);

      setNfts(filteredNfts);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error fetching NFTs by rarity:", error);
      message.error("Failed to fetch NFTs.");
    }
  };

  const handleBuyClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsBuyModalVisible(true);
  };

  const handleCancelBuy = () => {
    setIsBuyModalVisible(false);
    setSelectedNft(null);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedNft) return;

    try {
      const priceInOctas = selectedNft.price * 100000000;

      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::purchase_nft`,
        type_arguments: [],
        arguments: [marketplaceAddr, selectedNft.id.toString(), priceInOctas.toString()],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(entryFunctionPayload);
      await client.waitForTransaction(response.hash);

      message.success("NFT purchased successfully!");
      setIsBuyModalVisible(false);
      handleFetchNfts(rarity === 'all' ? undefined : rarity); // Refresh NFT list
      console.log("signAndSubmitTransaction:", signAndSubmitTransaction);
    } catch (error) {
      console.error("Error purchasing NFT:", error);
      message.error("Failed to purchase NFT.");
    }
  };


  const handleRentClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsRentModalVisible(true);
  };

  const handleConfirmRent = async () => {
    if (!selectedNft || !rentDuration) return;

    try {

      const hours = parseInt(rentDuration);
      const hourlyRateInOctas = BigInt(selectedNft.rent_price_per_hour * 100000000);
      const totalCostInOctas = hourlyRateInOctas * BigInt(hours);

      const payload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::rent_nft`,
        type_arguments: [],
        arguments: [
          marketplaceAddr,
          selectedNft.id.toString(),
          hourlyRateInOctas.toString(),
          totalCostInOctas.toString()
        ],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(payload);
      await client.waitForTransaction(response.hash);

      message.success("NFT rented successfully!");
      setIsRentModalVisible(false);
      setRentDuration("");
      handleFetchNfts(rarity === 'all' ? undefined : rarity);
    } catch (error) {
      console.error("Error renting NFT:", error);
      message.error("Failed to rent NFT.");
    }
  };

  const filteredNFTs = getFilteredNFTs(nfts);
  const sortedNFTs = getSortedNFTs(filteredNFTs);

  const paginatedNfts = sortedNFTs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Title level={2} style={{ marginBottom: "20px" }}>Marketplace</Title>

      {/* Filter Buttons */}
      <div style={{ marginBottom: "20px" }}>
        <Radio.Group
          value={rarity}
          onChange={(e) => {
            const selectedRarity = e.target.value;
            setRarity(selectedRarity);
            handleFetchNfts(selectedRarity === 'all' ? undefined : selectedRarity);
          }}
          buttonStyle="solid"
        >
          <Radio.Button value="all">All</Radio.Button>
          <Radio.Button value={1}>Common</Radio.Button>
          <Radio.Button value={2}>Uncommon</Radio.Button>
          <Radio.Button value={3}>Rare</Radio.Button>
          <Radio.Button value={4}>Super Rare</Radio.Button>
        </Radio.Group>
      </div>

      {/* Search and Sort Controls */}
      <div style={{
        marginBottom: "20px",
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
        justifyContent: "center",
        width: "100%",
        maxWidth: "800px"
      }}>
        <Search
          placeholder="Search by name, ID, or price"
          allowClear
          style={{ width: 300 }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />

        <Select
          style={{ width: 200 }}
          value={sortBy}
          onChange={(value: SortOption) => {
            setSortBy(value);
            setCurrentPage(1);
          }}
        >
          <Option value="none">No Sorting</Option>
          <Option value="name">Sort by Name</Option>
          <Option value="id">Sort by ID</Option>
          <Option value="price">Sort by Price</Option>
        </Select>

        {sortBy !== 'none' && (
          <Select
            style={{ width: 120 }}
            value={sortDirection}
            onChange={(value: SortDirection) => {
              setSortDirection(value);
              setCurrentPage(1);
            }}
          >
            <Option value="asc">Ascending</Option>
            <Option value="desc">Descending</Option>
          </Select>
        )}
      </div>

      {/* Card Grid */}
      <Row
        gutter={[24, 24]}
        style={{
          marginTop: 20,
          width: "100%",
          display: "flex",
          justifyContent: "center", // Center row content
          flexWrap: "wrap",
        }}
      >
        {paginatedNfts.map((nft) => (
          <Col
            key={nft.id}
            xs={24} sm={12} md={8} lg={6} xl={6}
            style={{
              display: "flex",
              justifyContent: "center", // Center the single card horizontally
              alignItems: "center", // Center content in both directions
            }}
          >
            <Card
              hoverable
              style={{
                width: "100%", // Make the card responsive
                maxWidth: "240px", // Limit the card width on larger screens
                margin: "0 auto",
              }}
              cover={<img alt={nft.name} src={nft.uri} />}
              actions={[
                nft.for_sale && (
                  <Button type="link" onClick={() => handleBuyClick(nft)}>
                    Buy ({nft.price} APT)
                  </Button>
                ),
                !nft.for_sale && !nft.is_rented && nft.rent_price_per_hour > 0 && (
                  <Button type="link" onClick={() => handleRentClick(nft)}>
                    Rent ({nft.rent_price_per_hour} APT/hr)
                  </Button>
                ),
                nft.is_rented && (
                  <Button type="link" disabled>
                    Currently Rented
                  </Button>
                )
              ].filter(Boolean)}
            >
              {/* Rarity Tag */}
              <Tag
                color={rarityColors[nft.rarity]}
                style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}
              >
                {rarityLabels[nft.rarity]}
              </Tag>

              <Meta title={nft.name} description={`Price: ${nft.price} APT`} />
              <p>{nft.description}</p>
              <p>ID: {nft.id}</p>
              <p>Owner: {truncateAddress(nft.owner)}</p>
              {nft.is_rented && (
                <Tag color="orange">Rented until {calculateRemainingHours(nft.rent_end_time) / 100000000} hours</Tag>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {/* Pagination */}
      <div style={{ marginTop: 30, marginBottom: 30 }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={filteredNFTs.length}
          onChange={(page) => setCurrentPage(page)}
          style={{ display: "flex", justifyContent: "center" }}
        />
      </div>

      {/* Buy Modal */}
      <Modal
        title="Purchase NFT"
        visible={isBuyModalVisible}
        onCancel={handleCancelBuy}
        footer={[
          <Button key="cancel" onClick={handleCancelBuy}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmPurchase}>
            Confirm Purchase
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Description:</strong> {selectedNft.description}</p>
            <p><strong>Rarity:</strong> {rarityLabels[selectedNft.rarity]}</p>
            <p><strong>Price:</strong> {selectedNft.price} APT</p>
            <p><strong>Owner:</strong> {truncateAddress(selectedNft.owner)}</p>
          </>
        )}
      </Modal>

      <Modal
        title="Rent NFT"
        visible={isRentModalVisible}
        onCancel={() => {
          setIsRentModalVisible(false);
          setRentDuration("");
        }}
        footer={[
          <Button key="cancel" onClick={() => setIsRentModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmRent}>
            Confirm Rental
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p><strong>NFT ID:</strong> {selectedNft.id}</p>
            <p><strong>Name:</strong> {selectedNft.name}</p>
            <p><strong>Hourly Rate:</strong> {selectedNft.rent_price_per_hour} APT</p>
            <Input
              type="number"
              placeholder="Enter rental duration in hours"
              value={rentDuration}
              onChange={(e) => setRentDuration(e.target.value)}
              style={{ marginTop: 10 }}
            />
            {rentDuration && (
              <p><strong>Total Cost:</strong> {
                parseFloat(rentDuration) * selectedNft.rent_price_per_hour
              } APT</p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default MarketView;