# Aptos-based NFT Marketplace Project

## Overview
The NFT Marketplace project is a blockchain-based application built on Aptos that facilitates the minting, buying, selling, and renting of NFTs. The marketplace allows users to manage their NFTs with advanced features such as rental functionality and direct transfers between users.

## Video Demo

 <a href="https://youtu.be/W0hh2FeKp0Y" target="_blank">
    <img src="https://github.com/Rajput-Monty/aptosq4-move-bounty/blob/main/icon.jpeg" alt="NFT Marketplace Video" width="350" height="350"/>
  </a>
  
## New Features

### 1. NFT Renting Functionality

The NFT renting functionality enables users to temporarily lease their NFTs for a specified duration. This feature supports NFT owners in earning revenue by renting out their assets and allows renters to use NFTs without full ownership costs. Below is the explanation of this feature along with the associated code.

---

#### **Key Components**

1. **Listing NFTs for Rent**  
   Owners can list their NFTs for rent by specifying the rental price per hour. The NFT must not already be rented or listed for sale.

   ```move
   public entry fun list_for_rent(
       account: &signer,
       marketplace_addr: address,
       nft_id: u64,
       rent_price_per_hour: u64
   ) acquires Marketplace {
       let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
       
       let nft = &marketplace.nfts.borrow_mut()[nft_id];
       assert!(nft.owner == signer::address_of(account), 1); // Ensure caller is the owner
       assert!(!nft.is_rented, 2); // Ensure NFT is not currently rented
       assert!(!nft.is_listed_for_sale, 3); // Ensure NFT is not listed for sale

       nft.is_listed_for_rent = true;
       nft.rent_price_per_hour = rent_price_per_hour;
   }
   ```

2. **Renting NFTs**  
   Renters can lease an NFT by specifying the rental duration and paying the total rent.

   ```move
   public entry fun rent_nft(
       account: &signer,
       marketplace_addr: address,
       nft_id: u64,
       hours: u64,
       payment: u64
   ) acquires Marketplace {
       let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
       
       let nft = &marketplace.nfts.borrow_mut()[nft_id];
       assert!(nft.is_listed_for_rent, 1); // Ensure NFT is listed for rent
       assert!(!nft.is_rented, 2); // Ensure NFT is not already rented
       let total_rent = nft.rent_price_per_hour * hours;
       assert!(payment >= total_rent, 3); // Ensure payment covers rent

       nft.is_rented = true;
       nft.renter = signer::address_of(account);
       nft.rental_end_time = blockchain::now() + (hours * 3600); // Set rental end time
       
       // Transfer payment to owner
       let owner = nft.owner;
       coin::transfer(account, owner, total_rent);
   }
   ```

3. **Returning NFTs After Rental**  
   When the rental period ends, the NFT is returned to the owner, and its status is reset.

   ```move
   public entry fun return_rented_nft(
       marketplace_addr: address,
       nft_id: u64
   ) acquires Marketplace {
       let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);

       let nft = &marketplace.nfts.borrow_mut()[nft_id];
       assert!(nft.is_rented, 1); // Ensure NFT is currently rented
       assert!(blockchain::now() >= nft.rental_end_time, 2); // Ensure rental period has ended

       nft.is_rented = false;
       nft.renter = none();
       nft.rental_end_time = 0;
   }
   ```

4. **Rental Details Retrieval**  
   Users can fetch rental details for any NFT, such as the current renter and rental expiration time.

   ```move
   #[view]
   public fun get_rental_details(
       marketplace_addr: address,
       nft_id: u64
   ): (bool, address, u64, u64) acquires Marketplace {
       let marketplace = borrow_global<Marketplace>(marketplace_addr);

       let nft = &marketplace.nfts[nft_id];
       (nft.is_rented, nft.renter, nft.rent_price_per_hour, nft.rental_end_time)
   }
   ```

---

#### **Benefits**
- **For NFT Owners:** Generate income by renting out assets.  
- **For Renters:** Access NFTs temporarily without purchasing them outright.  

### 2. Direct NFT Transfer Functionality

This feature allows NFT owners to transfer ownership of their NFTs directly to another user without requiring a sale. It enables secure and seamless peer-to-peer transfers, facilitating gifting, donations, or simple transfers within the marketplace.

---

#### **Key Components**

