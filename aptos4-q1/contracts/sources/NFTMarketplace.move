// TODO# 1: Define Module and Marketplace Address
address <nft-address> {

    module NFTMarketplace {
        use 0x1::signer;
        use 0x1::vector;
        use 0x1::coin;
        use 0x1::aptos_coin;
        use 0x1::timestamp;

        // TODO# 2: Define NFT Structure
               struct NFT has store, key {
            id: u64,
            owner: address,
            name: vector<u8>,
            description: vector<u8>,
            uri: vector<u8>,
            price: u64,
            for_sale: bool,
            rarity: u8,  // 1 for common, 2 for rare, 3 for epic, etc.
            is_rented: bool, // Indicates if NFT is rented
            renter: address, // Current renter's address
            rent_end_time: u64, // Rental end time (Unix timestamp)
            rent_price_per_hour: u64 // Rental price per hour in APT
        }


        // TODO# 3: Define Marketplace Structure
                struct Marketplace has key {
            nfts: vector<NFT>
        }

        
        // TODO# 4: Define ListedNFT Structure
                struct ListedNFT has copy, drop {
            id: u64,
            price: u64,
            rarity: u8
        }


        // TODO# 5: Set Marketplace Fee
                const MARKETPLACE_FEE_PERCENT: u64 = 2; // 2% fee



        // TODO# 6: Initialize Marketplace 
                public entry fun initialize(account: &signer) {
            let marketplace = Marketplace {
                nfts: vector::empty<NFT>()
            };
            move_to(account, marketplace);
        }       


        // TODO# 7: Check Marketplace Initialization
                #[view]
        public fun is_marketplace_initialized(marketplace_addr: address): bool {
            exists<Marketplace>(marketplace_addr)
        }

        // Function to list an NFT for rent
        public entry fun list_for_rent(
             account: &signer,
             marketplace_addr: address,
             nft_id: u64,
             rent_price_per_hour: u64
         ) acquires Marketplace {
             let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
             let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);
    
             assert!(nft_ref.owner == signer::address_of(account), 100); // Caller is not the owner
             assert!(!nft_ref.is_rented, 101); // NFT is already rented
             assert!(rent_price_per_hour > 0, 102); // Invalid rent price
    
             nft_ref.is_rented = false; // Mark as available for rent
             nft_ref.rent_price_per_hour = rent_price_per_hour;
         }

        // Function to rent an NFT
        public entry fun rent_nft(
            account: &signer,
            marketplace_addr: address,
            nft_id: u64,
            hours: u64,
            payment: u64
        ) acquires Marketplace {
            let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
            let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);
    
            assert!(nft_ref.for_sale == false, 200); // NFT is not listed for sale
            assert!(!nft_ref.is_rented, 201); // NFT is already rented
            assert!(hours > 0, 202); // Invalid rental duration

            let total_rent_cost = hours * nft_ref.rent_price_per_hour;
            assert!(payment >= total_rent_cost, 203); // Insufficient payment

            // Transfer payment to the owner
            coin::transfer<aptos_coin::AptosCoin>(account, nft_ref.owner, payment);

            // Update NFT rental details
            nft_ref.is_rented = true;
            nft_ref.renter = signer::address_of(account);
            nft_ref.rent_end_time = timestamp::now_seconds() + (hours * 3600); // Set end time
        }

            // Function to return NFT after rental period
            public entry fun return_rented_nft(
                marketplace_addr: address,
                nft_id: u64
            ) acquires Marketplace {
                let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
                let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

                assert!(nft_ref.is_rented, 300); // NFT is not rented
                assert!(timestamp::now_seconds() >= nft_ref.rent_end_time, 301); // Rental period not over

                // Reset rental details
                nft_ref.is_rented = false;
                nft_ref.renter = @0x0;
                nft_ref.rent_end_time = 0;
            }

            // View function to check if NFT is rented
            #[view]
            public fun is_nft_rented(marketplace_addr: address, nft_id: u64): bool acquires Marketplace {
                let marketplace = borrow_global<Marketplace>(marketplace_addr);
                let nft = vector::borrow(&marketplace.nfts, nft_id);
                nft.is_rented
            }

            // Function to get all rented NFTs for a user
            #[view]
            public fun get_rented_nfts(marketplace_addr: address, renter_addr: address): vector<u64> acquires Marketplace {
                let marketplace = borrow_global<Marketplace>(marketplace_addr);
                let nft_ids = vector::empty<u64>();

                let nfts_len = vector::length(&marketplace.nfts);
                let mut_i = 0;
                while (mut_i < nfts_len) {
                    let nft = vector::borrow(&marketplace.nfts, mut_i);
                    if (nft.is_rented && nft.renter == renter_addr) {
                        vector::push_back(&mut nft_ids, nft.id);
                    };
                    mut_i = mut_i + 1;
                };

                nft_ids
            }


            // View function to get rental details of an NFT
            #[view]
            public fun get_rental_details(marketplace_addr: address, nft_id: u64): (bool, address, u64, u64) acquires Marketplace {
                let marketplace = borrow_global<Marketplace>(marketplace_addr);
                let nft = vector::borrow(&marketplace.nfts, nft_id);
                (nft.is_rented, nft.renter, nft.rent_end_time, nft.rent_price_per_hour)
            }




                // TODO# 8: Mint New NFT
            public entry fun mint_nft(
                account: &signer, 
                name: vector<u8>, 
                description: vector<u8>, 
                uri: vector<u8>, 
                rarity: u8
            ) acquires Marketplace {
                let marketplace = borrow_global_mut<Marketplace>(signer::address_of(account));
                let nft_id = vector::length(&marketplace.nfts);

                let new_nft = NFT {
                    id: nft_id,
                    owner: signer::address_of(account),
                    name,
                    description,
                    uri,
                    price: 0,
                    for_sale: false,
                    rarity,
                    is_rented: false,               // Not rented initially
                    renter: @0x0,                   // Default to null address
                    rent_end_time: 0,               // No rental period
                    rent_price_per_hour: 0          // No rental price
                };

                vector::push_back(&mut marketplace.nfts, new_nft);
            }



            // TODO# 9: View NFT Details
            #[view]
            public fun get_nft_details(marketplace_addr: address, nft_id: u64): (u64, address, vector<u8>, vector<u8>, vector<u8>, u64, bool, u8) acquires Marketplace {
                let marketplace = borrow_global<Marketplace>(marketplace_addr);
                let nft = vector::borrow(&marketplace.nfts, nft_id);

                (nft.id, nft.owner, nft.name, nft.description, nft.uri, nft.price, nft.for_sale, nft.rarity)
            }

                // TODO# 9.1: Direct NFT Transfer Between Users
            public entry fun transfer_nft(account: &signer, marketplace_addr: address, nft_id: u64, recipient: address) acquires Marketplace {
                let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
                let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

                // Ensure the caller is the NFT owner
                assert!(nft_ref.owner == signer::address_of(account), 500); // Caller is not the owner
            
                // Prevent transferring to self
                assert!(nft_ref.owner != recipient, 501); // Cannot transfer to self

                // Ensure recipient is valid
                assert!(recipient != @0x0, 502); // Invalid recipient address

                // Transfer ownership
                nft_ref.owner = recipient;

                // Reset sale status and price
                nft_ref.for_sale = false;
                nft_ref.price = 0;
            }

        
        // TODO# 10: List NFT for Sale
                public entry fun list_for_sale(account: &signer, marketplace_addr: address, nft_id: u64, price: u64) acquires Marketplace {
            let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
            let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

            assert!(nft_ref.owner == signer::address_of(account), 100); // Caller is not the owner
            assert!(!nft_ref.for_sale, 101); // NFT is already listed
            assert!(price > 0, 102); // Invalid price

            nft_ref.for_sale = true;
            nft_ref.price = price;
        }


        // TODO# 11: Update NFT Price
                public entry fun set_price(account: &signer, marketplace_addr: address, nft_id: u64, price: u64) acquires Marketplace {
            let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
            let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

            assert!(nft_ref.owner == signer::address_of(account), 200); // Caller is not the owner
            assert!(price > 0, 201); // Invalid price

            nft_ref.price = price;
        }


        // TODO# 12: Purchase NFT
                public entry fun purchase_nft(account: &signer, marketplace_addr: address, nft_id: u64, payment: u64) acquires Marketplace {
            let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
            let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

            assert!(nft_ref.for_sale, 400); // NFT is not for sale
            assert!(payment >= nft_ref.price, 401); // Insufficient payment

            // Calculate marketplace fee
            let fee = (nft_ref.price * MARKETPLACE_FEE_PERCENT) / 100;
            let seller_revenue = payment - fee;

            // Transfer payment to the seller and fee to the marketplace
            coin::transfer<aptos_coin::AptosCoin>(account, marketplace_addr, seller_revenue);
            coin::transfer<aptos_coin::AptosCoin>(account, signer::address_of(account), fee);

            // Transfer ownership
            nft_ref.owner = signer::address_of(account);
            nft_ref.for_sale = false;
            nft_ref.price = 0;
        }


        // TODO# 13: Check if NFT is for Sale
                #[view]
        public fun is_nft_for_sale(marketplace_addr: address, nft_id: u64): bool acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nft = vector::borrow(&marketplace.nfts, nft_id);
            nft.for_sale
        }


        // TODO# 14: Get NFT Price
                #[view]
        public fun get_nft_price(marketplace_addr: address, nft_id: u64): u64 acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nft = vector::borrow(&marketplace.nfts, nft_id);
            nft.price
        }


        // TODO# 15: Transfer Ownership
                public entry fun transfer_ownership(account: &signer, marketplace_addr: address, nft_id: u64, new_owner: address) acquires Marketplace {
            let marketplace = borrow_global_mut<Marketplace>(marketplace_addr);
            let nft_ref = vector::borrow_mut(&mut marketplace.nfts, nft_id);

            assert!(nft_ref.owner == signer::address_of(account), 300); // Caller is not the owner
            assert!(nft_ref.owner != new_owner, 301); // Prevent transfer to the same owner

            // Update NFT ownership and reset its for_sale status and price
            nft_ref.owner = new_owner;
            nft_ref.for_sale = false;
            nft_ref.price = 0;
        }


        // TODO# 16: Retrieve NFT Owner
                #[view]
        public fun get_owner(marketplace_addr: address, nft_id: u64): address acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nft = vector::borrow(&marketplace.nfts, nft_id);
            nft.owner
        }


        // TODO# 17: Retrieve NFTs for Sale
                #[view]
        public fun get_all_nfts_for_owner(marketplace_addr: address, owner_addr: address, limit: u64, offset: u64): vector<u64> acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nft_ids = vector::empty<u64>();

            let nfts_len = vector::length(&marketplace.nfts);
            let end = min(offset + limit, nfts_len);
            let mut_i = offset;
            while (mut_i < end) {
                let nft = vector::borrow(&marketplace.nfts, mut_i);
                if (nft.owner == owner_addr) {
                    vector::push_back(&mut nft_ids, nft.id);
                };
                mut_i = mut_i + 1;
            };

            nft_ids
        }
 

        // TODO# 18: Retrieve NFTs for Sale
                #[view]
        public fun get_all_nfts_for_sale(marketplace_addr: address, limit: u64, offset: u64): vector<ListedNFT> acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nfts_for_sale = vector::empty<ListedNFT>();

            let nfts_len = vector::length(&marketplace.nfts);
            let end = min(offset + limit, nfts_len);
            let mut_i = offset;
            while (mut_i < end) {
                let nft = vector::borrow(&marketplace.nfts, mut_i);
                if (nft.for_sale) {
                    let listed_nft = ListedNFT { id: nft.id, price: nft.price, rarity: nft.rarity };
                    vector::push_back(&mut nfts_for_sale, listed_nft);
                };
                mut_i = mut_i + 1;
            };

            nfts_for_sale
        }


        // TODO# 19: Define Helper Function for Minimum Value
                // Helper function to find the minimum of two u64 numbers
        public fun min(a: u64, b: u64): u64 {
            if (a < b) { a } else { b }
        }


        // TODO# 20: Retrieve NFTs by Rarity
                // New function to retrieve NFTs by rarity
        #[view]
        public fun get_nfts_by_rarity(marketplace_addr: address, rarity: u8): vector<u64> acquires Marketplace {
            let marketplace = borrow_global<Marketplace>(marketplace_addr);
            let nft_ids = vector::empty<u64>();

            let nfts_len = vector::length(&marketplace.nfts);
            let mut_i = 0;
            while (mut_i < nfts_len) {
                let nft = vector::borrow(&marketplace.nfts, mut_i);
                if (nft.rarity == rarity) {
                    vector::push_back(&mut nft_ids, nft.id);
                };
                mut_i = mut_i + 1;
            };

            nft_ids
        }

    }
}
