/* eslint-disable no-unused-expressions, node/no-missing-import  */
import { expect } from "chai";
import { ethers } from "hardhat";
// @ts-expect-error
import nftArtifact from "../../../nft-collection/backend/artifacts/contracts/CryptoDevs.sol/CryptoDevs.json";
// @ts-expect-error
import whitelistArtifact from "../../../whitelist-dapp/hardhat-tutorial/artifacts/contracts/Whitelist.sol/Whitelist.json";
import { CryptoDevs } from "../../../nft-collection/backend/typechain/";
import { Whitelist } from "../../../whitelist-dapp/hardhat-tutorial/typechain/";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CryptoDevsDAO } from "../typechain/CryptoDevsDAO";
import { FakeNFTMarketplace } from "../typechain";

enum VoteEnum {
  Yay,
  No,
}

const tenMinutes = 60 * 60 * 10;

describe("Crypto Devs DAO", function () {
  let owner: SignerWithAddress;
  let minter1: SignerWithAddress;
  let whitelist: Whitelist;
  let nft: CryptoDevs;
  let dao: CryptoDevsDAO;
  let market: FakeNFTMarketplace;

  beforeEach(async () => {
    [owner, minter1] = await ethers.getSigners();
    // contracts
    const CryptoDevDAO = await ethers.getContractFactory("CryptoDevsDAO");
    const FakeNFTMarketplaceContract = await ethers.getContractFactory(
      "FakeNFTMarketplace"
    );
    const NFTCollection = await ethers.getContractFactoryFromArtifact(
      nftArtifact,
      {
        signer: owner,
      }
    );
    const Whitelist = await ethers.getContractFactoryFromArtifact(
      whitelistArtifact
    );
    // deployed contracts
    whitelist = (await Whitelist.deploy(10)) as Whitelist;
    await whitelist.deployed();
    await whitelist.connect(minter1).addAddressToWhitelist();
    nft = (await NFTCollection.deploy(
      "someurl",
      whitelist.address
    )) as CryptoDevs;
    await nft.deployed();

    market = (await FakeNFTMarketplaceContract.deploy()) as FakeNFTMarketplace;
    await market?.deployed();

    dao = (await CryptoDevDAO.deploy(
      market.address,
      nft?.address
    )) as CryptoDevsDAO;
    await dao?.deployed();
  });

  it("Should have a way to set the proposal deadline threshold", async () => {
    expect(await dao?.proposalDeadlineThreshold()).to.equal(5);
  });

  it("Should allow owner to update deadline threshold", async () => {
    await dao?.setProposalDeadlineThreshold(ethers?.BigNumber.from(10));

    expect(await dao?.proposalDeadlineThreshold()).to.equal(10);

    await expect(
      dao
        .connect(minter1)
        .setProposalDeadlineThreshold(ethers?.BigNumber.from(10))
    ).to.be.revertedWith("Ownable: caller is not the owner");

    expect(await dao?.proposalDeadlineThreshold()).to.equal(10);
  });

  it("Should allow an only NFT holder to make a new proposal", async () => {
    expect(await dao.numProposals()).to.equal(0);
    await expect(dao.createProposal(1)).to.be.revertedWith("NOT_A_DAO_MEMBER");
    expect(await dao.numProposals()).to.equal(0);

    await nft.startPresale();

    await ethers.provider.send("evm_increaseTime", [tenMinutes]);
    await ethers.provider.send("evm_mine", []);

    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });

    expect(await nft.balanceOf(minter1.address)).to.equal(2);

    await dao.connect(minter1).createProposal(1);

    expect(await dao.numProposals()).to.equal(1);

    const newProposal = await dao.proposals(0);

    expect(newProposal.nftTokenId.toNumber()).to.equal(1);
  });

  it("Should allow only NFT holders to vote on a proposal", async () => {
    await nft.startPresale();
    await ethers.provider.send("evm_increaseTime", [tenMinutes]);
    await ethers.provider.send("evm_mine", []);
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await dao.connect(minter1).createProposal(1);

    await expect(dao.voteOnProposal(0, 1)).to.be.revertedWith(
      "NOT_A_DAO_MEMBER"
    );

    await dao.connect(minter1).voteOnProposal(0, VoteEnum.Yay);

    const proposal = await dao.proposals(0);

    expect(proposal.nftTokenId.toNumber()).to.equal(1);
    expect(proposal.yayVotes.toNumber()).to.equal(2);
  });

  it("Should not allow voting on a proposal that does not exist", async () => {
    await nft.startPresale();
    await ethers.provider.send("evm_increaseTime", [tenMinutes]);
    await ethers.provider.send("evm_mine", []);
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await dao.connect(minter1).createProposal(1);

    await expect(
      dao.connect(minter1).voteOnProposal(2, VoteEnum.Yay)
    ).to.be.revertedWith("PROPOSAL_DOES_NOT_EXIST");
  });

  it("should not allow voting after deadline passed", async () => {
    await nft.startPresale();
    await ethers.provider.send("evm_increaseTime", [tenMinutes]);
    await ethers.provider.send("evm_mine", []);
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await nft.connect(minter1).mint({
      value: ethers.utils.parseEther("0.01"),
    });
    await dao.connect(minter1).createProposal(1);
    await ethers.provider.send("evm_increaseTime", [tenMinutes]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      dao.connect(minter1).voteOnProposal(0, VoteEnum.Yay)
    ).to.be.revertedWith("DEADLINE_EXCEEDED");
  });
});