1. **Transfer Ownership**  
   Owners can transfer their NFTs to another user by specifying the recipient's address. The recipient cannot be the sender or a null address.

   ```move
   public entry fun transfer_nft(
       account: &signer,
       marketplace_addr: address,
       nft_id: u64,
       recipient: address
   ) acquires Marketplace {
       let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);

       let nft = &marketplace.nfts.borrow_mut()[nft_id];
       assert!(nft.owner == signer::address_of(account), 1); // Ensure caller is the owner
       assert!(recipient != signer::address_of(account), 2); // Prevent self-transfer
       assert!(recipient != @0x0, 3); // Ensure recipient is not a null address

       nft.owner = recipient;
       nft.is_listed_for_sale = false; // Reset sale status
       nft.price = 0; // Clear price
       nft.is_listed_for_rent = false; // Reset rental status
       nft.rent_price_per_hour = 0; // Clear rental price
       nft.is_rented = false; // Ensure NFT is not rented
       nft.renter = none();
       nft.rental_end_time = 0; // Clear rental end time
   }
   ```

2. **Validation Checks**  
   Several validation checks are enforced to ensure secure and valid transfers:  
   - **Caller Validation:** The caller must be the NFT owner.  
   - **Recipient Validation:** Transfers to the sender’s own address or a null address are prohibited.  

---

#### **Benefits**
- **For Users:**  
  - Transfer NFTs securely without involving monetary transactions.  
  - Enable gifting or donations within the marketplace ecosystem.  
- **For the Marketplace:**  
  - Promotes peer-to-peer engagement and interaction.  

### 3. Searching, Sorting, and Filtering Functionality

This feature allows users to search for NFTs, sort them by different criteria (e.g., name, price), and filter them by rarity, enabling them to easily find and browse the NFTs that meet their preferences. The implementation provides a highly interactive and customizable experience for users in the marketplace.

---

#### **Key Components**

1. **Searching NFTs**  
   Users can search for NFTs by name, ID, or price. The search input dynamically filters the NFTs based on the text entered, offering a responsive experience.

   ```jsx
   <Search
     placeholder="Search by name, ID, or price"
     allowClear
     style={{ width: 300 }}
     onChange={(e) => {
       setSearchTerm(e.target.value);
       setCurrentPage(1); // Reset to first page after search
     }}
   />
   ```

   - **Search Term:** The `searchTerm` state tracks the input. As the user types, the `getFilteredNFTs` function filters the NFTs that match the search term in any of the specified fields (name, ID, price).

   ```javascript
   const getFilteredNFTs = (nftList: NFT[]) => {
     if (!searchTerm) return nftList;
     const lowercaseSearch = searchTerm.toLowerCase();
     return nftList.filter(nft =>
       nft.name.toLowerCase().includes(lowercaseSearch) ||
       nft.id.toString().includes(lowercaseSearch) ||
       nft.price.toString().includes(lowercaseSearch)
     );
   };
   ```

2. **Sorting NFTs**  
   Users can sort the NFTs by different criteria: name, ID, or price. This is achieved through the `Select` component, where the user can choose their preferred sorting option. The `getSortedNFTs` function handles the sorting logic based on the selected option and direction.

   ```jsx
   <Select
     style={{ width: 200 }}
     value={sortBy}
     onChange={(value: SortOption) => {
       setSortBy(value);
       setCurrentPage(1); // Reset to first page after sort change
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
         setCurrentPage(1); // Reset to first page after sort direction change
       }}
     >
       <Option value="asc">Ascending</Option>
       <Option value="desc">Descending</Option>
     </Select>
   )}
   ```

   - **Sorting Logic:** The `getSortedNFTs` function sorts the NFTs array based on the selected field (`name`, `id`, `price`) and direction (`asc` or `desc`).

   ```javascript
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
   ```

   - **Filtering Logic:** The `handleFetchNfts` function fetches the NFTs from the blockchain and applies the rarity filter if one is selected, using the `rarity` state.

   ```javascript
   const handleFetchNfts = async (selectedRarity: number | undefined) => {
     try {
       const response = await client.getAccountResource(
         marketplaceAddr,
         "nft-address::NFTMarketplace::Marketplace"
       );
       const nftList = (response.data as { nfts: NFT[] }).nfts;
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
   ```

---

#### **Benefits**
- **For Users:**
  - **Efficient Searching:** Quickly find NFTs based on various attributes (name, ID, price).
  - **Customizable Sorting:** Sort NFTs by name, ID, or price to better navigate the marketplace.
  
- **For the Marketplace:**
  - **Improved User Experience:** Provides a streamlined way for users to discover NFTs that fit their interests, enhancing engagement and retention.
  - **Scalability:** The filtering, sorting, and searching features can easily scale with more NFTs in the marketplace, allowing users to find what they need quickly.

This feature significantly improves the usability of the marketplace by offering flexible, interactive options for users to explore and interact with NFTs.
